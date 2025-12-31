import type { Tool, Resource, Prompt } from "@modelcontextprotocol/sdk/types.js";
import type { UpstreamClient } from "./client.js";
import type {
  AggregatedTool,
  AggregatedResource,
  AggregatedPrompt,
  ToolsConfig,
  CompressionConfig,
} from "../types.js";
import { matchesAnyGlob } from "../utils/index.js";
import { getLogger } from "../logger.js";

export interface AggregatorOptions {
  toolsConfig?: ToolsConfig;
  compressionConfig?: CompressionConfig;
}

/**
 * Aggregates tools, resources, and prompts from multiple upstream servers.
 * Uses namespacing to avoid conflicts between servers.
 */
export class Aggregator {
  private clients: Map<string, UpstreamClient> = new Map();
  private hiddenPatterns: string[];
  private compressionConfig?: CompressionConfig;

  // Caches for aggregated items
  private toolsCache: AggregatedTool[] = [];
  private resourcesCache: AggregatedResource[] = [];
  private promptsCache: AggregatedPrompt[] = [];
  private cacheValid = false;

  constructor(options: AggregatorOptions = {}) {
    this.hiddenPatterns = options.toolsConfig?.hidden || [];
    this.compressionConfig = options.compressionConfig;
  }

  /**
   * Register an upstream client
   */
  registerClient(client: UpstreamClient): void {
    this.clients.set(client.id, client);
    this.invalidateCache();
  }

  /**
   * Unregister an upstream client
   */
  unregisterClient(clientId: string): void {
    this.clients.delete(clientId);
    this.invalidateCache();
  }

  /**
   * Get a client by ID
   */
  getClient(clientId: string): UpstreamClient | undefined {
    return this.clients.get(clientId);
  }

  /**
   * Check if a tool is hidden
   */
  isToolHidden(namespacedName: string): boolean {
    if (this.hiddenPatterns.length === 0) return false;
    return matchesAnyGlob(namespacedName, this.hiddenPatterns);
  }

  /**
   * Invalidate the aggregation cache
   */
  invalidateCache(): void {
    this.cacheValid = false;
  }

  /**
   * Refresh the cache from all upstreams
   */
  async refresh(): Promise<void> {
    const logger = getLogger();
    logger.debug("Refreshing aggregated tools, resources, and prompts");

    const tools: AggregatedTool[] = [];
    const resources: AggregatedResource[] = [];
    const prompts: AggregatedPrompt[] = [];

    for (const [id, client] of this.clients) {
      if (!client.isConnected) {
        logger.warn(`Skipping disconnected upstream: ${id}`);
        continue;
      }

      try {
        // Aggregate tools
        const clientTools = await client.listTools();
        for (const tool of clientTools) {
          tools.push(this.namespaceTool(tool, id));
        }

        // Aggregate resources
        const clientResources = await client.listResources();
        for (const resource of clientResources) {
          resources.push(this.namespaceResource(resource, id));
        }

        // Aggregate prompts
        const clientPrompts = await client.listPrompts();
        for (const prompt of clientPrompts) {
          prompts.push(this.namespacePrompt(prompt, id));
        }
      } catch (error) {
        logger.error(`Failed to refresh from upstream ${id}:`, error);
      }
    }

    this.toolsCache = tools;
    this.resourcesCache = resources;
    this.promptsCache = prompts;
    this.cacheValid = true;

    // Log hidden tools count
    const hiddenCount = tools.filter((t) => this.isToolHidden(t.name)).length;
    const visibleCount = tools.length - hiddenCount;

    logger.info(
      `Aggregated ${tools.length} tools (${visibleCount} visible, ${hiddenCount} hidden), ${resources.length} resources, ${prompts.length} prompts`
    );
  }

  /**
   * List all aggregated tools (excluding hidden ones)
   */
  async listTools(): Promise<Tool[]> {
    if (!this.cacheValid) {
      await this.refresh();
    }

    const logger = getLogger();

    // Filter out hidden tools and inject goal field if enabled
    return this.toolsCache
      .filter((t) => {
        const hidden = this.isToolHidden(t.name);
        if (hidden) {
          logger.debug(`Hiding tool: ${t.name}`);
        }
        return !hidden;
      })
      .map((t) => this.injectGoalField(t));
  }

  /**
   * Check if goal-aware compression is enabled for a specific tool
   */
  private isGoalAwareEnabled(toolName: string): boolean {
    // Check per-tool override first
    const toolPolicy = this.compressionConfig?.toolPolicies?.[toolName];
    if (toolPolicy?.goalAware !== undefined) {
      return toolPolicy.goalAware;
    }
    // Fall back to global setting (default: true)
    return this.compressionConfig?.goalAware ?? true;
  }

  /**
   * Inject _mcpith_goal field into tool schema if goal-aware is enabled
   */
  private injectGoalField(tool: AggregatedTool): Tool {
    if (!this.isGoalAwareEnabled(tool.name)) {
      return {
        name: tool.name,
        description: tool.description,
        inputSchema: tool.inputSchema,
      };
    }

    // Append instruction to description
    const goalInstruction =
      "Provide a brief goal in '_mcpith_goal' to improve response relevance.";
    const description = tool.description
      ? `${tool.description} ${goalInstruction}`
      : goalInstruction;

    // Add _mcpith_goal to inputSchema.properties
    const existingSchema = tool.inputSchema;
    const existingProperties = existingSchema.properties || {};

    const inputSchema = {
      ...existingSchema,
      properties: {
        ...existingProperties,
        _mcpith_goal: {
          type: "string" as const,
          description:
            "Why you need this data and what information is most important",
        },
      },
    };

    return { name: tool.name, description, inputSchema };
  }

  /**
   * List all aggregated resources
   */
  async listResources(): Promise<Resource[]> {
    if (!this.cacheValid) {
      await this.refresh();
    }
    return this.resourcesCache.map((r) => ({
      uri: r.uri,
      name: r.name,
      description: r.description,
      mimeType: r.mimeType,
    }));
  }

  /**
   * List all aggregated prompts
   */
  async listPrompts(): Promise<Prompt[]> {
    if (!this.cacheValid) {
      await this.refresh();
    }
    return this.promptsCache.map((p) => ({
      name: p.name,
      description: p.description,
      arguments: p.arguments,
    }));
  }

  /**
   * Find a tool by its namespaced name and return routing info
   */
  findTool(namespacedName: string): { client: UpstreamClient; originalName: string } | null {
    const tool = this.toolsCache.find((t) => t.name === namespacedName);
    if (!tool) return null;

    const client = this.clients.get(tool.upstreamId);
    if (!client) return null;

    return { client, originalName: tool.originalName };
  }

  /**
   * Find a resource by its namespaced URI and return routing info
   */
  findResource(namespacedUri: string): { client: UpstreamClient; originalUri: string } | null {
    const resource = this.resourcesCache.find((r) => r.uri === namespacedUri);
    if (!resource) return null;

    const client = this.clients.get(resource.upstreamId);
    if (!client) return null;

    return { client, originalUri: resource.originalUri };
  }

  /**
   * Find a prompt by its namespaced name and return routing info
   */
  findPrompt(namespacedName: string): { client: UpstreamClient; originalName: string } | null {
    const prompt = this.promptsCache.find((p) => p.name === namespacedName);
    if (!prompt) return null;

    const client = this.clients.get(prompt.upstreamId);
    if (!client) return null;

    return { client, originalName: prompt.originalName };
  }

  /**
   * Namespace a tool to avoid conflicts
   */
  private namespaceTool(tool: Tool, upstreamId: string): AggregatedTool {
    return {
      ...tool,
      name: `${upstreamId}__${tool.name}`,
      originalName: tool.name,
      upstreamId,
    };
  }

  /**
   * Namespace a resource URI to avoid conflicts
   */
  private namespaceResource(resource: Resource, upstreamId: string): AggregatedResource {
    return {
      ...resource,
      uri: `${upstreamId}://${resource.uri}`,
      originalUri: resource.uri,
      upstreamId,
    };
  }

  /**
   * Namespace a prompt to avoid conflicts
   */
  private namespacePrompt(prompt: Prompt, upstreamId: string): AggregatedPrompt {
    return {
      ...prompt,
      name: `${upstreamId}__${prompt.name}`,
      originalName: prompt.name,
      upstreamId,
    };
  }
}
