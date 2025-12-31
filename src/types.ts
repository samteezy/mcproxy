import type { Tool, Resource, Prompt } from "@modelcontextprotocol/sdk/types.js";

/**
 * Transport types supported for MCP connections
 */
export type TransportType = "stdio" | "sse" | "streamable-http";

/**
 * Configuration for an upstream MCP server
 */
export interface UpstreamServerConfig {
  /** Unique identifier for this upstream server */
  id: string;
  /** Human-readable name */
  name: string;
  /** Transport type to use */
  transport: TransportType;
  /** For stdio: command to execute */
  command?: string;
  /** For stdio: command arguments */
  args?: string[];
  /** For stdio: environment variables */
  env?: Record<string, string>;
  /** For sse/streamable-http: server URL */
  url?: string;
  /** Optional: disable this server */
  enabled?: boolean;
}

/**
 * Policy settings for compression (can be global default or per-tool)
 */
export interface CompressionPolicy {
  /** Whether compression is enabled */
  enabled?: boolean;
  /** Token threshold to trigger compression */
  tokenThreshold?: number;
  /** Maximum tokens for compressed output */
  maxOutputTokens?: number;
}

/**
 * Configuration for the compression model
 */
export interface CompressionConfig {
  /** Base URL for OpenAI-compatible API */
  baseUrl: string;
  /** API key (optional for local models) */
  apiKey?: string;
  /** Model identifier */
  model: string;
  /** Default policy applied to all tools */
  defaultPolicy: CompressionPolicy & { enabled: boolean; tokenThreshold: number };
  /** Per-tool policy overrides (key is namespaced tool name, e.g. "upstream__tool") */
  toolPolicies?: Record<string, CompressionPolicy>;
}

/**
 * Resolved policy for a specific tool (all fields guaranteed)
 */
export interface ResolvedCompressionPolicy {
  enabled: boolean;
  tokenThreshold: number;
  maxOutputTokens?: number;
}

/**
 * Configuration for the downstream server (what clients connect to)
 */
export interface DownstreamConfig {
  /** Transport type for downstream server */
  transport: TransportType;
  /** For stdio: no additional config needed */
  /** For sse/streamable-http: port to listen on */
  port?: number;
  /** For sse/streamable-http: host to bind to */
  host?: string;
}

/**
 * Cache configuration
 */
export interface CacheConfig {
  /** Enable caching */
  enabled: boolean;
  /** TTL in seconds */
  ttlSeconds: number;
  /** Maximum cache entries */
  maxEntries: number;
}

/**
 * Main MCPith configuration
 */
export interface MCPithConfig {
  /** Downstream server configuration */
  downstream: DownstreamConfig;
  /** Upstream server configurations */
  upstreams: UpstreamServerConfig[];
  /** Compression configuration */
  compression: CompressionConfig;
  /** Cache configuration */
  cache: CacheConfig;
  /** Log level */
  logLevel?: "error" | "warn" | "info" | "debug";
}

/**
 * Compression strategy types
 */
export type CompressionStrategy = "default" | "json" | "code";

/**
 * Result from compression
 */
export interface CompressionResult {
  /** Original content */
  original: string;
  /** Compressed content */
  compressed: string;
  /** Strategy used */
  strategy: CompressionStrategy;
  /** Original token count */
  originalTokens: number;
  /** Compressed token count */
  compressedTokens: number;
  /** Whether compression was applied */
  wasCompressed: boolean;
}

/**
 * Tool with upstream source information
 */
export interface AggregatedTool extends Tool {
  /** Source upstream server ID */
  upstreamId: string;
  /** Original tool name (before namespacing) */
  originalName: string;
}

/**
 * Resource with upstream source information
 */
export interface AggregatedResource extends Resource {
  /** Source upstream server ID */
  upstreamId: string;
  /** Original URI (before namespacing) */
  originalUri: string;
}

/**
 * Prompt with upstream source information
 */
export interface AggregatedPrompt extends Prompt {
  /** Source upstream server ID */
  upstreamId: string;
  /** Original prompt name (before namespacing) */
  originalName: string;
}

/**
 * Cache entry
 */
export interface CacheEntry<T> {
  /** Cached value */
  value: T;
  /** Timestamp when cached */
  timestamp: number;
  /** TTL in milliseconds */
  ttl: number;
}

/**
 * Connection status for an upstream server
 */
export interface UpstreamStatus {
  id: string;
  name: string;
  connected: boolean;
  error?: string;
  toolCount: number;
  resourceCount: number;
  promptCount: number;
}
