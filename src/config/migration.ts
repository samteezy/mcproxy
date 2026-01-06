import type { MCPCPConfig } from "../types.js";
import { getLogger } from "../logger.js";

/**
 * Legacy v0.3.x config structure
 */
interface LegacyCompressionConfig {
  baseUrl: string;
  apiKey?: string;
  model: string;
  defaultPolicy: {
    enabled: boolean;
    tokenThreshold: number;
    maxOutputTokens?: number;
  };
  goalAware?: boolean;
  bypassEnabled?: boolean;
  retryEscalation?: {
    enabled: boolean;
    windowSeconds: number;
    tokenMultiplier: number;
  };
}

interface LegacyMaskingConfig {
  enabled: boolean;
  defaultPolicy: {
    enabled: boolean;
    piiTypes?: string[];
    llmFallback?: boolean;
    llmFallbackThreshold?: "low" | "medium" | "high";
    customPatterns?: Record<string, { regex: string; replacement: string }>;
  };
  llmConfig?: {
    baseUrl: string;
    apiKey?: string;
    model: string;
  };
}

interface LegacyCacheConfig {
  enabled: boolean;
  ttlSeconds: number;
  maxEntries: number;
  cacheErrors?: boolean;
}

interface LegacyToolConfig {
  hidden?: boolean;
  compression?: {
    enabled?: boolean;
    tokenThreshold?: number;
    maxOutputTokens?: number;
    goalAware?: boolean;
    customInstructions?: string;
  };
  masking?: {
    enabled?: boolean;
    piiTypes?: string[];
    llmFallback?: boolean;
    llmFallbackThreshold?: "low" | "medium" | "high";
    customPatterns?: Record<string, { regex: string; replacement: string }>;
  };
  cacheTtl?: number;
  overwriteDescription?: string;
  hideParameters?: string[];
  parameterOverrides?: Record<string, unknown>;
}

interface LegacyConfig {
  downstream: unknown;
  upstreams: Array<{
    id: string;
    name: string;
    transport: string;
    command?: string;
    args?: string[];
    env?: Record<string, string>;
    url?: string;
    enabled?: boolean;
    tools?: Record<string, LegacyToolConfig>;
  }>;
  compression: LegacyCompressionConfig;
  cache: LegacyCacheConfig;
  masking?: LegacyMaskingConfig;
  logLevel?: "error" | "warn" | "info" | "debug";
}

/**
 * Migrate v0.3.x config to v0.4.0 config
 */
export function migrateConfigV1toV2(oldConfig: LegacyConfig): MCPCPConfig {
  const logger = getLogger();
  logger.warn("Migrating v0.3.x config to v0.4.0 schema...");

  // Migrate upstreams (convert cacheTtl to cache.ttlSeconds)
  const migratedUpstreams = oldConfig.upstreams.map((upstream) => {
    const migratedUpstream: any = {
      id: upstream.id,
      name: upstream.name,
      transport: upstream.transport,
      command: upstream.command,
      args: upstream.args,
      env: upstream.env,
      url: upstream.url,
      enabled: upstream.enabled,
    };

    // Migrate tool configs
    if (upstream.tools) {
      migratedUpstream.tools = Object.fromEntries(
        Object.entries(upstream.tools).map(([toolName, toolConfig]) => {
          const migratedTool: any = {
            hidden: toolConfig.hidden,
            compression: toolConfig.compression,
            masking: toolConfig.masking,
            overwriteDescription: toolConfig.overwriteDescription,
            hideParameters: toolConfig.hideParameters,
            parameterOverrides: toolConfig.parameterOverrides,
          };

          // Convert cacheTtl to cache.ttlSeconds
          if (toolConfig.cacheTtl !== undefined) {
            // If cacheTtl is 0, that means disabled (don't include ttlSeconds)
            if (toolConfig.cacheTtl === 0) {
              migratedTool.cache = {
                enabled: false,
              };
            } else {
              migratedTool.cache = {
                ttlSeconds: toolConfig.cacheTtl,
              };
            }
          }

          // Remove undefined fields
          return [
            toolName,
            Object.fromEntries(
              Object.entries(migratedTool).filter(([, v]) => v !== undefined)
            ),
          ];
        })
      );
    }

    return migratedUpstream;
  });

  // Build new config structure
  const migratedConfig: MCPCPConfig = {
    version: 2,
    downstream: oldConfig.downstream as any,
    upstreams: migratedUpstreams as any,
    defaults: {
      compression: {
        enabled: oldConfig.compression.defaultPolicy.enabled,
        tokenThreshold: oldConfig.compression.defaultPolicy.tokenThreshold,
        maxOutputTokens: oldConfig.compression.defaultPolicy.maxOutputTokens,
        goalAware: oldConfig.compression.goalAware ?? true,
      },
      masking: oldConfig.masking
        ? {
            enabled: oldConfig.masking.defaultPolicy.enabled,
            piiTypes: oldConfig.masking.defaultPolicy.piiTypes as any,
            llmFallback: oldConfig.masking.defaultPolicy.llmFallback,
            llmFallbackThreshold: oldConfig.masking.defaultPolicy.llmFallbackThreshold,
            customPatterns: oldConfig.masking.defaultPolicy.customPatterns,
          }
        : {
            enabled: false,
            piiTypes: ["email", "ssn", "phone", "credit_card", "ip_address"] as any,
            llmFallback: false,
            llmFallbackThreshold: "low" as const,
          },
      cache: {
        enabled: oldConfig.cache.enabled,
        ttlSeconds: oldConfig.cache.ttlSeconds,
      },
    },
    compression: {
      baseUrl: oldConfig.compression.baseUrl,
      apiKey: oldConfig.compression.apiKey,
      model: oldConfig.compression.model,
      bypassEnabled: oldConfig.compression.bypassEnabled ?? false,
      retryEscalation: oldConfig.compression.retryEscalation,
    },
    cache: {
      maxEntries: oldConfig.cache.maxEntries,
      cacheErrors: oldConfig.cache.cacheErrors ?? true,
    },
    masking: oldConfig.masking
      ? {
          enabled: oldConfig.masking.enabled,
          llmConfig: oldConfig.masking.llmConfig,
        }
      : undefined,
    logLevel: oldConfig.logLevel ?? "info",
  };

  logger.warn("Config migrated successfully to v0.4.0");
  logger.warn(
    "IMPORTANT: Please update your config file to the new format. See migration guide:"
  );
  logger.warn("https://github.com/samteezy/mcp-context-proxy/issues/13#issuecomment-3710637305");

  return migratedConfig;
}

/**
 * Detect if a config is legacy (v0.3.x) format
 */
export function isLegacyConfig(config: any): boolean {
  // Check for v0.3.x markers:
  // 1. Has compression.defaultPolicy
  // 2. Has cache.enabled and cache.ttlSeconds
  // 3. Missing version field or version !== 2
  return (
    (config.version === undefined || config.version === 1) &&
    config.compression?.defaultPolicy !== undefined &&
    config.cache?.enabled !== undefined
  );
}
