import type {
  MCPCPConfig,
  UpstreamServerConfig,
  ToolConfig,
  CompressionPolicy,
  MaskingPolicy,
  CachePolicy,
  ProxyDefaults,
  ResolvedCompressionPolicy,
  ResolvedMaskingPolicy,
  ResolvedCachePolicy,
  PIIType,
  RetryEscalationConfig,
  PatternConfidence,
} from "../types.js";

const DEFAULT_PII_TYPES: PIIType[] = [
  "email",
  "ssn",
  "phone",
  "credit_card",
  "ip_address",
];

const DEFAULT_COMPRESSION_POLICY: CompressionPolicy & { enabled: boolean; tokenThreshold: number; goalAware: boolean } = {
  enabled: true,
  tokenThreshold: 1000,
  goalAware: true,
};

const DEFAULT_MASKING_POLICY: Required<Omit<MaskingPolicy, "customPatterns">> & { customPatterns: Record<string, any> } = {
  enabled: false,
  piiTypes: DEFAULT_PII_TYPES,
  llmFallback: false,
  llmFallbackThreshold: "low" as PatternConfidence,
  customPatterns: {},
};

const DEFAULT_CACHE_POLICY: Required<CachePolicy> = {
  enabled: true,
  ttlSeconds: 300,
};

/**
 * Centralized resolver for tool-specific configurations.
 * Handles parsing namespaced tool names and resolving policies
 * from upstream definitions with fallback to global defaults.
 * Implements three-level hierarchy: tool > upstream > global
 */
export class ToolConfigResolver {
  private upstreams: UpstreamServerConfig[];
  private globalDefaults: ProxyDefaults;
  private globalBypassEnabled: boolean;
  private globalRetryEscalation: RetryEscalationConfig | undefined;
  private globalMaskingEnabled: boolean;

  constructor(config: MCPCPConfig) {
    this.upstreams = config.upstreams;
    this.globalDefaults = config.defaults;
    this.globalBypassEnabled = config.compression.bypassEnabled ?? false;
    this.globalRetryEscalation = config.compression.retryEscalation;
    this.globalMaskingEnabled = config.masking?.enabled ?? false;
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
   * Uses three-level resolution.
   */
  isGoalAwareEnabled(namespacedName: string): boolean {
    const policy = this.resolveCompressionPolicy(namespacedName);
    return policy.goalAware;
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
   * Merge a tool-specific partial policy with base policy
   */
  private mergePolicy<T extends object>(
    base: T,
    override?: Partial<T>
  ): T {
    if (!override) return base;

    const merged = { ...base };
    for (const key in override) {
      if (override[key] !== undefined) {
        merged[key] = override[key] as T[Extract<keyof T, string>];
      }
    }
    return merged;
  }

  /**
   * Resolve compression policy for a tool.
   * Priority: tool-level → upstream defaults → global defaults
   */
  resolveCompressionPolicy(namespacedName?: string): ResolvedCompressionPolicy {
    // Level 1: Start with built-in defaults
    let policy = { ...DEFAULT_COMPRESSION_POLICY };

    // Level 2: Merge global defaults
    if (this.globalDefaults.compression) {
      policy = this.mergePolicy(policy, this.globalDefaults.compression);
    }

    // Level 3: Merge upstream defaults (if tool provided)
    if (namespacedName) {
      const parsed = this.parseToolName(namespacedName);
      if (parsed) {
        const upstream = this.upstreams.find((u) => u.id === parsed.upstreamId);
        if (upstream?.defaults?.compression) {
          policy = this.mergePolicy(policy, upstream.defaults.compression);
        }

        // Level 4: Merge tool-specific overrides
        const toolConfig = upstream?.tools?.[parsed.originalName];
        if (toolConfig?.compression) {
          policy = this.mergePolicy(policy, toolConfig.compression);
        }
      }
    }

    return {
      enabled: policy.enabled,
      tokenThreshold: policy.tokenThreshold,
      maxOutputTokens: policy.maxOutputTokens,
      goalAware: policy.goalAware,
      customInstructions: policy.customInstructions,
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
   * Priority: tool-level → upstream defaults → global defaults
   * Note: Global masking.enabled acts as master switch
   */
  resolveMaskingPolicy(namespacedName?: string): ResolvedMaskingPolicy {
    // Level 1: Start with built-in defaults
    let policy = { ...DEFAULT_MASKING_POLICY };

    // Level 2: Merge global defaults
    if (this.globalDefaults.masking) {
      policy = this.mergePolicy(policy, this.globalDefaults.masking);
    }

    // Level 3: Merge upstream defaults (if tool provided)
    let upstreamMasking: MaskingPolicy | undefined;
    if (namespacedName) {
      const parsed = this.parseToolName(namespacedName);
      if (parsed) {
        const upstream = this.upstreams.find((u) => u.id === parsed.upstreamId);
        if (upstream?.defaults?.masking) {
          upstreamMasking = upstream.defaults.masking;
          policy = this.mergePolicy(policy, upstreamMasking);
        }

        // Level 4: Merge tool-specific overrides
        const toolConfig = upstream?.tools?.[parsed.originalName];
        if (toolConfig?.masking) {
          policy = this.mergePolicy(policy, toolConfig.masking);
        }
      }
    }

    // Special handling for customPatterns - merge all levels
    const customPatterns = {
      ...(this.globalDefaults.masking?.customPatterns ?? {}),
      ...(upstreamMasking?.customPatterns ?? {}),
      ...(namespacedName ? this.getToolConfig(namespacedName)?.masking?.customPatterns ?? {} : {}),
    };

    // Apply global master switch
    const finalEnabled = this.globalMaskingEnabled && policy.enabled;

    return {
      enabled: finalEnabled,
      piiTypes: policy.piiTypes,
      llmFallback: policy.llmFallback,
      llmFallbackThreshold: policy.llmFallbackThreshold,
      customPatterns,
    };
  }

  /**
   * Resolve cache policy for a tool.
   * Priority: tool-level → upstream defaults → global defaults
   */
  resolveCachePolicy(namespacedName?: string): ResolvedCachePolicy {
    // Level 1: Start with built-in defaults
    let policy = { ...DEFAULT_CACHE_POLICY };

    // Level 2: Merge global defaults
    if (this.globalDefaults.cache) {
      policy = this.mergePolicy(policy, this.globalDefaults.cache);
    }

    // Level 3: Merge upstream defaults (if tool provided)
    if (namespacedName) {
      const parsed = this.parseToolName(namespacedName);
      if (parsed) {
        const upstream = this.upstreams.find((u) => u.id === parsed.upstreamId);
        if (upstream?.defaults?.cache) {
          policy = this.mergePolicy(policy, upstream.defaults.cache);
        }

        // Level 4: Merge tool-specific overrides
        const toolConfig = upstream?.tools?.[parsed.originalName];
        if (toolConfig?.cache) {
          policy = this.mergePolicy(policy, toolConfig.cache);
        }
      }
    }

    return {
      enabled: policy.enabled,
      ttlSeconds: policy.ttlSeconds,
    };
  }
}
