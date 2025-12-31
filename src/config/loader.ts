import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { configSchema } from "./schema.js";
import type { MCPithConfig } from "../types.js";

/**
 * Load and validate configuration from a JSON file
 */
export function loadConfig(configPath: string): MCPithConfig {
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
    const errors = result.error.errors
      .map((e) => `  - ${e.path.join(".")}: ${e.message}`)
      .join("\n");
    throw new Error(`Configuration validation failed:\n${errors}`);
  }

  return result.data as MCPithConfig;
}

/**
 * Generate an example configuration
 */
export function generateExampleConfig(): MCPithConfig {
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
      toolPolicies: {
        // Example: disable compression for a specific tool
        // "example-server__some-tool": { enabled: false },
        // Example: more aggressive compression for another tool
        // "example-server__heavy-tool": { tokenThreshold: 200, maxOutputTokens: 100 },
      },
    },
    cache: {
      enabled: true,
      ttlSeconds: 300,
      maxEntries: 1000,
    },
    logLevel: "info",
  };
}
