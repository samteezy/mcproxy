import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { configSchema } from "./schema.js";
import { isLegacyConfig, migrateConfigV1toV2 } from "./migration.js";
import type { MCPCPConfig } from "../types.js";
import { getLogger } from "../logger.js";

/**
 * Load and validate configuration from a JSON file
 * Automatically migrates v0.3.x configs to v0.4.0
 */
export function loadConfig(configPath: string): MCPCPConfig {
  const absolutePath = resolve(configPath);

  if (!existsSync(absolutePath)) {
    throw new Error(`Configuration file not found: ${absolutePath}`);
  }

  let rawConfig: unknown;
  try {
    const content = readFileSync(absolutePath, "utf-8");
    rawConfig = JSON.parse(content);
  } catch (error) {
    if (error instanceof SyntaxError) {
      throw new Error(`Invalid JSON in configuration file: ${error.message}`);
    }
    throw error;
  }

  // Detect and migrate legacy config
  if (isLegacyConfig(rawConfig)) {
    const logger = getLogger();
    logger.warn("╔═════════════════════════════════════════════════════════════════════╗");
    logger.warn("║  LEGACY CONFIG DETECTED - Auto-migrating to v0.4.0 format          ║");
    logger.warn("║  Please update your config file manually to avoid this warning.    ║");
    logger.warn("║  Migration guide: github.com/samteezy/mcp-context-proxy/issues/13  ║");
    logger.warn("╚═════════════════════════════════════════════════════════════════════╝");
    rawConfig = migrateConfigV1toV2(rawConfig as any);
  }

  // Validate with v0.4.0 schema
  const result = configSchema.safeParse(rawConfig);

  if (!result.success) {
    const errors = result.error.issues
      .map((e) => `  - ${e.path.join(".")}: ${e.message}`)
      .join("\n");
    throw new Error(`Configuration validation failed:\n${errors}`);
  }

  return result.data as MCPCPConfig;
}

/**
 * Generate an example configuration (v0.4.0 format)
 */
export function generateExampleConfig(): MCPCPConfig {
  return {
    version: 2,
    downstream: {
      transport: "stdio",
    },
    upstreams: [
      {
        id: "example-server",
        name: "Example MCP Server",
        transport: "stdio",
        command: "npx",
        args: ["-y", "@modelcontextprotocol/server-everything"],
        enabled: true,
        // Per-upstream defaults (apply to all tools from this upstream)
        // defaults: {
        //   compression: { tokenThreshold: 500 },
        //   cache: { ttlSeconds: 600 },
        // },
        // Tool-specific configs override upstream defaults
        tools: {
          // Example: tool-specific compression override
          // "some-tool": { compression: { customInstructions: "Preserve URLs" } },
          // Example: hide a specific tool
          // "dangerous_tool": { hidden: true },
          // Example: override tool description for better LLM steering
          // "fetch": { overwriteDescription: "Fetches URL contents. Only use when user provides a specific URL." },
          // Example: tool-specific cache TTL
          // "heavy-tool": { cache: { ttlSeconds: 3600 } },
        },
      },
    ],
    // Global defaults for all tools (can be overridden by upstream or tool config)
    defaults: {
      compression: {
        enabled: true,
        tokenThreshold: 1000,
        maxOutputTokens: 500,
        goalAware: true,
      },
      masking: {
        enabled: false,
        piiTypes: ["email", "ssn", "phone", "credit_card", "ip_address"],
        llmFallback: false,
        llmFallbackThreshold: "low",
      },
      cache: {
        enabled: true,
        ttlSeconds: 300,
      },
    },
    // Compression infrastructure (LLM endpoint, retry escalation)
    compression: {
      baseUrl: "http://localhost:8080/v1",
      model: "local-model",
      bypassEnabled: false,
    },
    // Cache infrastructure (max entries, error caching)
    cache: {
      maxEntries: 1000,
      cacheErrors: true,
    },
    // PII masking configuration (disabled by default)
    // masking: {
    //   enabled: true,  // Master switch
    //   llmConfig: {
    //     baseUrl: "http://localhost:8080/v1",
    //     model: "local-model",
    //   },
    // },
    logLevel: "info",
  };
}
