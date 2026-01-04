import type {
  MaskingConfig,
  MaskingResult,
  MaskedField,
  ResolvedMaskingPolicy,
  PIIType,
  PatternConfidence,
} from "../types.js";
import type { ToolConfigResolver } from "../config/tool-resolver.js";
import {
  getPatternsForTypes,
  createCustomPattern,
  clonePattern,
  type PIIPattern,
} from "./patterns.js";
import { LLMDetector } from "./llm-detector.js";
import { getLogger } from "../logger.js";

/**
 * Confidence level ordering (higher index = higher confidence)
 */
const CONFIDENCE_ORDER: PatternConfidence[] = ["low", "medium", "high"];

/**
 * Check if confidence is at or below the threshold (should trigger LLM fallback)
 */
function shouldTriggerLlmFallback(
  confidence: PatternConfidence,
  threshold: PatternConfidence
): boolean {
  const confIndex = CONFIDENCE_ORDER.indexOf(confidence);
  const threshIndex = CONFIDENCE_ORDER.indexOf(threshold);
  return confIndex <= threshIndex;
}

/**
 * Get the lower of two confidence levels
 */
function minConfidence(
  a: PatternConfidence,
  b: PatternConfidence
): PatternConfidence {
  const aIndex = CONFIDENCE_ORDER.indexOf(a);
  const bIndex = CONFIDENCE_ORDER.indexOf(b);
  return aIndex <= bIndex ? a : b;
}

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
  private resolver: ToolConfigResolver;
  private llmDetector: LLMDetector | null = null;

  constructor(config: MaskingConfig, resolver: ToolConfigResolver) {
    this.config = config;
    this.resolver = resolver;

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
   * Resolve the masking policy for a specific tool.
   * Delegates to ToolConfigResolver for upstream-aware resolution.
   */
  resolvePolicy(toolName?: string): ResolvedMaskingPolicy {
    return this.resolver.resolveMaskingPolicy(toolName);
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
      masked,
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
      result = result.replaceAll(placeholder, original);
    }
    return result;
  }

  /**
   * Recursively mask a value (object, array, or primitive)
   */
  private async maskValue<T>(
    value: T,
    path: string,
    policy: ResolvedMaskingPolicy,
    context: MaskingContext
  ): Promise<T> {
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
   * Collect all patterns for masking based on policy
   */
  private collectPatterns(policy: ResolvedMaskingPolicy): PIIPattern[] {
    const patterns: PIIPattern[] = [];

    // Add built-in patterns for enabled PII types
    for (const pattern of getPatternsForTypes(policy.piiTypes)) {
      patterns.push(clonePattern(pattern));
    }

    // Add custom patterns
    for (const [name, patternDef] of Object.entries(policy.customPatterns)) {
      patterns.push(createCustomPattern(name, patternDef));
    }

    return patterns;
  }

  /**
   * Apply regex patterns and return masked text with metadata
   */
  private applyRegexPatterns(
    text: string,
    path: string,
    patterns: PIIPattern[],
    context: MaskingContext
  ): { result: string; lowestConfidence: PatternConfidence; matchedTypes: Set<PIIType> } {
    let result = text;
    let lowestConfidence: PatternConfidence = "high";
    const matchedTypes = new Set<PIIType>();

    for (const pattern of patterns) {
      const matches = text.match(pattern.regex);
      if (matches && matches.length > 0) {
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
        lowestConfidence = minConfidence(lowestConfidence, pattern.confidence);
      }
    }

    return { result, lowestConfidence, matchedTypes };
  }

  /**
   * Apply LLM fallback detection if needed
   */
  private async applyLlmFallback(
    originalText: string,
    currentResult: string,
    path: string,
    policy: ResolvedMaskingPolicy,
    matchedTypes: Set<PIIType>,
    context: MaskingContext
  ): Promise<string> {
    const logger = getLogger();

    if (!this.llmDetector) {
      return currentResult;
    }

    try {
      const llmResult = await this.llmDetector.detectAndMask(
        originalText,
        policy.piiTypes
      );

      if (!llmResult.hasPII) {
        return currentResult;
      }

      // Replace LLM generic placeholders with our numbered ones
      let result = llmResult.maskedText;

      for (const type of llmResult.detectedTypes) {
        const genericPlaceholder = this.getLLMPlaceholder(type);
        const regex = new RegExp(genericPlaceholder.replace(/[[\]]/g, "\\$&"), "g");

        result = result.replace(regex, () => {
          const placeholder = this.getNextPlaceholder(type, context);
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

      return result;
    } catch (error) {
      logger.error("LLM fallback failed:", error);
      return currentResult;
    }
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

    const patterns = this.collectPatterns(policy);
    const { result, lowestConfidence, matchedTypes } = this.applyRegexPatterns(
      text,
      path,
      patterns,
      context
    );

    // Check if LLM fallback is needed
    const needsLlmFallback =
      policy.llmFallback &&
      this.llmDetector &&
      shouldTriggerLlmFallback(lowestConfidence, policy.llmFallbackThreshold);

    if (needsLlmFallback) {
      logger.debug(`${lowestConfidence} confidence for '${path}', using LLM fallback`);
      return this.applyLlmFallback(text, result, path, policy, matchedTypes, context);
    }

    return result;
  }

  /**
   * Get the generic placeholder used by LLM for a PII type
   */
  private getLLMPlaceholder(piiType: PIIType): string {
    const prefix = PII_TYPE_PREFIXES[piiType] ?? "PII";
    return `[${prefix}_REDACTED]`;
  }
}
