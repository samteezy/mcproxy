import express from "express";
import type { MCPithConfig, UpstreamStatus } from "./types.js";
import { UpstreamClient, DownstreamServer, Aggregator, Router } from "./mcp/index.js";
import { Compressor } from "./compression/index.js";
import { Masker } from "./masking/index.js";
import { MemoryCache } from "./cache/index.js";
import { initLogger } from "./logger.js";

export interface MCPithProxy {
  start(): Promise<void>;
  stop(): Promise<void>;
  getStatus(): UpstreamStatus[];
}

/**
 * Create and configure the MCPith proxy
 */
export async function createProxy(config: MCPithConfig): Promise<MCPithProxy> {
  const logger = initLogger(config.logLevel);
  logger.info("Initializing MCPith proxy");

  // Create core components
  const aggregator = new Aggregator({
    toolsConfig: config.tools,
    compressionConfig: config.compression,
  });

  // Create masker if configured
  let masker: Masker | undefined;
  if (config.masking?.enabled) {
    masker = new Masker(config.masking);
    logger.info("PII masking enabled");
  }

  const router = new Router(aggregator, masker);
  const compressor = new Compressor(config.compression);
  const cache = new MemoryCache(config.cache);

  // Create upstream clients
  const upstreamClients: UpstreamClient[] = [];

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

  async function start(): Promise<void> {
    logger.info("Starting MCPith proxy...");

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
    if (config.downstream.transport === "stdio") {
      await downstreamServer.start();
    } else {
      // Set up Express for HTTP transports
      expressApp = express();
      expressApp.use(express.json());

      const handler = downstreamServer.createHttpHandler();

      if (config.downstream.transport === "streamable-http") {
        expressApp.post("/mcp", handler);
        expressApp.get("/mcp", handler); // For SSE upgrades
      } else if (config.downstream.transport === "sse") {
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

      const port = config.downstream.port || 3000;
      const host = config.downstream.host || "0.0.0.0";

      httpServer = expressApp.listen(port, host, () => {
        logger.info(`MCPith proxy listening on ${host}:${port}`);
      });
    }

    // Start cache cleanup interval
    setInterval(() => {
      cache.cleanup();
    }, 60000); // Cleanup every minute

    logger.info("MCPith proxy started successfully");
  }

  async function stop(): Promise<void> {
    logger.info("Stopping MCPith proxy...");

    // Close HTTP server if running
    if (httpServer) {
      await new Promise<void>((resolve) => {
        httpServer!.close(() => resolve());
      });
    }

    // Stop downstream server
    await downstreamServer.stop();

    // Disconnect from all upstreams
    await Promise.all(upstreamClients.map((client) => client.disconnect()));

    // Clear cache
    cache.clear();

    logger.info("MCPith proxy stopped");
  }

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

  return {
    start,
    stop,
    getStatus,
  };
}
