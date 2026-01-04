import type { Tool, Resource, Prompt } from "@modelcontextprotocol/sdk/types.js";
import type { UpstreamClient } from "./client.js";
import type {
  AggregatedTool,
  AggregatedResource,
  AggregatedPrompt,
} from "../types.js";
import type { ToolConfigResolver } from "../config/tool-resolver.js";
import { getLogger } from "../logger.js";

export interface AggregatorOptions {
  resolver: ToolConfigResolver;
}

/**
 * Aggregates tools, resources, and prompts from multiple upstream servers.
 * Uses namespacing to avoid conflicts between servers.
 */
export class Aggregator {
  private clients: Map<string, UpstreamClient> = new Map();
  private resolver: ToolConfigResolver;

  // Caches for aggregated items
  private toolsCache: AggregatedTool[] = [];
  private resourcesCache: AggregatedResource[] = [];
  private promptsCache: AggregatedPrompt[] = [];
  private cacheValid = false;

  constructor(options: AggregatorOptions) {
    this.resolver = options.resolver;
  }

  /**
   * Update the resolver (used during hot reload)
   */
  setResolver(resolver: ToolConfigResolver): void {
    this.resolver = resolver;
    this.invalidateCache();
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
    return this.resolver.isToolHidden(namespacedName);
  }

  /**
   * Get parameter overrides for a tool
   */
  getParameterOverrides(namespacedName: string): Record<string, unknown> {
    return this.resolver.getParameterOverrides(namespacedName);
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

    // Filter out hidden tools, apply description overrides, and inject goal field
    return this.toolsCache
      .filter((t) => {
        const hidden = this.isToolHidden(t.name);
        if (hidden) {
          logger.debug(`Hiding tool: ${t.name}`);
        }
        return !hidden;
      })
      .map((t) => this.transformToolForClient(t));
  }

  /**
   * Apply all transformations to a tool before exposing to client
   */
  private transformToolForClient(tool: AggregatedTool): Tool {
    // Apply description override if configured
    const descOverride = this.resolver.getDescriptionOverride(tool.name);
    const toolWithDesc = descOverride ? { ...tool, description: descOverride } : tool;

    // Apply transformations: hide parameters, inject goal field, inject bypass field
    const withHiddenParams = this.hideParameters(toolWithDesc);
    const withGoal = this.injectGoalField(withHiddenParams);
    return this.injectBypassField(withGoal);
  }

  /**
   * Check if goal-aware compression is enabled for a specific tool
   */
  private isGoalAwareEnabled(toolName: string): boolean {
    return this.resolver.isGoalAwareEnabled(toolName);
  }

  /**
   * Inject _mcpcp_goal field into tool schema if goal-aware is enabled
   */
  private injectGoalField(tool: AggregatedTool): AggregatedTool {
    if (!this.isGoalAwareEnabled(tool.name)) {
      return tool;
    }

    // Append instruction to description
    const goalInstruction =
      "Use '_mcpcp_goal' to share the information you hope to learn. Will be used to refine the upstream tool's response for your specific data need.";
    const description = tool.description
      ? `${tool.description} ${goalInstruction}`
      : goalInstruction;

    // Add _mcpcp_goal to inputSchema.properties and required
    const existingSchema = tool.inputSchema;
    const existingProperties = existingSchema.properties || {};
    const existingRequired = (existingSchema.required as string[]) || [];

    const inputSchema = {
      ...existingSchema,
      properties: {
        ...existingProperties,
        _mcpcp_goal: {
          type: "string" as const,
          description:
            "Specific search term of what you're looking for (e.g., 'the authentication API endpoint', 'references to Ulysses S. Grant').",
        },
      },
      required: [...existingRequired, "_mcpcp_goal"],
    };

    return {
      ...tool,
      description,
      inputSchema,
    };
  }

  /**
   * Inject _mcpcp_bypass field into tool schema if bypass is enabled globally.
   * This allows clients to bypass compression when they need uncompressed data.
   */
  private injectBypassField(tool: AggregatedTool): AggregatedTool {
    // Only add bypass field if globally enabled (default: false)
    if (!this.resolver.isBypassEnabled()) {
      return tool;
    }

    // Append instruction to description
    const bypassInstruction =
      "Set '_mcpcp_bypass' to true to skip compression and receive the full uncompressed response.";
    const description = tool.description
      ? `${tool.description} ${bypassInstruction}`
      : bypassInstruction;

    // Add _mcpcp_bypass to inputSchema.properties (optional, not required)
    const existingSchema = tool.inputSchema;
    const existingProperties =
      (existingSchema.properties as Record<string, unknown>) || {};

    const inputSchema = {
      ...existingSchema,
      properties: {
        ...existingProperties,
        _mcpcp_bypass: {
          type: "boolean" as const,
          description:
            "Set to true to bypass compression and receive the full response.",
        },
      },
    };

    return {
      ...tool,
      description,
      inputSchema,
    };
  }

  /**
   * Hide specified parameters from tool schema.
   * Removes parameters from inputSchema.properties and required arrays.
   */
  private hideParameters(tool: AggregatedTool): AggregatedTool {
    const hiddenParams = this.resolver.getHiddenParameters(tool.name);

    // If no parameters to hide, return unchanged
    if (hiddenParams.length === 0) {
      return tool;
    }

    const logger = getLogger();
    logger.debug(
      `Hiding parameters ${hiddenParams.join(", ")} from tool '${tool.name}'`
    );

    const existingSchema = tool.inputSchema;
    const existingProperties = existingSchema.properties || {};
    const existingRequired = (existingSchema.required as string[]) || [];

    // Create new properties object without hidden parameters
    const newProperties: { [x: string]: object } = {};
    for (const [key, value] of Object.entries(existingProperties)) {
      if (!hiddenParams.includes(key)) {
        newProperties[key] = value as object;
      }
    }

    // Create new required array without hidden parameters
    const newRequired = existingRequired.filter(
      (param) => !hiddenParams.includes(param)
    );

    const inputSchema = {
      ...existingSchema,
      properties: newProperties,
      required: newRequired,
    };

    return {
      ...tool,
      inputSchema,
    };
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
   * Get counts of tools, resources, and prompts for a specific upstream
   */
  getUpstreamCounts(upstreamId: string): { tools: number; resources: number; prompts: number } {
    return {
      tools: this.toolsCache.filter((t) => t.upstreamId === upstreamId).length,
      resources: this.resourcesCache.filter((r) => r.upstreamId === upstreamId).length,
      prompts: this.promptsCache.filter((p) => p.upstreamId === upstreamId).length,
    };
  }

  /**
   * Get detailed tools, resources, and prompts for a specific upstream
   */
  getUpstreamDetails(upstreamId: string): {
    tools: AggregatedTool[];
    resources: AggregatedResource[];
    prompts: AggregatedPrompt[];
  } {
    return {
      tools: this.toolsCache.filter((t) => t.upstreamId === upstreamId),
      resources: this.resourcesCache.filter((r) => r.upstreamId === upstreamId),
      prompts: this.promptsCache.filter((p) => p.upstreamId === upstreamId),
    };
  }

  /**
   * Generic find method for cached entities
   */
  private findEntity<
    T extends {
      name?: string;
      uri?: string;
      upstreamId: string;
      originalName?: string;
      originalUri?: string;
    }
  >(
    cache: T[],
    identifier: string,
    identifierType: 'name' | 'uri'
  ): { client: UpstreamClient; original: string } | null {
    const entity = cache.find((item) =>
      identifierType === 'uri'
        ? ('uri' in item && item.uri === identifier)
        : ('name' in item && item.name === identifier)
    );

    if (!entity) return null;

    const client = this.clients.get(entity.upstreamId);
    if (!client) return null;

    const originalValue = identifierType === 'uri'
      ? entity.originalUri
      : entity.originalName;

    return { client, original: originalValue ?? identifier };
  }

  /**
   * Find a tool by its namespaced name and return routing info
   */
  findTool(namespacedName: string): { client: UpstreamClient; originalName: string } | null {
    const result = this.findEntity(this.toolsCache, namespacedName, 'name');
    return result ? { client: result.client, originalName: result.original } : null;
  }

  /**
   * Find a resource by its namespaced URI and return routing info
   */
  findResource(namespacedUri: string): { client: UpstreamClient; originalUri: string } | null {
    const result = this.findEntity(this.resourcesCache, namespacedUri, 'uri');
    return result ? { client: result.client, originalUri: result.original } : null;
  }

  /**
   * Find a prompt by its namespaced name and return routing info
   */
  findPrompt(namespacedName: string): { client: UpstreamClient; originalName: string } | null {
    const result = this.findEntity(this.promptsCache, namespacedName, 'name');
    return result ? { client: result.client, originalName: result.original } : null;
  }

  /**
   * Generic helper to namespace an entity with upstream ID
   */
  private namespaceEntity<T extends { name?: string; uri?: string }>(
    entity: T,
    upstreamId: string,
    type: 'tool' | 'resource' | 'prompt'
  ): T & { originalName?: string; originalUri?: string; upstreamId: string } {
    if (type === 'resource' && 'uri' in entity) {
      return {
        ...entity,
        uri: `${upstreamId}://${entity.uri}` as any,
        originalUri: entity.uri as string,
        upstreamId,
      };
    }

    // For tools and prompts (use name)
    return {
      ...entity,
      name: `${upstreamId}__${entity.name}` as any,
      originalName: entity.name as string,
      upstreamId,
    };
  }

  /**
   * Namespace a tool to avoid conflicts
   */
  private namespaceTool(tool: Tool, upstreamId: string): AggregatedTool {
    return this.namespaceEntity(tool, upstreamId, 'tool') as AggregatedTool;
  }

  /**
   * Namespace a resource URI to avoid conflicts
   */
  private namespaceResource(resource: Resource, upstreamId: string): AggregatedResource {
    return this.namespaceEntity(resource, upstreamId, 'resource') as AggregatedResource;
  }

  /**
   * Namespace a prompt to avoid conflicts
   */
  private namespacePrompt(prompt: Prompt, upstreamId: string): AggregatedPrompt {
    return this.namespaceEntity(prompt, upstreamId, 'prompt') as AggregatedPrompt;
  }
}
