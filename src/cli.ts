#!/usr/bin/env node

import { parseArgs } from "node:util";
import { writeFileSync } from "node:fs";
import { loadConfig, generateExampleConfig } from "./config/index.js";
import { createProxy } from "./proxy.js";

const { values, positionals } = parseArgs({
  options: {
    config: {
      type: "string",
      short: "c",
      default: "mcproxy.config.json",
    },
    init: {
      type: "boolean",
      description: "Generate an example configuration file",
    },
    help: {
      type: "boolean",
      short: "h",
    },
  },
  allowPositionals: true,
});

function printHelp(): void {
  console.log(`
mcproxy - MCP Context Proxy

A transparent MCP proxy with response compression.

Usage:
  mcproxy [options]
  mcproxy --init              Generate example config file

Options:
  -c, --config <path>  Path to configuration file (default: mcproxy.config.json)
  --init               Generate an example configuration file
  -h, --help           Show this help message

Configuration:
  mcproxy reads its configuration from a JSON file. Use --init to generate
  an example configuration file that you can customize.

Example:
  # Generate example config
  mcproxy --init

  # Start proxy with default config
  mcproxy

  # Start proxy with custom config
  mcproxy -c /path/to/config.json

For more information, see: https://github.com/samteezy/mcproxy
`);
}

async function main(): Promise<void> {
  if (values.help) {
    printHelp();
    process.exit(0);
  }

  if (values.init) {
    const configPath = positionals[0] || "mcproxy.config.json";
    const exampleConfig = generateExampleConfig();
    writeFileSync(configPath, JSON.stringify(exampleConfig, null, 2));
    console.log(`Generated example configuration: ${configPath}`);
    console.log("\nEdit this file to configure your upstream MCP servers.");
    process.exit(0);
  }

  // Load configuration
  const configPath = values.config as string;
  let config;
  try {
    config = loadConfig(configPath);
  } catch (error) {
    console.error(`Error loading configuration: ${error instanceof Error ? error.message : error}`);
    console.error(`\nRun 'mcproxy --init' to generate an example configuration.`);
    process.exit(1);
  }

  // Create and start proxy
  const proxy = await createProxy(config, configPath);

  // Handle shutdown with force exit on timeout or double signal
  let isShuttingDown = false;
  const shutdown = async () => {
    if (isShuttingDown) {
      console.log("\nForce exit");
      process.exit(1);
    }
    isShuttingDown = true;
    console.log("\nShutting down... (press Ctrl+C again to force)");

    // Force exit after 5 seconds if graceful shutdown hangs
    const forceExitTimeout = setTimeout(() => {
      console.error("Shutdown timed out, forcing exit");
      process.exit(1);
    }, 5000);
    forceExitTimeout.unref(); // Don't keep process alive for this timer

    try {
      await proxy.stop();
      clearTimeout(forceExitTimeout);
      process.exit(0);
    } catch (error) {
      console.error("Error during shutdown:", error);
      process.exit(1);
    }
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);

  try {
    await proxy.start();
  } catch (error) {
    console.error("Failed to start proxy:", error);
    process.exit(1);
  }
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
