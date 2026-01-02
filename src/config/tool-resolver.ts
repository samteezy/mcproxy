import type {
  mcproxyConfig,
  UpstreamServerConfig,
  ToolConfig,
  CompressionPolicy,
  MaskingPolicy,
  ResolvedCompressionPolicy,
  ResolvedMaskingPolicy,
  PIIType,
} from "../types.js";

const DEFAULT_PII_TYPES: PIIType[] = [
  "email",
  "ssn",
  "phone",
  "credit_card",
  "ip_address",
];

/**
 * Centralized resolver for tool-specific configurations.
 * Handles parsing namespaced tool names and resolving policies
 * from upstream definitions with fallback to global defaults.
 */
export class ToolConfigResolver {
  private upstreams: UpstreamServerConfig[];
  private defaultCompressionPolicy: CompressionPolicy & {
    enabled: boolean;
    tokenThreshold: number;
  };
  private defaultMaskingPolicy: MaskingPolicy & { enabled: boolean };
  private globalGoalAware: boolean;

  constructor(config: mcproxyConfig) {
    this.upstreams = config.upstreams;
    this.defaultCompressionPolicy = config.compression.defaultPolicy;
    this.defaultMaskingPolicy = config.masking?.defaultPolicy ?? {
      enabled: false,
      piiTypes: DEFAULT_PII_TYPES,
      llmFallback: false,
      llmFallbackThreshold: "low",
    };
    this.globalGoalAware = config.compression.goalAware ?? true;
  }

  /**
   * Parse namespaced tool name into upstream ID and original name.
   * Format: "upstreamId__originalName"
   */
  private parseToolName(
    namespacedName: string
  ): { upstreamId: string; originalName: string } | null {
    const separatorIndex = namespacedName.indexOf("__");
    if (separatorIndex === -1) return null;
    return {
      upstreamId: namespacedName.substring(0, separatorIndex),
      originalName: namespacedName.substring(separatorIndex + 2),
    };
  }

  /**
   * Get tool config from upstream definition.
   */
  getToolConfig(namespacedName: string): ToolConfig | undefined {
    const parsed = this.parseToolName(namespacedName);
    if (!parsed) return undefined;

    const upstream = this.upstreams.find((u) => u.id === parsed.upstreamId);
    return upstream?.tools?.[parsed.originalName];
  }

  /**
   * Check if a tool is hidden.
   */
  isToolHidden(namespacedName: string): boolean {
    const toolConfig = this.getToolConfig(namespacedName);
    return toolConfig?.hidden === true;
  }

  /**
   * Check if goal-aware compression is enabled for a tool.
   */
  isGoalAwareEnabled(namespacedName: string): boolean {
    const toolConfig = this.getToolConfig(namespacedName);
    if (toolConfig?.compression?.goalAware !== undefined) {
      return toolConfig.compression.goalAware;
    }
    return this.globalGoalAware;
  }

  /**
   * Get description override for a tool.
   */
  getDescriptionOverride(namespacedName: string): string | undefined {
    return this.getToolConfig(namespacedName)?.overwriteDescription;
  }

  /**
   * Resolve compression policy for a tool.
   * Priority: tool-level → global default
   */
  resolveCompressionPolicy(namespacedName?: string): ResolvedCompressionPolicy {
    const base = this.defaultCompressionPolicy;
    const toolCompression = namespacedName
      ? this.getToolConfig(namespacedName)?.compression
      : undefined;

    return {
      enabled: toolCompression?.enabled ?? base.enabled,
      tokenThreshold: toolCompression?.tokenThreshold ?? base.tokenThreshold,
      maxOutputTokens:
        toolCompression?.maxOutputTokens ?? base.maxOutputTokens,
      customInstructions: toolCompression?.customInstructions,
    };
  }

  /**
   * Resolve masking policy for a tool.
   * Priority: tool-level → global default
   */
  resolveMaskingPolicy(namespacedName?: string): ResolvedMaskingPolicy {
    const base = this.defaultMaskingPolicy;
    const toolMasking = namespacedName
      ? this.getToolConfig(namespacedName)?.masking
      : undefined;

    return {
      enabled: toolMasking?.enabled ?? base.enabled,
      piiTypes: toolMasking?.piiTypes ?? base.piiTypes ?? DEFAULT_PII_TYPES,
      llmFallback: toolMasking?.llmFallback ?? base.llmFallback ?? false,
      llmFallbackThreshold:
        toolMasking?.llmFallbackThreshold ??
        base.llmFallbackThreshold ??
        "low",
      customPatterns: {
        ...(base.customPatterns ?? {}),
        ...(toolMasking?.customPatterns ?? {}),
      },
    };
  }
}
