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
 * Confidence level for PII pattern matches
 * - high: Very reliable, unlikely to false positive
 * - medium: Reliable, some edge cases possible
 * - low: Ambiguous, benefits from LLM verification
 */
export type PatternConfidence = "low" | "medium" | "high";

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
  /** Trigger LLM fallback for patterns at or below this confidence level */
  llmFallbackThreshold?: PatternConfidence;
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
  llmFallbackThreshold: PatternConfidence;
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
 * Per-tool configuration nested within upstream server
 */
export interface ToolConfig {
  /** Hide this tool from clients */
  hidden?: boolean;
  /** Compression settings (overrides global defaultPolicy) */
  compression?: CompressionPolicy;
  /** Masking settings (overrides global defaultPolicy) */
  masking?: MaskingPolicy;
  /** Override the tool description exposed to clients */
  overwriteDescription?: string;
  /** Cache TTL in seconds for this tool (0 = no caching, undefined = use global) */
  cacheTtl?: number;
  /** Parameter names to hide from client schema */
  hideParameters?: string[];
  /** Parameter values to inject server-side before forwarding to upstream */
  parameterOverrides?: Record<string, unknown>;
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
  /** Tool-specific configs keyed by original tool name */
  tools?: Record<string, ToolConfig>;
}

/**
 * Configuration for retry escalation (increases output on repeated tool calls)
 */
export interface RetryEscalationConfig {
  /** Whether retry escalation is enabled */
  enabled: boolean;
  /** Time window in seconds to track repeated calls */
  windowSeconds: number;
  /** Multiplier for maxOutputTokens on each retry (linear: 1x, 2x, 3x, etc.) */
  tokenMultiplier: number;
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
  /** Whether to add _mcpcp_goal field for context-aware compression */
  goalAware?: boolean;
  /** Custom instructions to guide the LLM during compression */
  customInstructions?: string;
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
  /** Enable goal-aware compression globally (adds _mcpcp_goal to tool schemas). Default: true */
  goalAware?: boolean;
  /** Enable bypass field globally (adds _mcpcp_bypass to tool schemas). Default: false */
  bypassEnabled?: boolean;
  /** Configuration for retry escalation (optional) */
  retryEscalation?: RetryEscalationConfig;
}

/**
 * Resolved policy for a specific tool (all fields guaranteed)
 */
export interface ResolvedCompressionPolicy {
  enabled: boolean;
  tokenThreshold: number;
  maxOutputTokens?: number;
  customInstructions?: string;
  retryEscalation?: RetryEscalationConfig;
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
  /** Cache error responses (default: true) */
  cacheErrors?: boolean;
}

/**
 * Main MCPCP configuration
 */
export interface MCPCPConfig {
  /** Downstream server configuration */
  downstream: DownstreamConfig;
  /** Upstream server configurations */
  upstreams: UpstreamServerConfig[];
  /** Compression configuration */
  compression: CompressionConfig;
  /** Cache configuration */
  cache: CacheConfig;
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

/**
 * Log entry for streaming logs to UI
 */
export interface LogEntry {
  timestamp: string;
  level: string;
  message: string;
  meta?: Record<string, unknown>;
}
