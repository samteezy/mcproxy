import type { Tool, Resource, Prompt } from "@modelcontextprotocol/sdk/types.js";

/**
 * Transport types supported for MCP connections
 */
export type TransportType = "stdio" | "sse" | "streamable-http";

/**
 * Types of PII that can be detected and masked
 */
export type PIIType =
  | "email"
  | "ssn"
  | "phone"
  | "credit_card"
  | "ip_address"
  | "date_of_birth"
  | "passport"
  | "driver_license"
  | "custom";

/**
 * Custom pattern definition for PII masking
 */
export interface CustomPatternDef {
  /** Regex pattern string */
  regex: string;
  /** Replacement text */
  replacement: string;
}

/**
 * Policy settings for PII masking (can be global default or per-tool)
 */
export interface MaskingPolicy {
  /** Whether masking is enabled */
  enabled?: boolean;
  /** PII types to mask */
  piiTypes?: PIIType[];
  /** Whether to use LLM fallback for ambiguous cases */
  llmFallback?: boolean;
  /** Confidence threshold for regex match (0-1). Below this, trigger LLM fallback */
  llmFallbackThreshold?: number;
  /** Custom regex patterns */
  customPatterns?: Record<string, CustomPatternDef>;
}

/**
 * Resolved policy for a specific tool (all fields guaranteed)
 */
export interface ResolvedMaskingPolicy {
  enabled: boolean;
  piiTypes: PIIType[];
  llmFallback: boolean;
  llmFallbackThreshold: number;
  customPatterns: Record<string, CustomPatternDef>;
}

/**
 * LLM configuration for masking (optional, can use compression model)
 */
export interface MaskingLLMConfig {
  /** Base URL for OpenAI-compatible API */
  baseUrl: string;
  /** API key (optional for local models) */
  apiKey?: string;
  /** Model identifier */
  model: string;
}

/**
 * Configuration for PII masking
 */
export interface MaskingConfig {
  /** Whether masking is enabled globally */
  enabled: boolean;
  /** Default policy applied to all tools */
  defaultPolicy: MaskingPolicy & { enabled: boolean };
  /** Per-tool policy overrides (key is namespaced tool name) */
  toolPolicies?: Record<string, MaskingPolicy>;
  /** LLM config for fallback detection (optional) */
  llmConfig?: MaskingLLMConfig;
}

/**
 * Details of a single masked field
 */
export interface MaskedField {
  /** Path to the field (e.g., "user.email") */
  path: string;
  /** Type of PII detected */
  piiType: PIIType;
  /** Detection method: "regex" or "llm" */
  detectionMethod: "regex" | "llm";
}

/**
 * Result from masking operation
 */
export interface MaskingResult {
  /** Original arguments */
  original: Record<string, unknown>;
  /** Masked arguments */
  masked: Record<string, unknown>;
  /** Whether any masking was applied */
  wasMasked: boolean;
  /** Details of what was masked */
  maskedFields: MaskedField[];
  /** Map of placeholder to original value for restoration */
  restorationMap: Map<string, string>;
}

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
  /** Whether to add _mcpith_goal field for context-aware compression */
  goalAware?: boolean;
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
  /** Enable goal-aware compression globally (adds _mcpith_goal to tool schemas). Default: true */
  goalAware?: boolean;
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
 * Tool filtering configuration
 */
export interface ToolsConfig {
  /**
   * Tools to hide from clients (not exposed in tools/list, calls rejected).
   * Supports exact names ("server__tool") or glob patterns ("server__*", "*__dangerous_*")
   */
  hidden?: string[];
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
  /** Tool filtering configuration */
  tools?: ToolsConfig;
  /** PII masking configuration */
  masking?: MaskingConfig;
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
