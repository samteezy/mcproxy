import type {
  CallToolResult,
  ReadResourceResult,
  GetPromptResult,
} from "@modelcontextprotocol/sdk/types.js";
import type { Aggregator } from "./aggregator.js";
import type { Masker } from "../masking/index.js";
import { getLogger } from "../logger.js";

/**
 * Routes requests to the correct upstream server
 */
export class Router {
  private aggregator: Aggregator;
  private masker: Masker | null;

  constructor(aggregator: Aggregator, masker?: Masker) {
    this.aggregator = aggregator;
    this.masker = masker ?? null;
  }

  /**
   * Update the masker (used during hot reload)
   */
  setMasker(masker: Masker | undefined): void {
    this.masker = masker ?? null;
  }

  /**
   * Result from callTool including extracted goal
   */
  public static readonly GOAL_FIELD = "_mcproxy_goal";

  /**
   * Route a tool call to the correct upstream
   */
  async callTool(
    namespacedName: string,
    args: Record<string, unknown>
  ): Promise<{ result: CallToolResult; goal?: string; restorationMap?: Map<string, string> }> {
    const logger = getLogger();

    // Extract goal before forwarding (strip from args)
    const goal =
      typeof args[Router.GOAL_FIELD] === "string"
        ? (args[Router.GOAL_FIELD] as string)
        : undefined;
    let forwardArgs = { ...args };
    delete forwardArgs[Router.GOAL_FIELD];

    // Apply PII masking to arguments before forwarding
    let restorationMap: Map<string, string> | undefined;
    if (this.masker?.isEnabled()) {
      const maskResult = await this.masker.maskToolArgs(
        forwardArgs,
        namespacedName
      );
      if (maskResult.wasMasked) {
        logger.debug(
          `Masked ${maskResult.maskedFields.length} PII field(s) in '${namespacedName}'`
        );
        forwardArgs = maskResult.masked;
        restorationMap = maskResult.restorationMap;
      }
    }

    // Check if tool is hidden (reject even if it exists)
    if (this.aggregator.isToolHidden(namespacedName)) {
      logger.warn(`Rejected call to hidden tool: ${namespacedName}`);
      return {
        result: {
          content: [
            {
              type: "text",
              text: `Error: Tool '${namespacedName}' not found`,
            },
          ],
          isError: true,
        },
        goal,
        restorationMap,
      };
    }

    const routing = this.aggregator.findTool(namespacedName);

    if (!routing) {
      logger.error(`Tool not found: ${namespacedName}`);
      return {
        result: {
          content: [
            {
              type: "text",
              text: `Error: Tool '${namespacedName}' not found`,
            },
          ],
          isError: true,
        },
        goal,
        restorationMap,
      };
    }

    const { client, originalName } = routing;
    logger.debug(
      `Routing tool call '${namespacedName}' to upstream '${client.id}' as '${originalName}'`
    );

    if (goal) {
      logger.debug(`Goal provided: "${goal}"`);
    }

    try {
      const result = await client.callTool(originalName, forwardArgs);
      return { result, goal, restorationMap };
    } catch (error) {
      logger.error(`Error calling tool '${originalName}' on '${client.id}':`, error);
      return {
        result: {
          content: [
            {
              type: "text",
              text: `Error calling tool: ${error instanceof Error ? error.message : String(error)}`,
            },
          ],
          isError: true,
        },
        goal,
        restorationMap,
      };
    }
  }

  /**
   * Route a resource read to the correct upstream
   */
  async readResource(namespacedUri: string): Promise<ReadResourceResult> {
    const logger = getLogger();
    const routing = this.aggregator.findResource(namespacedUri);

    if (!routing) {
      logger.error(`Resource not found: ${namespacedUri}`);
      throw new Error(`Resource '${namespacedUri}' not found`);
    }

    const { client, originalUri } = routing;
    logger.debug(
      `Routing resource read '${namespacedUri}' to upstream '${client.id}' as '${originalUri}'`
    );

    try {
      return await client.readResource(originalUri);
    } catch (error) {
      logger.error(`Error reading resource '${originalUri}' on '${client.id}':`, error);
      throw error;
    }
  }

  /**
   * Route a prompt get to the correct upstream
   */
  async getPrompt(
    namespacedName: string,
    args?: Record<string, string>
  ): Promise<GetPromptResult> {
    const logger = getLogger();
    const routing = this.aggregator.findPrompt(namespacedName);

    if (!routing) {
      logger.error(`Prompt not found: ${namespacedName}`);
      throw new Error(`Prompt '${namespacedName}' not found`);
    }

    const { client, originalName } = routing;
    logger.debug(
      `Routing prompt get '${namespacedName}' to upstream '${client.id}' as '${originalName}'`
    );

    try {
      return await client.getPrompt(originalName, args);
    } catch (error) {
      logger.error(`Error getting prompt '${originalName}' on '${client.id}':`, error);
      throw error;
    }
  }
}
