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
} from "@modelcontextprotocol/sdk/types.js";
import type { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";
import type { Request, Response } from "express";
import type { DownstreamConfig } from "../types.js";
import type { Aggregator } from "./aggregator.js";
import type { Router } from "./router.js";
import type { Compressor } from "../compression/compressor.js";
import { Masker } from "../masking/index.js";
import { getLogger } from "../logger.js";

export interface DownstreamServerOptions {
  config: DownstreamConfig;
  aggregator: Aggregator;
  router: Router;
  compressor: Compressor;
}

/**
 * Downstream MCP server that clients connect to
 */
export class DownstreamServer {
  private server: Server;
  private config: DownstreamConfig;
  private aggregator: Aggregator;
  private router: Router;
  private compressor: Compressor;
  private transport: Transport | null = null;

  constructor(options: DownstreamServerOptions) {
    this.config = options.config;
    this.aggregator = options.aggregator;
    this.router = options.router;
    this.compressor = options.compressor;

    this.server = new Server(
      { name: "mcproxy-proxy", version: "0.1.0" },
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
    await this.server.close();
    logger.info("Downstream server stopped");
  }

  /**
   * Update the compressor (used during hot reload)
   */
  setCompressor(compressor: Compressor): void {
    this.compressor = compressor;
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

      const { result, goal, restorationMap } = await this.router.callTool(
        name,
        args || {}
      );

      // Compress the result using tool-specific policy and goal context
      const compressedResult = await this.compressor.compressToolResult(
        result,
        name,
        goal
      );

      // Restore original PII values before returning to client
      if (restorationMap && restorationMap.size > 0) {
        logger.debug(
          `Restoring ${restorationMap.size} masked value(s) before returning to client`
        );
        for (const content of compressedResult.content) {
          if (content.type === "text" && typeof content.text === "string") {
            content.text = Masker.restoreOriginals(content.text, restorationMap);
          }
        }
      }

      return compressedResult;
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
