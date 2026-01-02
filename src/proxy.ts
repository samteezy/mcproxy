import express from "express";
import type { CLIPConfig, UpstreamStatus } from "./types.js";
import { UpstreamClient, DownstreamServer, Aggregator, Router } from "./mcp/index.js";
import { Compressor } from "./compression/index.js";
import { Masker } from "./masking/index.js";
import { MemoryCache } from "./cache/index.js";
import { ToolConfigResolver, loadConfig } from "./config/index.js";
import { initLogger, getLogger } from "./logger.js";
import { generateHtml, registerApiRoutes } from "./web/index.js";

export interface CLIPProxy {
  start(): Promise<void>;
  stop(): Promise<void>;
  getStatus(): UpstreamStatus[];
  reload(newConfig: CLIPConfig): Promise<void>;
  getConfigPath(): string;
}

/**
 * Create and configure the CLIP proxy
 */
export async function createProxy(config: CLIPConfig, configPath: string): Promise<CLIPProxy> {
  const logger = initLogger(config.logLevel);
  logger.info("Initializing CLIP proxy");

  // Mutable state for hot reload
  let currentConfig = config;

  // Create tool config resolver for centralized policy lookups
  let resolver = new ToolConfigResolver(config);

  // Create core components
  const aggregator = new Aggregator({ resolver });
  let compressor = new Compressor(config.compression, resolver);

  // Create masker if configured
  let masker: Masker | undefined;
  if (config.masking?.enabled) {
    masker = new Masker(config.masking, resolver);
    logger.info("PII masking enabled");
  }

  const router = new Router(aggregator, masker);
  const cache = new MemoryCache(config.cache);

  // Create upstream clients
  let upstreamClients: UpstreamClient[] = [];

  for (const upstreamConfig of config.upstreams) {
    if (upstreamConfig.enabled === false) {
      logger.info(`Skipping disabled upstream: ${upstreamConfig.id}`);
      continue;
    }

    const client = new UpstreamClient(upstreamConfig);
    upstreamClients.push(client);
    aggregator.registerClient(client);
  }

  // Create downstream server
  const downstreamServer = new DownstreamServer({
    config: config.downstream,
    aggregator,
    router,
    compressor,
  });

  // Express app for HTTP transports
  let expressApp: express.Application | null = null;
  let httpServer: ReturnType<express.Application["listen"]> | null = null;
  let cacheCleanupInterval: ReturnType<typeof setInterval> | null = null;

  function getStatus(): UpstreamStatus[] {
    return upstreamClients.map((client) => ({
      id: client.id,
      name: client.name,
      connected: client.isConnected,
      toolCount: 0, // Would need to track this
      resourceCount: 0,
      promptCount: 0,
    }));
  }

  function getConfigPath(): string {
    return configPath;
  }

  /**
   * Hot reload configuration without restarting the HTTP server
   */
  async function reload(newConfig: CLIPConfig): Promise<void> {
    const log = getLogger();
    log.info("Reloading configuration...");

    // Store old clients for cleanup
    const oldClients = [...upstreamClients];

    // Disconnect old upstreams
    await Promise.all(
      oldClients.map((c) =>
        c.disconnect().catch((e) => log.warn(`Error disconnecting ${c.id}: ${e}`))
      )
    );

    // Unregister old clients from aggregator
    for (const client of oldClients) {
      aggregator.unregisterClient(client.id);
    }
    upstreamClients = [];

    // Update config reference
    currentConfig = newConfig;

    // Recreate resolver
    resolver = new ToolConfigResolver(newConfig);
    aggregator.setResolver(resolver);

    // Recreate compressor
    compressor = new Compressor(newConfig.compression, resolver);
    downstreamServer.setCompressor(compressor);

    // Recreate masker
    if (newConfig.masking?.enabled) {
      masker = new Masker(newConfig.masking, resolver);
      log.info("PII masking enabled");
    } else {
      masker = undefined;
    }
    router.setMasker(masker);

    // Update cache config
    cache.updateConfig(newConfig.cache);

    // Create new upstream clients
    for (const upstreamConfig of newConfig.upstreams) {
      if (upstreamConfig.enabled === false) {
        log.info(`Skipping disabled upstream: ${upstreamConfig.id}`);
        continue;
      }

      const client = new UpstreamClient(upstreamConfig);
      upstreamClients.push(client);
      aggregator.registerClient(client);
    }

    // Connect to new upstreams
    const connectionResults = await Promise.allSettled(
      upstreamClients.map((client) => client.connect())
    );

    // Log connection results
    connectionResults.forEach((result, index) => {
      const client = upstreamClients[index];
      if (result.status === "rejected") {
        log.error(`Failed to connect to upstream '${client.id}': ${result.reason}`);
      }
    });

    // Refresh aggregated data
    await aggregator.refresh();

    log.info("Configuration reloaded successfully");
  }

  async function start(): Promise<void> {
    logger.info("Starting CLIP proxy...");

    // Connect to all upstreams
    const connectionResults = await Promise.allSettled(
      upstreamClients.map((client) => client.connect())
    );

    // Log connection results
    connectionResults.forEach((result, index) => {
      const client = upstreamClients[index];
      if (result.status === "rejected") {
        logger.error(
          `Failed to connect to upstream '${client.id}': ${result.reason}`
        );
      }
    });

    // Refresh aggregated data
    await aggregator.refresh();

    // Start downstream server
    if (currentConfig.downstream.transport === "stdio") {
      await downstreamServer.start();
    } else {
      // Set up Express for HTTP transports
      expressApp = express();

      // Parse JSON for API routes, but also allow raw text for config
      expressApp.use(express.json());
      expressApp.use(express.text({ type: "application/json" }));

      const handler = downstreamServer.createHttpHandler();

      // Serve admin UI at root (only for HTML requests)
      expressApp.get("/", (req, res, next) => {
        if (req.accepts("html")) {
          try {
            res.type("html").send(generateHtml());
          } catch (error) {
            logger.error("Failed to generate UI:", error);
            res.status(500).send("Failed to load admin UI");
          }
        } else {
          next();
        }
      });

      // Register API routes
      registerApiRoutes(expressApp, {
        configPath,
        getStatus,
        reload,
        loadConfig,
      });

      // MCP endpoints
      if (currentConfig.downstream.transport === "streamable-http") {
        expressApp.post("/mcp", handler);
        expressApp.get("/mcp", handler); // For SSE upgrades
        // Fallback for non-HTML requests at root
        expressApp.post("/", handler);
      } else if (currentConfig.downstream.transport === "sse") {
        expressApp.get("/sse", handler);
        expressApp.post("/messages", handler);
      }

      // Health check endpoint
      expressApp.get("/health", (_req, res) => {
        res.json({
          status: "ok",
          upstreams: getStatus(),
        });
      });

      const port = currentConfig.downstream.port || 3000;
      const host = currentConfig.downstream.host || "0.0.0.0";

      httpServer = expressApp.listen(port, host, () => {
        logger.info(`CLIP proxy listening on ${host}:${port}`);
        logger.info(`Admin UI available at http://${host === "0.0.0.0" ? "localhost" : host}:${port}/`);
      });
    }

    // Start cache cleanup interval
    cacheCleanupInterval = setInterval(() => {
      cache.cleanup();
    }, 60000); // Cleanup every minute

    logger.info("CLIP proxy started successfully");
  }

  async function stop(): Promise<void> {
    logger.info("Stopping CLIP proxy...");

    // Clear cache cleanup interval
    if (cacheCleanupInterval) {
      clearInterval(cacheCleanupInterval);
      cacheCleanupInterval = null;
    }

    // Close HTTP server if running - force close all connections
    if (httpServer) {
      // Force close all active connections immediately (Node 18.2+)
      httpServer.closeAllConnections();
      await new Promise<void>((resolve) => {
        httpServer!.close(() => resolve());
      });
    }

    // Stop downstream server and disconnect upstreams in parallel
    // Use allSettled to continue even if some fail
    await Promise.allSettled([
      downstreamServer.stop().catch((e) => logger.warn("Error stopping downstream:", e)),
      ...upstreamClients.map((client) =>
        client.disconnect().catch((e) => logger.warn(`Error disconnecting ${client.id}:`, e))
      ),
    ]);

    // Clear cache
    cache.clear();

    logger.info("CLIP proxy stopped");
  }

  return {
    start,
    stop,
    getStatus,
    reload,
    getConfigPath,
  };
}
