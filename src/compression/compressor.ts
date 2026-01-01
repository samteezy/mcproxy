import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { generateText } from "ai";
import { encode } from "gpt-tokenizer";
import type {
  CallToolResult,
  ReadResourceResult,
  TextContent,
} from "@modelcontextprotocol/sdk/types.js";
import type {
  CompressionConfig,
  CompressionResult,
  ResolvedCompressionPolicy,
} from "../types.js";
import { detectStrategy, getCompressionPrompt } from "./strategy.js";
import { getLogger } from "../logger.js";

export class Compressor {
  private config: CompressionConfig;
  private provider: ReturnType<typeof createOpenAICompatible>;

  constructor(config: CompressionConfig) {
    this.config = config;
    this.provider = createOpenAICompatible({
      name: "compression-provider",
      apiKey: config.apiKey || "not-needed",
      baseURL: config.baseUrl,
    });
  }

  /**
   * Resolve the compression policy for a specific tool
   * Tool-specific settings override defaults
   */
  resolvePolicy(toolName?: string): ResolvedCompressionPolicy {
    const defaultPolicy = this.config.defaultPolicy;

    if (!toolName || !this.config.toolPolicies) {
      return {
        enabled: defaultPolicy.enabled,
        tokenThreshold: defaultPolicy.tokenThreshold,
        maxOutputTokens: defaultPolicy.maxOutputTokens,
      };
    }

    const toolPolicy = this.config.toolPolicies[toolName];
    if (!toolPolicy) {
      return {
        enabled: defaultPolicy.enabled,
        tokenThreshold: defaultPolicy.tokenThreshold,
        maxOutputTokens: defaultPolicy.maxOutputTokens,
      };
    }

    // Merge: tool policy overrides default
    return {
      enabled: toolPolicy.enabled ?? defaultPolicy.enabled,
      tokenThreshold: toolPolicy.tokenThreshold ?? defaultPolicy.tokenThreshold,
      maxOutputTokens: toolPolicy.maxOutputTokens ?? defaultPolicy.maxOutputTokens,
    };
  }

  /**
   * Count tokens in a string
   */
  countTokens(text: string): number {
    return encode(text).length;
  }

  /**
   * Compress text using the given policy
   */
  async compress(
    content: string,
    policy: ResolvedCompressionPolicy,
    goal?: string
  ): Promise<CompressionResult> {
    const logger = getLogger();
    const originalTokens = this.countTokens(content);

    // Don't compress if disabled or under threshold
    if (!policy.enabled || originalTokens <= policy.tokenThreshold) {
      return {
        original: content,
        compressed: content,
        strategy: "default",
        originalTokens,
        compressedTokens: originalTokens,
        wasCompressed: false,
      };
    }

    const strategy = detectStrategy(content);
    logger.debug(
      `Compressing ${originalTokens} tokens using '${strategy}' strategy (threshold: ${policy.tokenThreshold})${goal ? ` with goal: "${goal}"` : ""}`
    );

    try {
      const prompt = getCompressionPrompt(
        strategy,
        content,
        policy.maxOutputTokens,
        goal
      );

      const { text } = await generateText({
        model: this.provider(this.config.model),
        prompt,
        maxTokens: policy.maxOutputTokens,
      });

      logger.debug(`Raw LLM response:\n${text}`);

      const compressedTokens = this.countTokens(text);
      const ratio = ((1 - compressedTokens / originalTokens) * 100).toFixed(1);

      logger.info(
        `Compressed ${originalTokens} -> ${compressedTokens} tokens (${ratio}% reduction)`
      );

      return {
        original: content,
        compressed: text,
        strategy,
        originalTokens,
        compressedTokens,
        wasCompressed: true,
      };
    } catch (error) {
      logger.error("Compression failed, returning original:", error);
      return {
        original: content,
        compressed: content,
        strategy,
        originalTokens,
        compressedTokens: originalTokens,
        wasCompressed: false,
      };
    }
  }

  /**
   * Compress a tool result using the policy for the given tool
   */
  async compressToolResult(
    result: CallToolResult,
    toolName?: string,
    goal?: string
  ): Promise<CallToolResult> {
    const logger = getLogger();
    const policy = this.resolvePolicy(toolName);

    // Check if compression is enabled for this tool
    if (!policy.enabled) {
      logger.debug(`Compression disabled for tool: ${toolName || "unknown"}`);
      return result;
    }

    // Extract text content
    const textContents = result.content.filter(
      (c): c is TextContent => c.type === "text"
    );

    if (textContents.length === 0) {
      return result;
    }

    // Combine all text for compression check
    const combinedText = textContents.map((c) => c.text).join("\n");
    const tokenCount = this.countTokens(combinedText);

    if (tokenCount <= policy.tokenThreshold) {
      return result;
    }

    logger.debug(
      `Tool '${toolName || "unknown"}' result has ${tokenCount} tokens (threshold: ${policy.tokenThreshold}), compressing...`
    );

    // Compress the combined text with goal context
    const compressed = await this.compress(combinedText, policy, goal);

    if (!compressed.wasCompressed) {
      return result;
    }

    // Replace text content with compressed version
    const newContent = result.content.map((c) => {
      if (c.type === "text") {
        return {
          type: "text" as const,
          text: compressed.compressed,
        };
      }
      return c;
    });

    // Only keep the first text content (now compressed)
    const seenText = new Set<string>();
    const dedupedContent = newContent.filter((c) => {
      if (c.type === "text") {
        if (seenText.has("text")) return false;
        seenText.add("text");
      }
      return true;
    });

    return {
      ...result,
      content: dedupedContent,
    };
  }

  /**
   * Compress a resource read result (uses default policy)
   */
  async compressResourceResult(
    result: ReadResourceResult
  ): Promise<ReadResourceResult> {
    const logger = getLogger();
    const policy = this.resolvePolicy(); // Use default policy for resources

    if (!policy.enabled) {
      return result;
    }

    const newContents = await Promise.all(
      result.contents.map(async (content) => {
        if ("text" in content && typeof content.text === "string") {
          const tokenCount = this.countTokens(content.text);

          if (tokenCount <= policy.tokenThreshold) {
            return content;
          }

          logger.debug(`Resource content has ${tokenCount} tokens, compressing...`);
          const compressed = await this.compress(content.text, policy);

          if (!compressed.wasCompressed) {
            return content;
          }

          return {
            ...content,
            text: compressed.compressed,
          };
        }
        return content;
      })
    );

    return {
      ...result,
      contents: newContents,
    };
  }
}
