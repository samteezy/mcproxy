import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { configSchema } from "./schema.js";
import type { MCPCPConfig } from "../types.js";

/**
 * Load and validate configuration from a JSON file
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
 * Generate an example configuration
 */
export function generateExampleConfig(): MCPCPConfig {
  return {
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
        // Tool-specific configs are nested within each upstream
        tools: {
          // Example: disable compression for a specific tool
          // "some-tool": { compression: { enabled: false } },
          // Example: hide a specific tool
          // "dangerous_tool": { hidden: true },
          // Example: override a tool's description for better LLM steering
          // "fetch": { overwriteDescription: "Fetches URL contents. Only use when user provides a specific URL." },
          // Example: configure both compression and masking for a tool
          // "heavy-tool": {
          //   compression: { tokenThreshold: 200, maxOutputTokens: 100 },
          //   masking: { enabled: true, piiTypes: ["email", "phone"] },
          // },
        },
      },
    ],
    compression: {
      baseUrl: "http://localhost:8080/v1",
      model: "local-model",
      defaultPolicy: {
        enabled: true,
        tokenThreshold: 1000,
        maxOutputTokens: 500,
      },
      goalAware: true,
    },
    cache: {
      enabled: true,
      ttlSeconds: 300,
      maxEntries: 1000,
    },
    // PII masking configuration (disabled by default)
    // masking: {
    //   enabled: true,
    //   defaultPolicy: {
    //     enabled: true,
    //     piiTypes: ["email", "ssn", "phone", "credit_card", "ip_address"],
    //     llmFallback: false,
    //     llmFallbackThreshold: "low",
    //   },
    //   // LLM config for fallback detection (optional)
    //   // llmConfig: {
    //   //   baseUrl: "http://localhost:8080/v1",
    //   //   model: "local-model",
    //   // },
    // },
    logLevel: "info",
  };
}
