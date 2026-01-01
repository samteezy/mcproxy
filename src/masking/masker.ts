import type {
  MaskingConfig,
  MaskingResult,
  MaskedField,
  ResolvedMaskingPolicy,
  PIIType,
} from "../types.js";
import {
  getPatternsForTypes,
  createCustomPattern,
  clonePattern,
  type PIIPattern,
} from "./patterns.js";
import { LLMDetector } from "./llm-detector.js";
import { getLogger } from "../logger.js";

const DEFAULT_PII_TYPES: PIIType[] = [
  "email",
  "ssn",
  "phone",
  "credit_card",
  "ip_address",
];

/**
 * Map PII type to placeholder prefix
 */
const PII_TYPE_PREFIXES: Record<PIIType, string> = {
  email: "EMAIL",
  ssn: "SSN",
  phone: "PHONE",
  credit_card: "CREDIT_CARD",
  ip_address: "IP",
  date_of_birth: "DOB",
  passport: "PASSPORT",
  driver_license: "DL",
  custom: "PII",
};

/**
 * Context for tracking placeholders during a single masking operation
 */
interface MaskingContext {
  /** Counter for each PII type */
  counters: Map<PIIType, number>;
  /** Map of placeholder to original value */
  restorationMap: Map<string, string>;
  /** Masked fields */
  maskedFields: MaskedField[];
}

/**
 * PII Masker - masks sensitive data in tool arguments before forwarding to upstream servers
 */
export class Masker {
  private config: MaskingConfig;
  private llmDetector: LLMDetector | null = null;

  constructor(config: MaskingConfig) {
    this.config = config;

    // Initialize LLM detector if configured
    if (config.llmConfig) {
      this.llmDetector = new LLMDetector(config.llmConfig);
    }
  }

  /**
   * Check if masking is globally enabled
   */
  isEnabled(): boolean {
    return this.config.enabled;
  }

  /**
   * Resolve the masking policy for a specific tool
   */
  resolvePolicy(toolName?: string): ResolvedMaskingPolicy {
    const defaultPolicy = this.config.defaultPolicy;

    const basePolicy: ResolvedMaskingPolicy = {
      enabled: defaultPolicy.enabled,
      piiTypes: defaultPolicy.piiTypes ?? DEFAULT_PII_TYPES,
      llmFallback: defaultPolicy.llmFallback ?? false,
      llmFallbackThreshold: defaultPolicy.llmFallbackThreshold ?? 0.7,
      customPatterns: defaultPolicy.customPatterns ?? {},
    };

    if (!toolName || !this.config.toolPolicies) {
      return basePolicy;
    }

    const toolPolicy = this.config.toolPolicies[toolName];
    if (!toolPolicy) {
      return basePolicy;
    }

    // Merge: tool policy overrides default
    return {
      enabled: toolPolicy.enabled ?? basePolicy.enabled,
      piiTypes: toolPolicy.piiTypes ?? basePolicy.piiTypes,
      llmFallback: toolPolicy.llmFallback ?? basePolicy.llmFallback,
      llmFallbackThreshold:
        toolPolicy.llmFallbackThreshold ?? basePolicy.llmFallbackThreshold,
      customPatterns: {
        ...basePolicy.customPatterns,
        ...(toolPolicy.customPatterns ?? {}),
      },
    };
  }

  /**
   * Mask PII in tool arguments
   */
  async maskToolArgs(
    args: Record<string, unknown>,
    toolName?: string
  ): Promise<MaskingResult> {
    const logger = getLogger();
    const emptyResult: MaskingResult = {
      original: args,
      masked: args,
      wasMasked: false,
      maskedFields: [],
      restorationMap: new Map(),
    };

    // Check global enable
    if (!this.config.enabled) {
      return emptyResult;
    }

    const policy = this.resolvePolicy(toolName);

    // Check tool-specific enable
    if (!policy.enabled) {
      logger.debug(`Masking disabled for tool: ${toolName ?? "unknown"}`);
      return emptyResult;
    }

    // Create context for this masking operation
    const context: MaskingContext = {
      counters: new Map(),
      restorationMap: new Map(),
      maskedFields: [],
    };

    const masked = await this.maskValue(args, "", policy, context);

    if (context.maskedFields.length > 0) {
      logger.info(
        `Masked ${context.maskedFields.length} PII field(s) in tool '${toolName ?? "unknown"}': ${context.maskedFields.map((f) => `${f.path}(${f.piiType})`).join(", ")}`
      );
    }

    return {
      original: args,
      masked: masked as Record<string, unknown>,
      wasMasked: context.maskedFields.length > 0,
      maskedFields: context.maskedFields,
      restorationMap: context.restorationMap,
    };
  }

  /**
   * Restore original values in a string using the restoration map
   */
  static restoreOriginals(text: string, restorationMap: Map<string, string>): string {
    let result = text;
    for (const [placeholder, original] of restorationMap) {
      // Use replaceAll to handle multiple occurrences
      result = result.split(placeholder).join(original);
    }
    return result;
  }

  /**
   * Recursively mask a value (object, array, or primitive)
   */
  private async maskValue(
    value: unknown,
    path: string,
    policy: ResolvedMaskingPolicy,
    context: MaskingContext
  ): Promise<unknown> {
    if (typeof value === "string") {
      return this.maskString(value, path, policy, context);
    }

    if (Array.isArray(value)) {
      const results = await Promise.all(
        value.map((item, index) =>
          this.maskValue(item, `${path}[${index}]`, policy, context)
        )
      );
      return results;
    }

    if (value !== null && typeof value === "object") {
      const result: Record<string, unknown> = {};
      for (const [key, val] of Object.entries(value)) {
        const fieldPath = path ? `${path}.${key}` : key;
        result[key] = await this.maskValue(val, fieldPath, policy, context);
      }
      return result;
    }

    // Primitive non-string values pass through
    return value;
  }

  /**
   * Get the next placeholder for a PII type
   */
  private getNextPlaceholder(piiType: PIIType, context: MaskingContext): string {
    const currentCount = context.counters.get(piiType) ?? 0;
    const nextCount = currentCount + 1;
    context.counters.set(piiType, nextCount);

    const prefix = PII_TYPE_PREFIXES[piiType] ?? "PII";
    return `[${prefix}_${nextCount}]`;
  }

  /**
   * Mask PII in a string value
   */
  private async maskString(
    text: string,
    path: string,
    policy: ResolvedMaskingPolicy,
    context: MaskingContext
  ): Promise<string> {
    const logger = getLogger();

    // Collect patterns
    const patterns: PIIPattern[] = [];

    // Add built-in patterns for enabled PII types
    for (const pattern of getPatternsForTypes(policy.piiTypes)) {
      patterns.push(clonePattern(pattern));
    }

    // Add custom patterns
    for (const [name, patternDef] of Object.entries(policy.customPatterns)) {
      patterns.push(createCustomPattern(name, patternDef));
    }

    let result = text;
    let minConfidence = 1.0;
    const matchedTypes = new Set<PIIType>();

    // Apply regex patterns with numbered placeholders
    for (const pattern of patterns) {
      const matches = text.match(pattern.regex);
      if (matches && matches.length > 0) {
        // Replace each match with a unique numbered placeholder
        result = result.replace(pattern.regex, (match) => {
          const placeholder = this.getNextPlaceholder(pattern.type, context);
          context.restorationMap.set(placeholder, match);
          context.maskedFields.push({
            path,
            piiType: pattern.type,
            detectionMethod: "regex",
          });
          return placeholder;
        });

        matchedTypes.add(pattern.type);

        // Track minimum confidence for LLM fallback decision
        if (pattern.confidence < minConfidence) {
          minConfidence = pattern.confidence;
        }
      }
    }

    // Check if LLM fallback is needed
    const needsLlmFallback =
      policy.llmFallback &&
      this.llmDetector &&
      minConfidence < policy.llmFallbackThreshold;

    if (needsLlmFallback && this.llmDetector) {
      logger.debug(
        `Low confidence (${minConfidence.toFixed(2)}) for '${path}', using LLM fallback`
      );

      try {
        // Send original text to LLM for verification/additional detection
        const llmResult = await this.llmDetector.detectAndMask(
          text,
          policy.piiTypes
        );

        if (llmResult.hasPII) {
          // LLM detected PII - we need to re-mask with numbered placeholders
          // Parse the LLM result to find what was masked and create proper placeholders
          // For simplicity, we replace LLM generic placeholders with our numbered ones
          let llmMasked = llmResult.maskedText;

          for (const type of llmResult.detectedTypes) {
            const genericPlaceholder = this.getLLMPlaceholder(type);
            const regex = new RegExp(genericPlaceholder.replace(/[[\]]/g, '\\$&'), 'g');

            llmMasked = llmMasked.replace(regex, () => {
              const placeholder = this.getNextPlaceholder(type, context);
              // We don't have the original from LLM, but we can try to find it
              // For now, store a marker that this was LLM-detected
              context.restorationMap.set(placeholder, `<LLM_DETECTED_${type}>`);
              if (!matchedTypes.has(type)) {
                context.maskedFields.push({
                  path,
                  piiType: type,
                  detectionMethod: "llm",
                });
              }
              return placeholder;
            });
          }

          result = llmMasked;
        }
      } catch (error) {
        logger.error("LLM fallback failed:", error);
        // Continue with regex results on failure
      }
    }

    return result;
  }

  /**
   * Get the generic placeholder used by LLM for a PII type
   */
  private getLLMPlaceholder(piiType: PIIType): string {
    const placeholders: Record<PIIType, string> = {
      email: "[EMAIL_REDACTED]",
      ssn: "[SSN_REDACTED]",
      phone: "[PHONE_REDACTED]",
      credit_card: "[CREDIT_CARD_REDACTED]",
      ip_address: "[IP_REDACTED]",
      date_of_birth: "[DOB_REDACTED]",
      passport: "[PASSPORT_REDACTED]",
      driver_license: "[DL_REDACTED]",
      custom: "[PII_REDACTED]",
    };
    return placeholders[piiType] ?? "[PII_REDACTED]";
  }
}
