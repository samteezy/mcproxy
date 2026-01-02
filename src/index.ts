// Main exports for programmatic usage
export { createProxy } from "./proxy.js";
export type { MCPCP } from "./proxy.js";

// Configuration
export { loadConfig, generateExampleConfig } from "./config/index.js";
export type {
  MCPCPConfig,
  UpstreamServerConfig,
  DownstreamConfig,
  CompressionConfig,
  CacheConfig,
  TransportType,
  CompressionStrategy,
  UpstreamStatus,
} from "./types.js";

// Components (for advanced usage)
export { UpstreamClient, DownstreamServer, Aggregator, Router } from "./mcp/index.js";
export { Compressor } from "./compression/index.js";
export { MemoryCache } from "./cache/index.js";
export { initLogger, getLogger } from "./logger.js";
