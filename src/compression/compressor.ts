import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { generateText } from "ai";
import { Tokenizer } from "ai-tokenizer";
import * as o200k_base from "ai-tokenizer/encoding/o200k_base";
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
import type { ToolConfigResolver } from "../config/tool-resolver.js";
import { detectStrategy, getCompressionPrompt } from "./strategy.js";
import { getLogger } from "../logger.js";

export class Compressor {
  private config: CompressionConfig;
  private resolver: ToolConfigResolver;
  private provider: ReturnType<typeof createOpenAICompatible>;
  private tokenizer: Tokenizer;

  constructor(config: CompressionConfig, resolver: ToolConfigResolver) {
    this.config = config;
    this.resolver = resolver;
    this.provider = createOpenAICompatible({
      name: "compression-provider",
      apiKey: config.apiKey || "not-needed",
      baseURL: config.baseUrl,
    });
    this.tokenizer = new Tokenizer(o200k_base);
  }

  /**
   * Resolve the compression policy for a specific tool.
   * Delegates to ToolConfigResolver for upstream-aware resolution.
   */
  resolvePolicy(toolName?: string): ResolvedCompressionPolicy {
    return this.resolver.resolveCompressionPolicy(toolName);
  }

  /**
   * Count tokens in a string
   */
  countTokens(text: string): number {
    return this.tokenizer.count(text);
  }

  /**
   * Create an uncompressed result (used when compression is skipped or fails)
   */
  private createUncompressedResult(
    content: string,
    strategy: CompressionResult["strategy"],
    originalTokens: number
  ): CompressionResult {
    return {
      original: content,
      compressed: content,
      strategy,
      originalTokens,
      compressedTokens: originalTokens,
      wasCompressed: false,
    };
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
      return this.createUncompressedResult(content, "default", originalTokens);
    }

    const strategy = detectStrategy(content);
    logger.info(
      `Compressing ${originalTokens} tokens using '${strategy}' strategy (threshold: ${policy.tokenThreshold})${goal ? ` with goal: "${goal}"` : ""}`
    );

    try {
      const prompts = getCompressionPrompt(
        content,
        policy.maxOutputTokens,
        goal,
        policy.customInstructions
      );

      // Reconstruct prompt with truncated content for logging
      const contentPreview = this.createContentPreview(content);
      const promptsPreview = getCompressionPrompt(
        contentPreview,
        policy.maxOutputTokens,
        goal,
        policy.customInstructions
      );

      logger.debug(
        `Calling LLM for compression with payload: ${JSON.stringify({
          model: this.config.model,
          maxOutputTokens: policy.maxOutputTokens,
          systemPromptLength: prompts.system.length,
          userPromptLength: prompts.user.length,
          contentLength: content.length,
        })}\n\nSystem prompt:\n${promptsPreview.system}\n\nUser prompt (with truncated content):\n${promptsPreview.user}`
      );

      const result = await generateText({
        model: this.provider(this.config.model),
        messages: [
          { role: "system", content: prompts.system },
          { role: "user", content: prompts.user },
        ],
        maxOutputTokens: policy.maxOutputTokens,
      });

      // Extract <think> tags and main content
      // Some LLMs (especially smaller models) may output reasoning in <think> tags.
      // We extract the main content, falling back to think content if main is empty.
      const rawText = result.text;
      logger.debug(`Raw LLM response (${rawText.length} chars): ${rawText}`);

      // Remove think tags to get main content
      const mainContent = rawText.replace(/<think>[\s\S]*?<\/think>/g, "").trim();

      // Extract think content as fallback
      let thinkContent = "";
      const thinkMatches = rawText.matchAll(/<think>([\s\S]*?)<\/think>/g);
      for (const match of thinkMatches) {
        if (thinkContent) thinkContent += "\n";
        thinkContent += match[1];
      }

      // Use main content, or fall back to think content if empty
      const compressedText = mainContent || thinkContent.trim();

      logger.debug(`Processed response length: ${compressedText.length} chars`);
      logger.debug(`Output:\n${compressedText.substring(0, 200)}${compressedText.length > 200 ? "..." : ""}`);

      // Validate non-empty response
      if (!compressedText || compressedText.length === 0) {
        logger.warn("LLM returned empty response, using original content");
        return this.createUncompressedResult(content, strategy, originalTokens);
      }

      const compressedTokens = this.countTokens(compressedText);
      const ratio = ((1 - compressedTokens / originalTokens) * 100).toFixed(1);

      logger.info(
        `Compressed ${originalTokens} -> ${compressedTokens} tokens (${ratio}% reduction)`
      );

      return {
        original: content,
        compressed: compressedText,
        strategy,
        originalTokens,
        compressedTokens,
        wasCompressed: true,
      };
    } catch (error) {
      logger.error("Compression failed, returning original:", error);
      return this.createUncompressedResult(content, strategy, originalTokens);
    }
  }

  /**
   * Create a truncated preview of content for logging
   * Returns first 250 and last 250 chars with omission notice
   */
  private createContentPreview(content: string, maxLength = 500): string {
    if (content.length <= maxLength) {
      return content;
    }

    const halfLength = maxLength / 2;
    return (
      content.substring(0, halfLength) +
      `\n\n... [${content.length - maxLength} chars omitted] ...\n\n` +
      content.substring(content.length - halfLength)
    );
  }

  /**
   * Build a metadata header to prepend to compressed output
   */
  private buildMetadataHeader(
    originalTokens: number,
    compressedTokens: number,
    strategy: CompressionResult["strategy"],
    escalationMultiplier?: number
  ): string {
    const escalationPart =
      escalationMultiplier && escalationMultiplier > 1
        ? `, escalation: ${escalationMultiplier}x`
        : "";
    return `[Compressed: ${originalTokens}→${compressedTokens} tokens, strategy: ${strategy}${escalationPart}]`;
  }

  /**
   * Compress a tool result using the policy for the given tool
   */
  async compressToolResult(
    result: CallToolResult,
    toolName?: string,
    goal?: string,
    escalationMultiplier?: number
  ): Promise<CallToolResult> {
    const logger = getLogger();
    const policy = this.resolvePolicy(toolName);

    // Check if compression is enabled for this tool
    if (!policy.enabled) {
      logger.debug(`Compression disabled for tool: ${toolName || "unknown"}`);
      return result;
    }

    // Apply escalation multiplier to maxOutputTokens if provided
    const effectivePolicy = { ...policy };
    if (
      escalationMultiplier &&
      escalationMultiplier > 1 &&
      effectivePolicy.maxOutputTokens
    ) {
      const newMaxTokens = Math.ceil(
        effectivePolicy.maxOutputTokens * escalationMultiplier
      );
      logger.info(
        `Applying retry escalation ${escalationMultiplier}x: maxOutputTokens ${effectivePolicy.maxOutputTokens} -> ${newMaxTokens}`
      );
      effectivePolicy.maxOutputTokens = newMaxTokens;
    }

    // Extract text content
    const textContents = result.content.filter(
      (c): c is TextContent => c.type === "text"
    );

    if (textContents.length === 0) {
      logger.debug(`Skipping compression for '${toolName || "unknown"}': no text content in response`);
      return result;
    }

    // Combine all text for compression check
    const combinedText = textContents.map((c) => c.text).join("\n");
    const tokenCount = this.countTokens(combinedText);

    if (tokenCount <= effectivePolicy.tokenThreshold) {
      logger.debug(
        `Skipping compression for '${toolName || "unknown"}': ${tokenCount} tokens <= ${effectivePolicy.tokenThreshold} threshold`
      );
      return result;
    }

    logger.info(
      `Compressing '${toolName || "unknown"}': ${tokenCount} tokens > ${effectivePolicy.tokenThreshold} threshold`
    );

    // Compress the combined text with goal context
    const compressed = await this.compress(combinedText, effectivePolicy, goal);

    if (!compressed.wasCompressed) {
      return result;
    }

    // Build metadata header and prepend to compressed content
    const metadataHeader = this.buildMetadataHeader(
      compressed.originalTokens,
      compressed.compressedTokens,
      compressed.strategy,
      escalationMultiplier
    );
    const textWithHeader = `${metadataHeader}\n\n${compressed.compressed}`;

    // Replace text content with compressed version
    const newContent = result.content.map((c) => {
      if (c.type === "text") {
        return {
          type: "text" as const,
          text: textWithHeader,
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
    result: ReadResourceResult,
    resourceUri?: string
  ): Promise<ReadResourceResult> {
    const logger = getLogger();
    const policy = this.resolvePolicy(); // Use default policy for resources

    if (!policy.enabled) {
      logger.debug(`Compression disabled for resource: ${resourceUri || "unknown"}`);
      return result;
    }

    const newContents = await Promise.all(
      result.contents.map(async (content) => {
        if ("text" in content && typeof content.text === "string") {
          const tokenCount = this.countTokens(content.text);

          if (tokenCount <= policy.tokenThreshold) {
            logger.debug(
              `Skipping compression for resource '${resourceUri || "unknown"}': ${tokenCount} tokens <= ${policy.tokenThreshold} threshold`
            );
            return content;
          }

          logger.debug(
            `Compressing resource '${resourceUri || "unknown"}': ${tokenCount} tokens > ${policy.tokenThreshold} threshold`
          );
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
