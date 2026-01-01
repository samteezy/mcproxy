import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { generateText } from "ai";
import type { MaskingLLMConfig, PIIType } from "../types.js";
import { getLogger } from "../logger.js";

/**
 * Result from LLM-based PII detection
 */
export interface LLMDetectionResult {
  /** Whether PII was detected */
  hasPII: boolean;
  /** Types of PII detected */
  detectedTypes: PIIType[];
  /** Text with PII masked */
  maskedText: string;
}

/**
 * LLM-based PII detector for ambiguous cases where regex confidence is low
 */
export class LLMDetector {
  private provider: ReturnType<typeof createOpenAICompatible>;
  private model: string;

  constructor(config: MaskingLLMConfig) {
    this.provider = createOpenAICompatible({
      name: "masking-provider",
      apiKey: config.apiKey || "not-needed",
      baseURL: config.baseUrl,
    });
    this.model = config.model;
  }

  /**
   * Detect and mask PII in text using LLM
   */
  async detectAndMask(
    text: string,
    piiTypes: PIIType[]
  ): Promise<LLMDetectionResult> {
    const logger = getLogger();

    const prompt = `<text>
${text}
</text>

<task>
Analyze the text above for Personally Identifiable Information (PII).
Look specifically for these types: ${piiTypes.join(", ")}

If PII is found, replace each instance with the appropriate placeholder:
- email: [EMAIL_REDACTED]
- ssn: [SSN_REDACTED]
- phone: [PHONE_REDACTED]
- credit_card: [CREDIT_CARD_REDACTED]
- ip_address: [IP_REDACTED]
- date_of_birth: [DOB_REDACTED]
- passport: [PASSPORT_REDACTED]
- driver_license: [DL_REDACTED]
- custom/other: [PII_REDACTED]

Respond ONLY with valid JSON in this exact format:
{"hasPII": boolean, "detectedTypes": ["type1", "type2"], "maskedText": "text with PII replaced"}

If no PII is found, return the original text unchanged with hasPII: false and empty detectedTypes array.
</task>`;

    try {
      const { text: response } = await generateText({
        model: this.provider(this.model),
        prompt,
        maxTokens: Math.max(500, text.length * 2),
      });

      // Try to parse JSON response
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        logger.warn("LLM did not return valid JSON for PII detection");
        return {
          hasPII: false,
          detectedTypes: [],
          maskedText: text,
        };
      }

      const parsed = JSON.parse(jsonMatch[0]);
      return {
        hasPII: parsed.hasPII ?? false,
        detectedTypes: (parsed.detectedTypes ?? []) as PIIType[],
        maskedText: parsed.maskedText ?? text,
      };
    } catch (error) {
      logger.error("LLM PII detection failed:", error);
      // Return original text on failure (fail-safe)
      return {
        hasPII: false,
        detectedTypes: [],
        maskedText: text,
      };
    }
  }
}
