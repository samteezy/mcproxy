import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";
import type { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";
import type {
  Tool,
  Resource,
  Prompt,
  CallToolResult,
  ReadResourceResult,
  GetPromptResult,
} from "@modelcontextprotocol/sdk/types.js";
import type { UpstreamServerConfig } from "../types.js";
import { getLogger } from "../logger.js";

/**
 * Wrapper around MCP Client for connecting to upstream servers
 */
export class UpstreamClient {
  private client: Client;
  private transport: Transport | null = null;
  private config: UpstreamServerConfig;
  private connected = false;

  constructor(config: UpstreamServerConfig) {
    this.config = config;
    this.client = new Client({
      name: "mcproxy-proxy",
      version: "0.1.0",
    });
  }

  get id(): string {
    return this.config.id;
  }

  get name(): string {
    return this.config.name;
  }

  get isConnected(): boolean {
    return this.connected;
  }

  /**
   * Connect to the upstream server
   */
  async connect(): Promise<void> {
    const logger = getLogger();

    if (this.connected) {
      logger.warn(`Already connected to upstream: ${this.config.id}`);
      return;
    }

    try {
      this.transport = await this.createTransport();
      await this.client.connect(this.transport);
      this.connected = true;
      logger.info(`Connected to upstream: ${this.config.id} (${this.config.name})`);
    } catch (error) {
      this.connected = false;
      logger.error(`Failed to connect to upstream ${this.config.id}:`, error);
      throw error;
    }
  }

  /**
   * Disconnect from the upstream server
   */
  async disconnect(): Promise<void> {
    const logger = getLogger();

    if (!this.connected) {
      return;
    }

    try {
      await this.client.close();
      this.connected = false;
      logger.info(`Disconnected from upstream: ${this.config.id}`);
    } catch (error) {
      logger.error(`Error disconnecting from upstream ${this.config.id}:`, error);
      throw error;
    }
  }

  /**
   * List all tools from this upstream
   */
  async listTools(): Promise<Tool[]> {
    this.ensureConnected();
    const result = await this.client.listTools();
    return result.tools;
  }

  /**
   * List all resources from this upstream
   */
  async listResources(): Promise<Resource[]> {
    this.ensureConnected();
    try {
      const result = await this.client.listResources();
      return result.resources;
    } catch {
      // Server may not support resources
      return [];
    }
  }

  /**
   * List all prompts from this upstream
   */
  async listPrompts(): Promise<Prompt[]> {
    this.ensureConnected();
    try {
      const result = await this.client.listPrompts();
      return result.prompts;
    } catch {
      // Server may not support prompts
      return [];
    }
  }

  /**
   * Call a tool on this upstream
   */
  async callTool(
    name: string,
    args: Record<string, unknown>
  ): Promise<CallToolResult> {
    const logger = getLogger();
    this.ensureConnected();
    const result = await this.client.callTool({ name, arguments: args });
    logger.debug(`Raw upstream response from '${this.config.id}' for tool '${name}': ${JSON.stringify(result)}`);
    // Handle both old (toolResult) and new (content) response formats
    if ("content" in result) {
      return result as CallToolResult;
    }
    // Convert legacy toolResult format if needed
    return {
      content: [{ type: "text", text: String(result.toolResult ?? "") }],
    } as CallToolResult;
  }

  /**
   * Read a resource from this upstream
   */
  async readResource(uri: string): Promise<ReadResourceResult> {
    const logger = getLogger();
    this.ensureConnected();
    const result = await this.client.readResource({ uri });
    logger.debug(`Raw upstream response from '${this.config.id}' for resource '${uri}': ${JSON.stringify(result)}`);
    return result;
  }

  /**
   * Get a prompt from this upstream
   */
  async getPrompt(
    name: string,
    args?: Record<string, string>
  ): Promise<GetPromptResult> {
    const logger = getLogger();
    this.ensureConnected();
    const result = await this.client.getPrompt({ name, arguments: args });
    logger.debug(`Raw upstream response from '${this.config.id}' for prompt '${name}': ${JSON.stringify(result)}`);
    return result;
  }

  private async createTransport(): Promise<Transport> {
    const logger = getLogger();

    switch (this.config.transport) {
      case "stdio": {
        if (!this.config.command) {
          throw new Error(
            `Upstream ${this.config.id}: stdio transport requires 'command'`
          );
        }
        logger.debug(
          `Creating stdio transport for ${this.config.id}: ${this.config.command} ${this.config.args?.join(" ") || ""}`
        );
        return new StdioClientTransport({
          command: this.config.command,
          args: this.config.args,
          env: this.config.env,
        });
      }

      case "streamable-http": {
        if (!this.config.url) {
          throw new Error(
            `Upstream ${this.config.id}: streamable-http transport requires 'url'`
          );
        }
        logger.debug(
          `Creating streamable-http transport for ${this.config.id}: ${this.config.url}`
        );
        return new StreamableHTTPClientTransport(new URL(this.config.url));
      }

      case "sse": {
        if (!this.config.url) {
          throw new Error(
            `Upstream ${this.config.id}: sse transport requires 'url'`
          );
        }
        logger.debug(
          `Creating SSE transport for ${this.config.id}: ${this.config.url}`
        );
        return new SSEClientTransport(new URL(this.config.url));
      }

      default:
        throw new Error(
          `Upstream ${this.config.id}: unknown transport type '${this.config.transport}'`
        );
    }
  }

  private ensureConnected(): void {
    if (!this.connected) {
      throw new Error(`Upstream ${this.config.id} is not connected`);
    }
  }
}
