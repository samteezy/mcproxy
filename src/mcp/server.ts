import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import {
  ListToolsRequestSchema,
  CallToolRequestSchema,
  ListResourcesRequestSchema,
  ReadResourceRequestSchema,
  ListPromptsRequestSchema,
  GetPromptRequestSchema,
  type CallToolResult,
} from "@modelcontextprotocol/sdk/types.js";
import type { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";
import type { Request, Response } from "express";
import type { DownstreamConfig, CacheConfig } from "../types.js";
import type { Aggregator } from "./aggregator.js";
import { Router } from "./router.js";
import { RetryTracker } from "./retry-tracker.js";
import type { Compressor } from "../compression/compressor.js";
import type { ToolConfigResolver } from "../config/index.js";
import { Masker } from "../masking/index.js";
import { MemoryCache, compressedResultCacheKey } from "../cache/index.js";
import { getLogger } from "../logger.js";
import { CLIENT_NAME, VERSION } from "../constants.js";

export interface DownstreamServerOptions {
  config: DownstreamConfig;
  aggregator: Aggregator;
  router: Router;
  compressor: Compressor;
  cache?: MemoryCache<CallToolResult>;
  cacheConfig?: CacheConfig;
  resolver?: ToolConfigResolver;
}

/**
 * Downstream MCP server that clients connect to
 */
export class DownstreamServer {
  private static readonly RETRY_CLEANUP_INTERVAL_MS = 60_000;

  private server: Server;
  private config: DownstreamConfig;
  private aggregator: Aggregator;
  private router: Router;
  private compressor: Compressor;
  private cache?: MemoryCache<CallToolResult>;
  private cacheConfig?: CacheConfig;
  private resolver?: ToolConfigResolver;
  private transport: Transport | null = null;
  private retryTracker: RetryTracker;
  private retryCleanupInterval?: ReturnType<typeof setInterval>;

  constructor(options: DownstreamServerOptions) {
    this.config = options.config;
    this.aggregator = options.aggregator;
    this.router = options.router;
    this.compressor = options.compressor;
    this.cache = options.cache;
    this.cacheConfig = options.cacheConfig;
    this.resolver = options.resolver;
    this.retryTracker = new RetryTracker();

    // Start retry tracker cleanup interval (every 60s by default)
    this.retryCleanupInterval = setInterval(() => {
      const retryConfig = this.resolver?.getRetryEscalation();
      this.retryTracker.cleanup(retryConfig?.windowSeconds ?? 300);
    }, DownstreamServer.RETRY_CLEANUP_INTERVAL_MS);

    this.server = new Server(
      { name: CLIENT_NAME, version: VERSION },
      {
        capabilities: {
          tools: { listChanged: true },
          resources: { listChanged: true },
          prompts: { listChanged: true },
        },
      }
    );

    this.registerHandlers();
  }

  /**
   * Start the downstream server
   */
  async start(): Promise<void> {
    const logger = getLogger();

    if (this.config.transport === "stdio") {
      this.transport = new StdioServerTransport();
      await this.server.connect(this.transport);
      logger.info("Downstream server started on stdio");
    } else {
      // For HTTP transports, we don't start here - use createHttpHandler
      logger.info(
        `Downstream server ready for ${this.config.transport} on port ${this.config.port}`
      );
    }
  }

  /**
   * Create an Express handler for HTTP transports
   */
  createHttpHandler(): (req: Request, res: Response) => Promise<void> {
    const logger = getLogger();

    return async (req: Request, res: Response) => {
      let transport: StreamableHTTPServerTransport | SSEServerTransport;

      if (this.config.transport === "streamable-http") {
        transport = new StreamableHTTPServerTransport({
          sessionIdGenerator: undefined,
          enableJsonResponse: true,
        });
      } else if (this.config.transport === "sse") {
        transport = new SSEServerTransport("/messages", res);
      } else {
        res.status(400).json({ error: "Invalid transport for HTTP" });
        return;
      }

      res.on("close", () => {
        transport.close();
      });

      try {
        await this.server.connect(transport);

        if (transport instanceof StreamableHTTPServerTransport) {
          await transport.handleRequest(req, res, req.body);
        }
        // SSE transport handles the response itself
      } catch (error) {
        logger.error("Error handling HTTP request:", error);
        if (!res.headersSent) {
          res.status(500).json({ error: "Internal server error" });
        }
      }
    };
  }

  /**
   * Stop the downstream server
   */
  async stop(): Promise<void> {
    const logger = getLogger();
    // Clear cleanup interval
    if (this.retryCleanupInterval) {
      clearInterval(this.retryCleanupInterval);
      this.retryCleanupInterval = undefined;
    }
    await this.server.close();
    logger.info("Downstream server stopped");
  }

  /**
   * Update the compressor (used during hot reload)
   */
  setCompressor(compressor: Compressor): void {
    this.compressor = compressor;
  }

  /**
   * Update the cache config (used during hot reload)
   */
  setCacheConfig(cacheConfig: CacheConfig): void {
    this.cacheConfig = cacheConfig;
  }

  /**
   * Update the resolver (used during hot reload)
   */
  setResolver(resolver: ToolConfigResolver): void {
    this.resolver = resolver;
  }

  private registerHandlers(): void {
    const logger = getLogger();

    // List tools - aggregate from all upstreams
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      logger.debug("Handling tools/list request");
      const tools = await this.aggregator.listTools();
      return { tools };
    });

    // Call tool - route to correct upstream and compress response
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;
      logger.info(`Handling tools/call request: ${name}`);

      // Extract goal for cache key (also extracted by router, but we need it early)
      const goalArg = args?.[Router.GOAL_FIELD];
      const goal = typeof goalArg === "string" ? goalArg : undefined;

      // Resolve cache policy for this tool
      const cachePolicy = this.resolver?.resolveCachePolicy(name);

      // Check cache if enabled for this tool
      if (this.cache && cachePolicy && cachePolicy.enabled) {
        const cacheKey = compressedResultCacheKey(name, args || {}, goal);
        const cached = this.cache.get(cacheKey);
        if (cached) {
          logger.debug(`Cache hit: ${name}`);
          return cached;
        }
      }

      const { result, bypass, restorationMap } = await this.router.callTool(
        name,
        args || {}
      );

      // Skip compression if bypass is requested
      let finalResult: CallToolResult;
      if (bypass) {
        logger.info(`Compression bypassed for tool: ${name}`);
        finalResult = result;
      } else {
        // Calculate retry escalation multiplier
        let escalationMultiplier: number | undefined;
        const retryConfig = this.resolver?.getRetryEscalation();
        if (retryConfig?.enabled) {
          // Record this call for retry tracking
          this.retryTracker.recordCall(name);
          escalationMultiplier = this.retryTracker.getEscalationMultiplier(
            name,
            retryConfig
          );
        }

        // Compress the result using tool-specific policy and goal context
        finalResult = await this.compressor.compressToolResult(
          result,
          name,
          goal,
          escalationMultiplier
        );
      }

      // Restore original PII values before returning to client
      if (restorationMap && restorationMap.size > 0) {
        logger.debug(
          `Restoring ${restorationMap.size} masked value(s) before returning to client`
        );
        for (const content of finalResult.content) {
          if (content.type === "text" && typeof content.text === "string") {
            content.text = Masker.restoreOriginals(content.text, restorationMap);
          }
        }
      }

      // Cache the compressed result if caching is enabled for this tool
      if (this.cache && cachePolicy && cachePolicy.enabled) {
        // Check if we should cache errors (default: true)
        const shouldCacheErrors = this.cacheConfig?.cacheErrors !== false;
        if (!finalResult.isError || shouldCacheErrors) {
          const cacheKey = compressedResultCacheKey(name, args || {}, goal);
          this.cache.set(cacheKey, finalResult, cachePolicy.ttlSeconds);
          logger.debug(`Cached result: ${name}`);
        }
      }

      return finalResult;
    });

    // List resources - aggregate from all upstreams
    this.server.setRequestHandler(ListResourcesRequestSchema, async () => {
      logger.debug("Handling resources/list request");
      const resources = await this.aggregator.listResources();
      return { resources };
    });

    // Read resource - route to correct upstream
    this.server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
      const { uri } = request.params;
      logger.debug(`Handling resources/read request: ${uri}`);

      const result = await this.router.readResource(uri);

      // Compress the result if needed
      return await this.compressor.compressResourceResult(result, uri);
    });

    // List prompts - aggregate from all upstreams
    this.server.setRequestHandler(ListPromptsRequestSchema, async () => {
      logger.debug("Handling prompts/list request");
      const prompts = await this.aggregator.listPrompts();
      return { prompts };
    });

    // Get prompt - route to correct upstream
    this.server.setRequestHandler(GetPromptRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;
      logger.debug(`Handling prompts/get request: ${name}`);

      return await this.router.getPrompt(name, args);
    });
  }
}
