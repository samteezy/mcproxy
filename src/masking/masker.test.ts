import { describe, it, expect, vi, beforeEach } from "vitest";
import { Masker } from "./masker.js";
import type { MaskingConfig, ResolvedMaskingPolicy } from "../types.js";
import type { ToolConfigResolver } from "../config/tool-resolver.js";
import { mockGenerateText, resetLlmMocks } from "../test/llm-mocks.js";

// Mock AI SDK for LLM detector
vi.mock("ai", async () => {
  const { mockGenerateText } = await import("../test/llm-mocks.js");
  return {
    generateText: mockGenerateText,
    streamText: vi.fn((options: any) => ({
      text: mockGenerateText(options).then((r: any) => r.text),
    })),
  };
});

// Mock OpenAI compatible provider
const mockProvider = vi.fn((model: string) => model);
vi.mock("@ai-sdk/openai-compatible", () => ({
  createOpenAICompatible: () => mockProvider,
}));

describe("Masker", () => {
  let mockResolver: Partial<ToolConfigResolver>;
  let basicConfig: MaskingConfig;
  let masker: Masker;

  beforeEach(() => {
    resetLlmMocks();
    mockProvider.mockClear();

    // Default mock resolver
    mockResolver = {
      resolveMaskingPolicy: vi.fn().mockReturnValue({
        enabled: true,
        piiTypes: ["email", "phone", "ssn"],
        customPatterns: {},
        llmFallback: false,
        llmFallbackThreshold: "medium",
      } as ResolvedMaskingPolicy),
    };

    // Basic config without LLM
    basicConfig = {
      enabled: true,
    };

    masker = new Masker(basicConfig, mockResolver as ToolConfigResolver);
  });

  describe("constructor", () => {
    it("should initialize without LLM detector", () => {
      expect(masker).toBeDefined();
      expect(masker.isEnabled()).toBe(true);
    });

    it("should initialize with LLM detector when config provided", () => {
      const configWithLlm: MaskingConfig = {
        ...basicConfig,
        llmConfig: {
          baseUrl: "http://localhost:8080/v1",
          model: "test-model",
        },
      };

      const maskerWithLlm = new Masker(
        configWithLlm,
        mockResolver as ToolConfigResolver
      );

      expect(maskerWithLlm).toBeDefined();
    });
  });

  describe("isEnabled", () => {
    it("should return true when enabled", () => {
      expect(masker.isEnabled()).toBe(true);
    });

    it("should return false when disabled", () => {
      const disabledConfig = { ...basicConfig, enabled: false };
      const disabledMasker = new Masker(
        disabledConfig,
        mockResolver as ToolConfigResolver
      );

      expect(disabledMasker.isEnabled()).toBe(false);
    });
  });

  describe("resolvePolicy", () => {
    it("should delegate to resolver", () => {
      const policy = masker.resolvePolicy("test-tool");

      expect(mockResolver.resolveMaskingPolicy).toHaveBeenCalledWith("test-tool");
      expect(policy.enabled).toBe(true);
    });

    it("should work without tool name", () => {
      masker.resolvePolicy();

      expect(mockResolver.resolveMaskingPolicy).toHaveBeenCalledWith(undefined);
    });
  });

  describe("maskToolArgs", () => {
    it("should skip masking when globally disabled", async () => {
      const disabledConfig = { ...basicConfig, enabled: false };
      const disabledMasker = new Masker(
        disabledConfig,
        mockResolver as ToolConfigResolver
      );

      const args = { email: "test@example.com" };
      const result = await disabledMasker.maskToolArgs(args);

      expect(result.wasMasked).toBe(false);
      expect(result.masked).toEqual(args);
    });

    it("should skip masking when tool-specific disabled", async () => {
      vi.mocked(mockResolver.resolveMaskingPolicy!).mockReturnValue({
        enabled: false,
        piiTypes: [],
        customPatterns: {},
        llmFallback: false,
        llmFallbackThreshold: "medium",
      });

      const args = { email: "test@example.com" };
      const result = await masker.maskToolArgs(args, "disabled-tool");

      expect(result.wasMasked).toBe(false);
      expect(result.masked).toEqual(args);
    });

    it("should mask email addresses", async () => {
      const args = { userEmail: "john.doe@example.com" };
      const result = await masker.maskToolArgs(args, "test-tool");

      expect(result.wasMasked).toBe(true);
      expect(result.masked.userEmail).toBe("[EMAIL_1]");
      expect(result.maskedFields).toHaveLength(1);
      expect(result.maskedFields[0]).toMatchObject({
        path: "userEmail",
        piiType: "email",
        detectionMethod: "regex",
      });
      expect(result.restorationMap.get("[EMAIL_1]")).toBe("john.doe@example.com");
    });

    it("should mask multiple emails with sequential numbering", async () => {
      const args = {
        email1: "alice@example.com",
        email2: "bob@example.com",
      };
      const result = await masker.maskToolArgs(args);

      expect(result.wasMasked).toBe(true);
      expect(result.masked.email1).toBe("[EMAIL_1]");
      expect(result.masked.email2).toBe("[EMAIL_2]");
      expect(result.maskedFields).toHaveLength(2);
    });

    it("should mask phone numbers", async () => {
      const args = { phone: "555-123-4567" };
      const result = await masker.maskToolArgs(args);

      expect(result.wasMasked).toBe(true);
      expect(result.masked.phone).toBe("[PHONE_1]");
      expect(result.maskedFields[0].piiType).toBe("phone");
    });

    it("should mask SSN", async () => {
      const args = { ssn: "123-45-6789" };
      const result = await masker.maskToolArgs(args);

      expect(result.wasMasked).toBe(true);
      expect(result.masked.ssn).toBe("[SSN_1]");
      expect(result.maskedFields[0].piiType).toBe("ssn");
    });

    it("should mask nested objects", async () => {
      const args = {
        user: {
          contact: {
            email: "nested@example.com",
          },
        },
      };

      const result = await masker.maskToolArgs(args);

      expect(result.wasMasked).toBe(true);
      expect(result.masked).toEqual({
        user: {
          contact: {
            email: "[EMAIL_1]",
          },
        },
      });
      expect(result.maskedFields[0].path).toBe("user.contact.email");
    });

    it("should mask arrays", async () => {
      const args = {
        emails: ["first@example.com", "second@example.com"],
      };

      const result = await masker.maskToolArgs(args);

      expect(result.wasMasked).toBe(true);
      expect(result.masked.emails).toEqual(["[EMAIL_1]", "[EMAIL_2]"]);
      expect(result.maskedFields).toHaveLength(2);
      expect(result.maskedFields[0].path).toBe("emails[0]");
      expect(result.maskedFields[1].path).toBe("emails[1]");
    });

    it("should handle multiple PII types in same field", async () => {
      const args = {
        text: "Contact me at john@example.com or call 555-123-4567",
      };

      const result = await masker.maskToolArgs(args);

      expect(result.wasMasked).toBe(true);
      expect(result.masked.text).toContain("[EMAIL_1]");
      expect(result.masked.text).toContain("[PHONE_1]");
      expect(result.maskedFields).toHaveLength(2);
    });

    it("should preserve non-string primitives", async () => {
      const args = {
        count: 42,
        enabled: true,
        value: null,
        undef: undefined,
      };

      const result = await masker.maskToolArgs(args);

      expect(result.wasMasked).toBe(false);
      expect(result.masked).toEqual(args);
    });

    it("should use custom patterns from policy", async () => {
      vi.mocked(mockResolver.resolveMaskingPolicy!).mockReturnValue({
        enabled: true,
        piiTypes: [],
        customPatterns: {
          "secret-token": {
            regex: "SECRET-\\d{6}",
            replacement: "[SECRET_REDACTED]",
          },
        },
        llmFallback: false,
        llmFallbackThreshold: "medium",
      });

      const args = {
        token: "SECRET-123456",
      };

      const result = await masker.maskToolArgs(args, "test-tool");

      expect(result.wasMasked).toBe(true);
      expect(result.masked.token).toBe("[PII_1]");
      expect(result.maskedFields[0].piiType).toBe("custom");
    });

    it("should handle empty objects", async () => {
      const args = {};
      const result = await masker.maskToolArgs(args);

      expect(result.wasMasked).toBe(false);
      expect(result.masked).toEqual({});
    });

    it("should handle deeply nested structures", async () => {
      const args = {
        level1: {
          level2: {
            level3: {
              email: "deep@example.com",
            },
          },
        },
      };

      const result = await masker.maskToolArgs(args);

      expect(result.wasMasked).toBe(true);
      expect(result.maskedFields[0].path).toBe("level1.level2.level3.email");
    });
  });

  describe("maskToolArgs with LLM fallback", () => {
    let maskerWithLlm: Masker;

    beforeEach(() => {
      const configWithLlm: MaskingConfig = {
        ...basicConfig,
        llmConfig: {
          baseUrl: "http://localhost:8080/v1",
          model: "test-model",
        },
      };

      maskerWithLlm = new Masker(
        configWithLlm,
        mockResolver as ToolConfigResolver
      );
    });

    it("should use LLM fallback when confidence is low and enabled", async () => {
      vi.mocked(mockResolver.resolveMaskingPolicy!).mockReturnValue({
        enabled: true,
        piiTypes: ["driver_license"], // Uses low confidence pattern
        customPatterns: {},
        llmFallback: true,
        llmFallbackThreshold: "low", // Trigger on low confidence
      });

      mockGenerateText.mockResolvedValue({
        text: JSON.stringify({
          hasPII: true,
          detectedTypes: ["driver_license"],
          maskedText: "License: [DL_REDACTED]",
        }),
      });

      const args = { text: "CA12345678" }; // Matches driver_license low-confidence pattern
      const result = await maskerWithLlm.maskToolArgs(args, "test-tool");

      expect(result.wasMasked).toBe(true);
      expect(mockGenerateText).toHaveBeenCalled();
    });

    it("should not use LLM fallback when confidence is high", async () => {
      vi.mocked(mockResolver.resolveMaskingPolicy!).mockReturnValue({
        enabled: true,
        piiTypes: ["email"],
        customPatterns: {},
        llmFallback: true,
        llmFallbackThreshold: "medium",
      });

      const args = { email: "test@example.com" };
      const result = await maskerWithLlm.maskToolArgs(args);

      expect(result.wasMasked).toBe(true);
      expect(mockGenerateText).not.toHaveBeenCalled(); // High confidence regex, no LLM
    });

    it("should skip LLM fallback when disabled in policy", async () => {
      vi.mocked(mockResolver.resolveMaskingPolicy!).mockReturnValue({
        enabled: true,
        piiTypes: ["driver_license"],
        customPatterns: {},
        llmFallback: false, // Disabled
        llmFallbackThreshold: "low",
      });

      const args = { text: "CA12345678" }; // Low confidence match
      await maskerWithLlm.maskToolArgs(args);

      expect(mockGenerateText).not.toHaveBeenCalled();
    });

    it("should handle LLM fallback returning no PII", async () => {
      vi.mocked(mockResolver.resolveMaskingPolicy!).mockReturnValue({
        enabled: true,
        piiTypes: ["driver_license"],
        customPatterns: {},
        llmFallback: true,
        llmFallbackThreshold: "low",
      });

      mockGenerateText.mockResolvedValue({
        text: JSON.stringify({
          hasPII: false,
          detectedTypes: [],
          maskedText: "CA12345678",
        }),
      });

      const args = { text: "CA12345678" };
      const result = await maskerWithLlm.maskToolArgs(args);

      expect(result.wasMasked).toBe(true); // Regex matched
      expect(result.masked.text).toBe("[DL_1]"); // Regex result kept
    });

    it("should handle LLM fallback errors gracefully", async () => {
      vi.mocked(mockResolver.resolveMaskingPolicy!).mockReturnValue({
        enabled: true,
        piiTypes: ["driver_license"],
        customPatterns: {},
        llmFallback: true,
        llmFallbackThreshold: "low",
      });

      mockGenerateText.mockRejectedValue(new Error("LLM timeout"));

      const args = { text: "CA12345678" };
      const result = await maskerWithLlm.maskToolArgs(args);

      expect(result.wasMasked).toBe(true);
      expect(result.masked.text).toBe("[DL_1]"); // Falls back to regex result
    });

    it("should replace LLM placeholders with numbered ones", async () => {
      vi.mocked(mockResolver.resolveMaskingPolicy!).mockReturnValue({
        enabled: true,
        piiTypes: ["driver_license", "email", "phone"],
        customPatterns: {},
        llmFallback: true,
        llmFallbackThreshold: "low",
      });

      mockGenerateText.mockResolvedValue({
        text: JSON.stringify({
          hasPII: true,
          detectedTypes: ["email", "phone"],
          maskedText:
            "Contact: [EMAIL_REDACTED] or [PHONE_REDACTED]",
        }),
      });

      const args = { text: "CA12345678" }; // Triggers low confidence, then LLM
      const result = await maskerWithLlm.maskToolArgs(args);

      expect(result.masked.text).toContain("[EMAIL_");
      expect(result.masked.text).toContain("[PHONE_");
      expect(result.maskedFields.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe("restoreOriginals", () => {
    it("should restore single placeholder", () => {
      const map = new Map([["[EMAIL_1]", "john@example.com"]]);
      const text = "Contact: [EMAIL_1]";

      const result = Masker.restoreOriginals(text, map);

      expect(result).toBe("Contact: john@example.com");
    });

    it("should restore multiple placeholders", () => {
      const map = new Map([
        ["[EMAIL_1]", "alice@example.com"],
        ["[PHONE_1]", "555-1234"],
      ]);
      const text = "Email: [EMAIL_1], Phone: [PHONE_1]";

      const result = Masker.restoreOriginals(text, map);

      expect(result).toBe("Email: alice@example.com, Phone: 555-1234");
    });

    it("should handle multiple occurrences of same placeholder", () => {
      const map = new Map([["[EMAIL_1]", "test@example.com"]]);
      const text = "[EMAIL_1] sent mail to [EMAIL_1]";

      const result = Masker.restoreOriginals(text, map);

      expect(result).toBe("test@example.com sent mail to test@example.com");
    });

    it("should handle empty restoration map", () => {
      const map = new Map();
      const text = "No placeholders here";

      const result = Masker.restoreOriginals(text, map);

      expect(result).toBe("No placeholders here");
    });

    it("should handle text without placeholders", () => {
      const map = new Map([["[EMAIL_1]", "test@example.com"]]);
      const text = "No placeholders in this text";

      const result = Masker.restoreOriginals(text, map);

      expect(result).toBe("No placeholders in this text");
    });

    it("should handle empty text", () => {
      const map = new Map([["[EMAIL_1]", "test@example.com"]]);
      const text = "";

      const result = Masker.restoreOriginals(text, map);

      expect(result).toBe("");
    });

    it("should preserve order when restoring", () => {
      const map = new Map([
        ["[A]", "first"],
        ["[B]", "second"],
        ["[C]", "third"],
      ]);
      const text = "[C] [A] [B]";

      const result = Masker.restoreOriginals(text, map);

      expect(result).toBe("third first second");
    });
  });
});
