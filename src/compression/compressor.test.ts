import { describe, it, expect, vi, beforeEach } from "vitest";
import { Compressor } from "./compressor.js";
import type { ToolConfigResolver } from "../config/tool-resolver.js";
import type { CallToolResult, ReadResourceResult } from "@modelcontextprotocol/sdk/types.js";
import { mockGenerateText, resetLlmMocks } from "../test/llm-mocks.js";

// Mock AI SDK using shared mock from llm-mocks.ts
vi.mock("ai", async () => {
  const { mockGenerateText } = await import("../test/llm-mocks.js");
  return {
    generateText: mockGenerateText,
  };
});

// Mock tokenizer
const mockTokenizerCount = vi.fn();
vi.mock("ai-tokenizer", () => ({
  Tokenizer: class {
    count = mockTokenizerCount;
  },
}));

// Mock OpenAI compatible provider
const mockProvider = vi.fn((model: string) => model);
vi.mock("@ai-sdk/openai-compatible", () => ({
  createOpenAICompatible: () => mockProvider,
}));

describe("Compressor", () => {
  let mockResolver: Partial<ToolConfigResolver>;
  let compressor: Compressor;

  beforeEach(() => {
    resetLlmMocks();
    mockTokenizerCount.mockReset();
    mockProvider.mockClear();

    // Mock resolver with default policy
    mockResolver = {
      resolveCompressionPolicy: vi.fn().mockReturnValue({
        enabled: true,
        tokenThreshold: 1000,
        maxOutputTokens: 2000,
        goalAware: true,
      }),
    };

    compressor = new Compressor(
      {
        baseUrl: "http://localhost:8080/v1",
        model: "test-model",
      },
      mockResolver as ToolConfigResolver
    );
  });

  describe("constructor", () => {
    it("should initialize with config and resolver", () => {
      expect(compressor).toBeDefined();
    });
  });

  describe("resolvePolicy", () => {
    it("should delegate to resolver", () => {
      const policy = compressor.resolvePolicy("test-tool");

      expect(mockResolver.resolveCompressionPolicy).toHaveBeenCalledWith("test-tool");
      expect(policy).toEqual({
        enabled: true,
        tokenThreshold: 1000,
        maxOutputTokens: 2000,
        goalAware: true,
      });
    });

    it("should work without tool name", () => {
      compressor.resolvePolicy();

      expect(mockResolver.resolveCompressionPolicy).toHaveBeenCalledWith(undefined);
    });
  });

  describe("countTokens", () => {
    it("should count tokens using tokenizer", () => {
      mockTokenizerCount.mockReturnValue(42);

      const count = compressor.countTokens("test content");

      expect(mockTokenizerCount).toHaveBeenCalledWith("test content");
      expect(count).toBe(42);
    });
  });

  describe("compress", () => {
    it("should skip compression when disabled", async () => {
      mockTokenizerCount.mockReturnValue(1500);

      const result = await compressor.compress(
        "test content",
        { enabled: false, tokenThreshold: 1000, goalAware: false }
      );

      expect(result.wasCompressed).toBe(false);
      expect(result.compressed).toBe("test content");
      expect(result.original).toBe("test content");
      expect(mockGenerateText).not.toHaveBeenCalled();
    });

    it("should skip compression when under threshold", async () => {
      mockTokenizerCount.mockReturnValue(500);

      const result = await compressor.compress(
        "short content",
        { enabled: true, tokenThreshold: 1000, goalAware: true }
      );

      expect(result.wasCompressed).toBe(false);
      expect(result.compressed).toBe("short content");
      expect(mockGenerateText).not.toHaveBeenCalled();
    });

    it("should compress when over threshold", async () => {
      mockTokenizerCount.mockReturnValueOnce(1500); // Original
      mockTokenizerCount.mockReturnValueOnce(750); // Compressed

      mockGenerateText.mockResolvedValue({
        text: "Compressed output text",
      });

      const result = await compressor.compress(
        "long content that exceeds threshold",
        { enabled: true, tokenThreshold: 1000, maxOutputTokens: 2000, goalAware: true }
      );

      expect(result.wasCompressed).toBe(true);
      expect(result.compressed).toBe("Compressed output text");
      expect(result.original).toBe("long content that exceeds threshold");
      expect(result.originalTokens).toBe(1500);
      expect(result.compressedTokens).toBe(750);
      expect(mockGenerateText).toHaveBeenCalled();
    });

    it("should include goal in prompt when provided", async () => {
      mockTokenizerCount.mockReturnValue(1500);
      mockGenerateText.mockResolvedValue({ text: "Compressed" });

      await compressor.compress(
        "content",
        { enabled: true, tokenThreshold: 1000, maxOutputTokens: 2000, goalAware: true },
        "Find user information"
      );

      const call = mockGenerateText.mock.calls[0][0];
      const userMessage = call.messages.find((m: { role: string }) => m.role === "user");
      expect(userMessage.content).toContain("Find user information");
    });

    it("should extract content from <think> tags", async () => {
      mockTokenizerCount.mockReturnValueOnce(1500);
      mockTokenizerCount.mockReturnValueOnce(100);

      mockGenerateText.mockResolvedValue({
        text: "<think>Analysis here</think>Main response content",
      });

      const result = await compressor.compress(
        "content",
        { enabled: true, tokenThreshold: 1000, goalAware: true }
      );

      expect(result.compressed).toBe("Main response content");
      expect(result.wasCompressed).toBe(true);
    });

    it("should use think content as fallback when main is empty", async () => {
      mockTokenizerCount.mockReturnValueOnce(1500);
      mockTokenizerCount.mockReturnValueOnce(100);

      mockGenerateText.mockResolvedValue({
        text: "<think>Fallback content</think>",
      });

      const result = await compressor.compress(
        "content",
        { enabled: true, tokenThreshold: 1000, goalAware: true }
      );

      expect(result.compressed).toBe("Fallback content");
      expect(result.wasCompressed).toBe(true);
    });

    it("should handle empty LLM response", async () => {
      mockTokenizerCount.mockReturnValue(1500);
      mockGenerateText.mockResolvedValue({ text: "" });

      const result = await compressor.compress(
        "content",
        { enabled: true, tokenThreshold: 1000, goalAware: true }
      );

      expect(result.wasCompressed).toBe(false);
      expect(result.compressed).toBe("content");
    });

    it("should handle LLM errors", async () => {
      mockTokenizerCount.mockReturnValue(1500);
      mockGenerateText.mockRejectedValue(new Error("LLM timeout"));

      const result = await compressor.compress(
        "content",
        { enabled: true, tokenThreshold: 1000, goalAware: true }
      );

      expect(result.wasCompressed).toBe(false);
      expect(result.compressed).toBe("content");
    });

    it("should detect and use appropriate strategy", async () => {
      mockTokenizerCount.mockReturnValueOnce(1500);
      mockTokenizerCount.mockReturnValueOnce(500);

      mockGenerateText.mockResolvedValue({ text: "Compressed" });

      const jsonContent = '{"key": "value", "array": [1, 2, 3]}';
      const result = await compressor.compress(
        jsonContent,
        { enabled: true, tokenThreshold: 1000, goalAware: true }
      );

      expect(result.strategy).toBe("json");
    });

    it("should include custom instructions in prompt", async () => {
      mockTokenizerCount.mockReturnValue(1500);
      mockGenerateText.mockResolvedValue({ text: "Compressed" });

      await compressor.compress(
        "content",
        {
          enabled: true,
          tokenThreshold: 1000,
          goalAware: true,
          customInstructions: "Focus on key points only",
        }
      );

      const call = mockGenerateText.mock.calls[0][0];
      const systemMessage = call.messages.find((m: { role: string }) => m.role === "system");
      expect(systemMessage.content).toContain("Focus on key points only");
    });

    it("should pass maxOutputTokens to LLM", async () => {
      mockTokenizerCount.mockReturnValue(1500);
      mockGenerateText.mockResolvedValue({ text: "Compressed" });

      await compressor.compress(
        "content",
        { enabled: true, tokenThreshold: 1000, maxOutputTokens: 3000, goalAware: true }
      );

      const call = mockGenerateText.mock.calls[0][0];
      expect(call.maxOutputTokens).toBe(3000);
    });

    it("should truncate very long content in debug logs", async () => {
      // Create content longer than 500 chars to trigger truncation
      const longContent = "a".repeat(1000);

      mockTokenizerCount.mockReturnValueOnce(1500);
      mockTokenizerCount.mockReturnValueOnce(750);
      mockGenerateText.mockResolvedValue({
        text: "Compressed output",
      });

      const result = await compressor.compress(
        longContent,
        { enabled: true, tokenThreshold: 1000, maxOutputTokens: 2000, goalAware: true }
      );

      // Verify compression happened
      expect(result.wasCompressed).toBe(true);
      expect(result.compressed).toBe("Compressed output");
      expect(mockGenerateText).toHaveBeenCalled();

      // The content preview logic was exercised (line 185-186 coverage)
      // We can't directly verify log output, but the code path was hit
    });
  });

  describe("compressToolResult", () => {
    it("should skip compression when disabled for tool", async () => {
      vi.mocked(mockResolver.resolveCompressionPolicy!).mockReturnValue({
        enabled: false,
        tokenThreshold: 1000,
        goalAware: false,
      });

      const result: CallToolResult = {
        content: [{ type: "text", text: "Response" }],
      };

      const compressed = await compressor.compressToolResult(result, "test-tool");

      expect(compressed).toEqual(result);
      expect(mockGenerateText).not.toHaveBeenCalled();
    });

    it("should skip compression when no text content", async () => {
      const result: CallToolResult = {
        content: [
          { type: "image", data: "base64data", mimeType: "image/png" },
        ],
      };

      const compressed = await compressor.compressToolResult(result, "test-tool");

      expect(compressed).toEqual(result);
      expect(mockGenerateText).not.toHaveBeenCalled();
    });

    it("should skip compression when under threshold", async () => {
      mockTokenizerCount.mockReturnValue(500);

      const result: CallToolResult = {
        content: [{ type: "text", text: "Short response" }],
      };

      const compressed = await compressor.compressToolResult(result, "test-tool");

      expect(compressed).toEqual(result);
      expect(mockGenerateText).not.toHaveBeenCalled();
    });

    it("should compress when over threshold", async () => {
      mockTokenizerCount.mockReturnValueOnce(1500); // Combined text
      mockTokenizerCount.mockReturnValueOnce(1500); // Original in compress()
      mockTokenizerCount.mockReturnValueOnce(750); // Compressed

      mockGenerateText.mockResolvedValue({ text: "Compressed response" });

      const result: CallToolResult = {
        content: [{ type: "text", text: "Long response that needs compression" }],
      };

      const compressed = await compressor.compressToolResult(result, "test-tool");

      expect(compressed.content).toHaveLength(1);
      expect(compressed.content[0].type).toBe("text");

      const textContent = compressed.content[0] as { type: "text"; text: string };
      expect(textContent.text).toContain("Compressed response");
      expect(textContent.text).toContain("[Compressed:");
      expect(mockGenerateText).toHaveBeenCalled();
    });

    it("should apply escalation multiplier to maxOutputTokens", async () => {
      mockTokenizerCount.mockReturnValue(1500);
      mockGenerateText.mockResolvedValue({ text: "Compressed" });

      vi.mocked(mockResolver.resolveCompressionPolicy!).mockReturnValue({
        enabled: true,
        tokenThreshold: 1000,
        maxOutputTokens: 2000,
        goalAware: true,
      });

      const result: CallToolResult = {
        content: [{ type: "text", text: "Long content" }],
      };

      await compressor.compressToolResult(result, "test-tool", undefined, 1.5);

      const call = mockGenerateText.mock.calls[0][0];
      expect(call.maxOutputTokens).toBe(3000); // 2000 * 1.5
    });

    it("should not apply escalation when multiplier is 1", async () => {
      mockTokenizerCount.mockReturnValue(1500);
      mockGenerateText.mockResolvedValue({ text: "Compressed" });

      vi.mocked(mockResolver.resolveCompressionPolicy!).mockReturnValue({
        enabled: true,
        tokenThreshold: 1000,
        maxOutputTokens: 2000,
        goalAware: true,
      });

      const result: CallToolResult = {
        content: [{ type: "text", text: "Long content" }],
      };

      await compressor.compressToolResult(result, "test-tool", undefined, 1.0);

      const call = mockGenerateText.mock.calls[0][0];
      expect(call.maxOutputTokens).toBe(2000); // No escalation
    });

    it("should include escalation in metadata header", async () => {
      mockTokenizerCount.mockReturnValueOnce(1500);
      mockTokenizerCount.mockReturnValueOnce(1500);
      mockTokenizerCount.mockReturnValueOnce(750);

      mockGenerateText.mockResolvedValue({ text: "Compressed" });

      const result: CallToolResult = {
        content: [{ type: "text", text: "Long content" }],
      };

      const compressed = await compressor.compressToolResult(
        result,
        "test-tool",
        undefined,
        2.0
      );

      const textContent = compressed.content[0] as { type: "text"; text: string };
      expect(textContent.text).toContain("escalation: 2x");
    });

    it("should pass goal to compress method", async () => {
      mockTokenizerCount.mockReturnValue(1500);
      mockGenerateText.mockResolvedValue({ text: "Compressed" });

      const result: CallToolResult = {
        content: [{ type: "text", text: "Long content" }],
      };

      await compressor.compressToolResult(result, "test-tool", "Find user data");

      const call = mockGenerateText.mock.calls[0][0];
      const userMessage = call.messages.find((m: { role: string }) => m.role === "user");
      expect(userMessage.content).toContain("Find user data");
    });

    it("should combine multiple text contents before compression", async () => {
      mockTokenizerCount.mockReturnValueOnce(1500); // Combined
      mockTokenizerCount.mockReturnValueOnce(1500); // Original
      mockTokenizerCount.mockReturnValueOnce(500); // Compressed

      mockGenerateText.mockResolvedValue({ text: "Compressed" });

      const result: CallToolResult = {
        content: [
          { type: "text", text: "Part 1" },
          { type: "text", text: "Part 2" },
        ],
      };

      await compressor.compressToolResult(result, "test-tool");

      // Should combine with newline
      const call = mockGenerateText.mock.calls[0][0];
      const userMessage = call.messages.find((m: { role: string }) => m.role === "user");
      expect(userMessage.content).toContain("Part 1\nPart 2");
    });

    it("should deduplicate text content after compression", async () => {
      mockTokenizerCount.mockReturnValueOnce(1500);
      mockTokenizerCount.mockReturnValueOnce(1500);
      mockTokenizerCount.mockReturnValueOnce(500);

      mockGenerateText.mockResolvedValue({ text: "Compressed" });

      const result: CallToolResult = {
        content: [
          { type: "text", text: "Part 1" },
          { type: "text", text: "Part 2" },
          { type: "image", data: "img", mimeType: "image/png" },
        ],
      };

      const compressed = await compressor.compressToolResult(result, "test-tool");

      // Should have only 1 text content (compressed) + image
      expect(compressed.content).toHaveLength(2);
      expect(compressed.content[0].type).toBe("text");
      expect(compressed.content[1].type).toBe("image");
    });

    it("should preserve isError flag", async () => {
      mockTokenizerCount.mockReturnValueOnce(1500);
      mockTokenizerCount.mockReturnValueOnce(1500);
      mockTokenizerCount.mockReturnValueOnce(500);

      mockGenerateText.mockResolvedValue({ text: "Compressed error" });

      const result: CallToolResult = {
        content: [{ type: "text", text: "Long error message" }],
        isError: true,
      };

      const compressed = await compressor.compressToolResult(result, "test-tool");

      expect(compressed.isError).toBe(true);
    });

    it("should return original when compression fails", async () => {
      mockTokenizerCount.mockReturnValue(1500);
      mockGenerateText.mockRejectedValue(new Error("LLM failed"));

      const result: CallToolResult = {
        content: [{ type: "text", text: "Long content" }],
      };

      const compressed = await compressor.compressToolResult(result, "test-tool");

      expect(compressed).toEqual(result);
    });

    it("should handle undefined toolName in log messages", async () => {
      vi.mocked(mockResolver.resolveCompressionPolicy!).mockReturnValue({
        enabled: true,
        tokenThreshold: 1000,
        maxOutputTokens: 2000,
        goalAware: true,
      });

      mockTokenizerCount.mockReturnValueOnce(1500); // Combined
      mockTokenizerCount.mockReturnValueOnce(1500); // Original
      mockTokenizerCount.mockReturnValueOnce(750); // Compressed
      mockGenerateText.mockResolvedValue({ text: "Compressed" });

      const result: CallToolResult = {
        content: [{ type: "text", text: "Long content" }],
      };

      // Call with undefined toolName to trigger "unknown" fallback in logs
      const compressed = await compressor.compressToolResult(result, undefined);

      const textContent = compressed.content[0] as { type: "text"; text: string };
      expect(textContent.text).toContain("Compressed");
    });

    it("should handle multiple think tags in LLM response", async () => {
      vi.mocked(mockResolver.resolveCompressionPolicy!).mockReturnValue({
        enabled: true,
        tokenThreshold: 1000,
        maxOutputTokens: 2000,
        goalAware: true,
      });

      mockTokenizerCount.mockReturnValueOnce(1500); // Combined
      mockTokenizerCount.mockReturnValueOnce(1500); // Original
      mockTokenizerCount.mockReturnValueOnce(100); // Compressed

      mockGenerateText.mockResolvedValue({
        text: "<think>First thought</think><think>Second thought</think>Final output",
      });

      const result: CallToolResult = {
        content: [{ type: "text", text: "Long content" }],
      };

      const compressed = await compressor.compressToolResult(result, "test-tool");

      const textContent = compressed.content[0] as { type: "text"; text: string };
      expect(textContent.text).toContain("Final output");
    });

    it("should handle long compressed output in debug logs", async () => {
      vi.mocked(mockResolver.resolveCompressionPolicy!).mockReturnValue({
        enabled: true,
        tokenThreshold: 1000,
        maxOutputTokens: 2000,
        goalAware: true,
      });

      mockTokenizerCount.mockReturnValueOnce(1500); // Combined
      mockTokenizerCount.mockReturnValueOnce(1500); // Original
      mockTokenizerCount.mockReturnValueOnce(300); // Compressed

      // Generate output longer than 200 chars to trigger truncation in logs
      const longOutput = "x".repeat(300);
      mockGenerateText.mockResolvedValue({
        text: longOutput,
      });

      const result: CallToolResult = {
        content: [{ type: "text", text: "Long content" }],
      };

      const compressed = await compressor.compressToolResult(result, "test-tool");

      const textContent = compressed.content[0] as { type: "text"; text: string };
      // Output includes metadata header plus the long output
      expect(textContent.text).toContain(longOutput);
      expect(textContent.text.length).toBeGreaterThan(200);
    });
  });

  describe("compressResourceResult", () => {
    it("should skip compression when disabled", async () => {
      vi.mocked(mockResolver.resolveCompressionPolicy!).mockReturnValue({
        enabled: false,
        tokenThreshold: 1000,
        goalAware: false,
      });

      const result: ReadResourceResult = {
        contents: [
          { uri: "file:///test.txt", text: "Resource content" },
        ],
      };

      const compressed = await compressor.compressResourceResult(result, "file:///test.txt");

      expect(compressed).toEqual(result);
      expect(mockGenerateText).not.toHaveBeenCalled();
    });

    it("should skip compression when under threshold", async () => {
      mockTokenizerCount.mockReturnValue(500);

      const result: ReadResourceResult = {
        contents: [
          { uri: "file:///test.txt", text: "Short content" },
        ],
      };

      const compressed = await compressor.compressResourceResult(result, "file:///test.txt");

      expect(compressed).toEqual(result);
      expect(mockGenerateText).not.toHaveBeenCalled();
    });

    it("should compress when over threshold", async () => {
      mockTokenizerCount.mockReturnValueOnce(1500); // Check
      mockTokenizerCount.mockReturnValueOnce(1500); // Original in compress()
      mockTokenizerCount.mockReturnValueOnce(750); // Compressed

      mockGenerateText.mockResolvedValue({ text: "Compressed resource" });

      const result: ReadResourceResult = {
        contents: [
          { uri: "file:///test.txt", text: "Long resource content that needs compression" },
        ],
      };

      const compressed = await compressor.compressResourceResult(result, "file:///test.txt");

      expect(compressed.contents[0]).toHaveProperty("text", "Compressed resource");
      expect(mockGenerateText).toHaveBeenCalled();
    });

    it("should handle multiple content items", async () => {
      mockTokenizerCount.mockReturnValueOnce(1500); // First item check
      mockTokenizerCount.mockReturnValueOnce(1500); // First original
      mockTokenizerCount.mockReturnValueOnce(500); // First compressed
      mockTokenizerCount.mockReturnValueOnce(800); // Second item check (under threshold)

      mockGenerateText.mockResolvedValue({ text: "Compressed" });

      const result: ReadResourceResult = {
        contents: [
          { uri: "file:///long.txt", text: "Long content" },
          { uri: "file:///short.txt", text: "Short" },
        ],
      };

      const compressed = await compressor.compressResourceResult(result);

      expect(compressed.contents).toHaveLength(2);
      expect(compressed.contents[0]).toHaveProperty("text", "Compressed");
      expect(compressed.contents[1]).toHaveProperty("text", "Short"); // Not compressed
      expect(mockGenerateText).toHaveBeenCalledTimes(1); // Only first item
    });

    it("should skip non-text content", async () => {
      const result: ReadResourceResult = {
        contents: [
          { uri: "file:///image.png", blob: "base64data", mimeType: "image/png" },
        ],
      };

      const compressed = await compressor.compressResourceResult(result);

      expect(compressed).toEqual(result);
      expect(mockGenerateText).not.toHaveBeenCalled();
    });

    it("should preserve uri and other properties", async () => {
      mockTokenizerCount.mockReturnValueOnce(1500);
      mockTokenizerCount.mockReturnValueOnce(1500);
      mockTokenizerCount.mockReturnValueOnce(500);

      mockGenerateText.mockResolvedValue({ text: "Compressed" });

      const result: ReadResourceResult = {
        contents: [
          { uri: "file:///test.txt", text: "Long content", mimeType: "text/plain" },
        ],
      };

      const compressed = await compressor.compressResourceResult(result);

      expect(compressed.contents[0]).toHaveProperty("uri", "file:///test.txt");
      expect(compressed.contents[0]).toHaveProperty("mimeType", "text/plain");
    });

    it("should use default policy (no tool name)", async () => {
      mockTokenizerCount.mockReturnValue(1500);
      mockGenerateText.mockResolvedValue({ text: "Compressed" });

      const result: ReadResourceResult = {
        contents: [
          { uri: "file:///test.txt", text: "Long content" },
        ],
      };

      await compressor.compressResourceResult(result);

      // Should call resolveCompressionPolicy with undefined (default policy)
      expect(mockResolver.resolveCompressionPolicy).toHaveBeenCalledWith(undefined);
    });

    it("should handle compression failures gracefully", async () => {
      mockTokenizerCount.mockReturnValue(1500);
      mockGenerateText.mockRejectedValue(new Error("LLM failed"));

      const result: ReadResourceResult = {
        contents: [
          { uri: "file:///test.txt", text: "Long content" },
        ],
      };

      const compressed = await compressor.compressResourceResult(result);

      // Should return original on failure
      expect(compressed.contents[0]).toHaveProperty("text", "Long content");
    });

    it("should handle undefined resourceUri in log messages", async () => {
      vi.mocked(mockResolver.resolveCompressionPolicy!).mockReturnValue({
        enabled: true,
        tokenThreshold: 1000,
        maxOutputTokens: 2000,
        goalAware: true,
      });

      mockTokenizerCount.mockReturnValueOnce(1500); // Check
      mockTokenizerCount.mockReturnValueOnce(1500); // Original in compress()
      mockTokenizerCount.mockReturnValueOnce(750); // Compressed
      mockGenerateText.mockResolvedValue({ text: "Compressed" });

      const result: ReadResourceResult = {
        contents: [
          { uri: "file:///test.txt", text: "Long content" },
        ],
      };

      // Call with undefined resourceUri to trigger "unknown" fallback in logs
      const compressed = await compressor.compressResourceResult(result, undefined);

      expect(compressed.contents[0]).toHaveProperty("text");
      const content = compressed.contents[0] as { text: string };
      expect(content.text).toBe("Compressed");
    });
  });
});
