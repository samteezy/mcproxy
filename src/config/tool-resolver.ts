import type {
  MCPCPConfig,
  UpstreamServerConfig,
  ToolConfig,
  CompressionPolicy,
  MaskingPolicy,
  ResolvedCompressionPolicy,
  ResolvedMaskingPolicy,
  PIIType,
  RetryEscalationConfig,
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
  private globalBypassEnabled: boolean;
  private globalRetryEscalation: RetryEscalationConfig | undefined;

  constructor(config: MCPCPConfig) {
    this.upstreams = config.upstreams;
    this.defaultCompressionPolicy = config.compression.defaultPolicy;
    this.defaultMaskingPolicy = config.masking?.defaultPolicy ?? {
      enabled: false,
      piiTypes: DEFAULT_PII_TYPES,
      llmFallback: false,
      llmFallbackThreshold: "low",
    };
    this.globalGoalAware = config.compression.goalAware ?? true;
    this.globalBypassEnabled = config.compression.bypassEnabled ?? false;
    this.globalRetryEscalation = config.compression.retryEscalation;
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
   * Check if bypass field injection is enabled globally.
   */
  isBypassEnabled(): boolean {
    return this.globalBypassEnabled;
  }

  /**
   * Get description override for a tool.
   */
  getDescriptionOverride(namespacedName: string): string | undefined {
    return this.getToolConfig(namespacedName)?.overwriteDescription;
  }

  /**
   * Get list of parameters to hide from client schema for a tool.
   */
  getHiddenParameters(namespacedName: string): string[] {
    return this.getToolConfig(namespacedName)?.hideParameters ?? [];
  }

  /**
   * Get parameter overrides to inject before forwarding to upstream.
   */
  getParameterOverrides(namespacedName: string): Record<string, unknown> {
    return this.getToolConfig(namespacedName)?.parameterOverrides ?? {};
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
      retryEscalation: this.globalRetryEscalation,
    };
  }

  /**
   * Get retry escalation config.
   */
  getRetryEscalation(): RetryEscalationConfig | undefined {
    return this.globalRetryEscalation;
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
