import { describe, it, expect } from "vitest";
import { ToolConfigResolver } from "./tool-resolver.js";
import { createTestConfig, createTestCompressionConfig } from "../test/helpers.js";
import type { UpstreamServerConfig } from "../types.js";

describe("ToolConfigResolver - Parameter Hiding and Overrides", () => {
  it("should return empty array when no hideParameters configured", () => {
    const upstreams: UpstreamServerConfig[] = [
      {
        id: "test",
        name: "Test",
        transport: "stdio",
        command: "echo",
        tools: {
          mytool: {},
        },
      },
    ];
    const resolver = new ToolConfigResolver(createTestConfig({ upstreams }));

    const hidden = resolver.getHiddenParameters("test__mytool");
    expect(hidden).toEqual([]);
  });

  it("should return configured hidden parameters", () => {
    const upstreams: UpstreamServerConfig[] = [
      {
        id: "test",
        name: "Test",
        transport: "stdio",
        command: "echo",
        tools: {
          fetch: {
            hideParameters: ["max_length"],
            parameterOverrides: { max_length: 50000 },
          },
        },
      },
    ];
    const resolver = new ToolConfigResolver(createTestConfig({ upstreams }));

    const hidden = resolver.getHiddenParameters("test__fetch");
    expect(hidden).toEqual(["max_length"]);
  });

  it("should return empty object when no overrides configured", () => {
    const upstreams: UpstreamServerConfig[] = [
      {
        id: "test",
        name: "Test",
        transport: "stdio",
        command: "echo",
        tools: {
          mytool: {},
        },
      },
    ];
    const resolver = new ToolConfigResolver(createTestConfig({ upstreams }));

    const overrides = resolver.getParameterOverrides("test__mytool");
    expect(overrides).toEqual({});
  });

  it("should return configured parameter overrides", () => {
    const upstreams: UpstreamServerConfig[] = [
      {
        id: "test",
        name: "Test",
        transport: "stdio",
        command: "echo",
        tools: {
          fetch: {
            parameterOverrides: { max_length: 50000 },
          },
        },
      },
    ];
    const resolver = new ToolConfigResolver(createTestConfig({ upstreams }));

    const overrides = resolver.getParameterOverrides("test__fetch");
    expect(overrides).toEqual({ max_length: 50000 });
  });

  it("should handle multiple hidden parameters", () => {
    const upstreams: UpstreamServerConfig[] = [
      {
        id: "test",
        name: "Test",
        transport: "stdio",
        command: "echo",
        tools: {
          api: {
            hideParameters: ["timeout", "retry_count"],
            parameterOverrides: { timeout: 30, retry_count: 3 },
          },
        },
      },
    ];
    const resolver = new ToolConfigResolver(createTestConfig({ upstreams }));

    const hidden = resolver.getHiddenParameters("test__api");
    expect(hidden).toEqual(["timeout", "retry_count"]);
  });

  it("should handle complex parameter override values", () => {
    const upstreams: UpstreamServerConfig[] = [
      {
        id: "test",
        name: "Test",
        transport: "stdio",
        command: "echo",
        tools: {
          api: {
            parameterOverrides: {
              headers: { "User-Agent": "MCPCP/1.0" },
              exclude_dirs: [".git", "node_modules"],
              timeout: 30,
              enabled: true,
            },
          },
        },
      },
    ];
    const resolver = new ToolConfigResolver(createTestConfig({ upstreams }));

    const overrides = resolver.getParameterOverrides("test__api");
    expect(overrides).toEqual({
      headers: { "User-Agent": "MCPCP/1.0" },
      exclude_dirs: [".git", "node_modules"],
      timeout: 30,
      enabled: true,
    });
  });

  it("should return empty array for non-existent tool", () => {
    const upstreams: UpstreamServerConfig[] = [
      {
        id: "test",
        name: "Test",
        transport: "stdio",
        command: "echo",
        tools: {},
      },
    ];
    const resolver = new ToolConfigResolver(createTestConfig({ upstreams }));

    const hidden = resolver.getHiddenParameters("test__nonexistent");
    expect(hidden).toEqual([]);
  });

  it("should return empty object for non-existent tool", () => {
    const upstreams: UpstreamServerConfig[] = [
      {
        id: "test",
        name: "Test",
        transport: "stdio",
        command: "echo",
        tools: {},
      },
    ];
    const resolver = new ToolConfigResolver(createTestConfig({ upstreams }));

    const overrides = resolver.getParameterOverrides("test__nonexistent");
    expect(overrides).toEqual({});
  });

  it("should handle multiple upstreams with different configs", () => {
    const upstreams: UpstreamServerConfig[] = [
      {
        id: "upstream1",
        name: "Upstream 1",
        transport: "stdio",
        command: "echo",
        tools: {
          fetch: {
            hideParameters: ["max_length"],
            parameterOverrides: { max_length: 50000 },
          },
        },
      },
      {
        id: "upstream2",
        name: "Upstream 2",
        transport: "stdio",
        command: "echo",
        tools: {
          search: {
            hideParameters: ["limit"],
            parameterOverrides: { limit: 100 },
          },
        },
      },
    ];
    const resolver = new ToolConfigResolver(createTestConfig({ upstreams }));

    expect(resolver.getHiddenParameters("upstream1__fetch")).toEqual([
      "max_length",
    ]);
    expect(resolver.getParameterOverrides("upstream1__fetch")).toEqual({
      max_length: 50000,
    });

    expect(resolver.getHiddenParameters("upstream2__search")).toEqual(["limit"]);
    expect(resolver.getParameterOverrides("upstream2__search")).toEqual({
      limit: 100,
    });
  });
});

describe("ToolConfigResolver - Compression Policy Resolution", () => {
  it("should return global default policy when no overrides", () => {
    const upstreams: UpstreamServerConfig[] = [
      {
        id: "test",
        name: "Test",
        transport: "stdio",
        command: "echo",
        tools: {
          mytool: {},
        },
      },
    ];
    const resolver = new ToolConfigResolver(createTestConfig({ upstreams }));

    const policy = resolver.resolveCompressionPolicy("test__mytool");
    expect(policy.enabled).toBe(true);
    expect(policy.tokenThreshold).toBe(1000);
  });

  it("should use tool-level compression override", () => {
    const upstreams: UpstreamServerConfig[] = [
      {
        id: "test",
        name: "Test",
        transport: "stdio",
        command: "echo",
        tools: {
          mytool: {
            compression: {
              enabled: false,
              tokenThreshold: 500,
            },
          },
        },
      },
    ];
    const resolver = new ToolConfigResolver(createTestConfig({ upstreams }));

    const policy = resolver.resolveCompressionPolicy("test__mytool");
    expect(policy.enabled).toBe(false);
    expect(policy.tokenThreshold).toBe(500);
  });

  it("should merge tool compression with global defaults", () => {
    const upstreams: UpstreamServerConfig[] = [
      {
        id: "test",
        name: "Test",
        transport: "stdio",
        command: "echo",
        tools: {
          mytool: {
            compression: {
              tokenThreshold: 2000, // Override threshold only
            },
          },
        },
      },
    ];
    const resolver = new ToolConfigResolver(createTestConfig({ upstreams }));

    const policy = resolver.resolveCompressionPolicy("test__mytool");
    expect(policy.enabled).toBe(true); // From global default
    expect(policy.tokenThreshold).toBe(2000); // From tool override
  });

  it("should handle maxOutputTokens override", () => {
    const upstreams: UpstreamServerConfig[] = [
      {
        id: "test",
        name: "Test",
        transport: "stdio",
        command: "echo",
        tools: {
          mytool: {
            compression: {
              maxOutputTokens: 250,
            },
          },
        },
      },
    ];
    const resolver = new ToolConfigResolver(createTestConfig({ upstreams }));

    const policy = resolver.resolveCompressionPolicy("test__mytool");
    expect(policy.maxOutputTokens).toBe(250);
  });

  it("should handle customInstructions", () => {
    const upstreams: UpstreamServerConfig[] = [
      {
        id: "test",
        name: "Test",
        transport: "stdio",
        command: "echo",
        tools: {
          mytool: {
            compression: {
              customInstructions: "Focus on errors",
            },
          },
        },
      },
    ];
    const resolver = new ToolConfigResolver(createTestConfig({ upstreams }));

    const policy = resolver.resolveCompressionPolicy("test__mytool");
    expect(policy.customInstructions).toBe("Focus on errors");
  });
});

describe("ToolConfigResolver - Masking Policy Resolution", () => {
  it("should return default when no masking configured", () => {
    const upstreams: UpstreamServerConfig[] = [
      {
        id: "test",
        name: "Test",
        transport: "stdio",
        command: "echo",
        tools: {
          mytool: {},
        },
      },
    ];
    const config = createTestConfig({ upstreams });
    // No masking config
    const resolver = new ToolConfigResolver(config);

    const policy = resolver.resolveMaskingPolicy("test__mytool");
    expect(policy.enabled).toBe(false); // Default when no config
  });

  it("should use global masking policy", () => {
    const upstreams: UpstreamServerConfig[] = [
      {
        id: "test",
        name: "Test",
        transport: "stdio",
        command: "echo",
        tools: {
          mytool: {},
        },
      },
    ];
    const config = createTestConfig({ upstreams });
    config.masking = {
      enabled: true,
      llmConfig: {
        baseUrl: "http://localhost:8080/v1",
        model: "test",
      },
    };
    config.defaults = {
      ...config.defaults,
      masking: {
        enabled: true,
        piiTypes: ["email", "ssn"],
        llmFallback: false,
        llmFallbackThreshold: "low",
      },
    };
    const resolver = new ToolConfigResolver(config);

    const policy = resolver.resolveMaskingPolicy("test__mytool");
    expect(policy.enabled).toBe(true);
    expect(policy.piiTypes).toEqual(["email", "ssn"]);
  });

  it("should use tool-level masking override", () => {
    const upstreams: UpstreamServerConfig[] = [
      {
        id: "test",
        name: "Test",
        transport: "stdio",
        command: "echo",
        tools: {
          mytool: {
            masking: {
              enabled: false,
            },
          },
        },
      },
    ];
    const config = createTestConfig({ upstreams });
    config.masking = {
      enabled: true,
    };
    config.defaults = config.defaults || {};
    config.defaults.masking = {
      enabled: true,
      piiTypes: ["email"],
      llmFallback: false,
      llmFallbackThreshold: "low",
    };
    const resolver = new ToolConfigResolver(config);

    const policy = resolver.resolveMaskingPolicy("test__mytool");
    expect(policy.enabled).toBe(false);
  });

  it("should merge tool masking with global defaults", () => {
    const upstreams: UpstreamServerConfig[] = [
      {
        id: "test",
        name: "Test",
        transport: "stdio",
        command: "echo",
        tools: {
          mytool: {
            masking: {
              piiTypes: ["phone"], // Override only piiTypes
            },
          },
        },
      },
    ];
    const config = createTestConfig({ upstreams });
    config.masking = {
      enabled: true,
      llmConfig: {
        baseUrl: "http://localhost:8080/v1",
        model: "test",
      },
    };
    config.defaults = {
      ...config.defaults,
      masking: {
        enabled: true,
        piiTypes: ["email", "ssn"],
        llmFallback: true,
        llmFallbackThreshold: "medium",
      },
    };
    const resolver = new ToolConfigResolver(config);

    const policy = resolver.resolveMaskingPolicy("test__mytool");
    expect(policy.enabled).toBe(true); // From global
    expect(policy.piiTypes).toEqual(["phone"]); // From tool override
    expect(policy.llmFallback).toBe(true); // From global
  });
});

describe("ToolConfigResolver - Tool Visibility", () => {
  it("should return false when tool not hidden", () => {
    const upstreams: UpstreamServerConfig[] = [
      {
        id: "test",
        name: "Test",
        transport: "stdio",
        command: "echo",
        tools: {
          mytool: { hidden: false },
        },
      },
    ];
    const resolver = new ToolConfigResolver(createTestConfig({ upstreams }));

    expect(resolver.isToolHidden("test__mytool")).toBe(false);
  });

  it("should return true when tool is hidden", () => {
    const upstreams: UpstreamServerConfig[] = [
      {
        id: "test",
        name: "Test",
        transport: "stdio",
        command: "echo",
        tools: {
          dangerous_tool: { hidden: true },
        },
      },
    ];
    const resolver = new ToolConfigResolver(createTestConfig({ upstreams }));

    expect(resolver.isToolHidden("test__dangerous_tool")).toBe(true);
  });

  it("should return false for non-existent tool", () => {
    const upstreams: UpstreamServerConfig[] = [
      {
        id: "test",
        name: "Test",
        transport: "stdio",
        command: "echo",
        tools: {},
      },
    ];
    const resolver = new ToolConfigResolver(createTestConfig({ upstreams }));

    expect(resolver.isToolHidden("test__nonexistent")).toBe(false);
  });
});

describe("ToolConfigResolver - Description Override", () => {
  it("should return undefined when no override", () => {
    const upstreams: UpstreamServerConfig[] = [
      {
        id: "test",
        name: "Test",
        transport: "stdio",
        command: "echo",
        tools: {
          mytool: {},
        },
      },
    ];
    const resolver = new ToolConfigResolver(createTestConfig({ upstreams }));

    expect(resolver.getDescriptionOverride("test__mytool")).toBeUndefined();
  });

  it("should return custom description when configured", () => {
    const upstreams: UpstreamServerConfig[] = [
      {
        id: "test",
        name: "Test",
        transport: "stdio",
        command: "echo",
        tools: {
          fetch: {
            overwriteDescription: "Custom fetch description",
          },
        },
      },
    ];
    const resolver = new ToolConfigResolver(createTestConfig({ upstreams }));

    expect(resolver.getDescriptionOverride("test__fetch")).toBe(
      "Custom fetch description"
    );
  });
});

describe("ToolConfigResolver - Cache Config (via getToolConfig)", () => {
  it("should return undefined when no cache configured", () => {
    const upstreams: UpstreamServerConfig[] = [
      {
        id: "test",
        name: "Test",
        transport: "stdio",
        command: "echo",
        tools: {
          mytool: {},
        },
      },
    ];
    const resolver = new ToolConfigResolver(createTestConfig({ upstreams }));

    const config = resolver.getToolConfig("test__mytool");
    expect(config?.cache).toBeUndefined();
  });

  it("should return custom cache config when configured", () => {
    const upstreams: UpstreamServerConfig[] = [
      {
        id: "test",
        name: "Test",
        transport: "stdio",
        command: "echo",
        tools: {
          mytool: {
            cache: {
              ttlSeconds: 300,
            },
          },
        },
      },
    ];
    const resolver = new ToolConfigResolver(createTestConfig({ upstreams }));

    const config = resolver.getToolConfig("test__mytool");
    expect(config?.cache?.ttlSeconds).toBe(300);
  });

  it("should handle disabled cache", () => {
    const upstreams: UpstreamServerConfig[] = [
      {
        id: "test",
        name: "Test",
        transport: "stdio",
        command: "echo",
        tools: {
          realtime_tool: {
            cache: {
              enabled: false,
            },
          },
        },
      },
    ];
    const resolver = new ToolConfigResolver(createTestConfig({ upstreams }));

    const config = resolver.getToolConfig("test__realtime_tool");
    expect(config?.cache?.enabled).toBe(false);
  });
});

describe("ToolConfigResolver - Retry Escalation", () => {
  it("should return retry escalation config from global", () => {
    const upstreams: UpstreamServerConfig[] = [
      {
        id: "test",
        name: "Test",
        transport: "stdio",
        command: "echo",
        tools: {
          mytool: {},
        },
      },
    ];
    const config = createTestConfig({ upstreams });
    config.compression.retryEscalation = {
      enabled: true,
      windowSeconds: 120,
      tokenMultiplier: 3,
    };
    const resolver = new ToolConfigResolver(config);

    const retryConfig = resolver.getRetryEscalation();
    expect(retryConfig?.enabled).toBe(true);
    expect(retryConfig?.windowSeconds).toBe(120);
    expect(retryConfig?.tokenMultiplier).toBe(3);
  });

  it("should return undefined when not configured", () => {
    const upstreams: UpstreamServerConfig[] = [
      {
        id: "test",
        name: "Test",
        transport: "stdio",
        command: "echo",
        tools: {},
      },
    ];
    const config = createTestConfig({
      upstreams,
      compression: {
        ...createTestCompressionConfig(),
        retryEscalation: undefined // No retryEscalation config
      }
    });
    const resolver = new ToolConfigResolver(config);

    expect(resolver.getRetryEscalation()).toBeUndefined();
  });
});

describe("ToolConfigResolver - Goal Aware", () => {
  it("should return global goalAware setting by default", () => {
    const upstreams: UpstreamServerConfig[] = [
      {
        id: "test",
        name: "Test",
        transport: "stdio",
        command: "echo",
        tools: {
          mytool: {},
        },
      },
    ];
    const config = createTestConfig({ upstreams });
    config.defaults = config.defaults || {};
    config.defaults.compression = config.defaults.compression || {};
    config.defaults.compression.goalAware = true;
    const resolver = new ToolConfigResolver(config);

    expect(resolver.isGoalAwareEnabled("test__mytool")).toBe(true);
  });

  it("should use tool-level goalAware override", () => {
    const upstreams: UpstreamServerConfig[] = [
      {
        id: "test",
        name: "Test",
        transport: "stdio",
        command: "echo",
        tools: {
          mytool: {
            compression: {
              goalAware: false,
            },
          },
        },
      },
    ];
    const config = createTestConfig({ upstreams });
    config.defaults = config.defaults || {};
    config.defaults.compression = config.defaults.compression || {};
    config.defaults.compression.goalAware = true;
    const resolver = new ToolConfigResolver(config);

    expect(resolver.isGoalAwareEnabled("test__mytool")).toBe(false);
  });
});

describe("ToolConfigResolver - Bypass Enabled", () => {
  it("should return global bypass setting", () => {
    const upstreams: UpstreamServerConfig[] = [
      {
        id: "test",
        name: "Test",
        transport: "stdio",
        command: "echo",
        tools: {},
      },
    ];
    const config = createTestConfig({ upstreams });
    config.compression.bypassEnabled = true;
    const resolver = new ToolConfigResolver(config);

    expect(resolver.isBypassEnabled()).toBe(true);
  });

  it("should return false when not configured", () => {
    const upstreams: UpstreamServerConfig[] = [
      {
        id: "test",
        name: "Test",
        transport: "stdio",
        command: "echo",
        tools: {},
      },
    ];
    const config = createTestConfig({ upstreams });
    config.compression.bypassEnabled = false;
    const resolver = new ToolConfigResolver(config);

    expect(resolver.isBypassEnabled()).toBe(false);
  });
});

describe("ToolConfigResolver - Upstream-Level Compression Defaults", () => {
  it("should use upstream defaults.compression when configured", () => {
    const upstreams: UpstreamServerConfig[] = [
      {
        id: "test",
        name: "Test",
        transport: "stdio",
        command: "echo",
        defaults: {
          compression: {
            enabled: false,
            tokenThreshold: 2000,
            maxOutputTokens: 500,
          },
        },
        tools: {
          mytool: {},
        },
      },
    ];
    const resolver = new ToolConfigResolver(createTestConfig({ upstreams }));

    const policy = resolver.resolveCompressionPolicy("test__mytool");
    expect(policy.enabled).toBe(false); // From upstream defaults
    expect(policy.tokenThreshold).toBe(2000); // From upstream defaults
    expect(policy.maxOutputTokens).toBe(500); // From upstream defaults
  });

  it("should merge upstream defaults with global defaults", () => {
    const upstreams: UpstreamServerConfig[] = [
      {
        id: "test",
        name: "Test",
        transport: "stdio",
        command: "echo",
        defaults: {
          compression: {
            tokenThreshold: 3000, // Override threshold only
          },
        },
        tools: {
          mytool: {},
        },
      },
    ];
    const config = createTestConfig({ upstreams });
    // Global defaults: enabled: true, tokenThreshold: 1000
    const resolver = new ToolConfigResolver(config);

    const policy = resolver.resolveCompressionPolicy("test__mytool");
    expect(policy.enabled).toBe(true); // From global default
    expect(policy.tokenThreshold).toBe(3000); // From upstream default
  });

  it("should allow tool-level to override upstream defaults", () => {
    const upstreams: UpstreamServerConfig[] = [
      {
        id: "test",
        name: "Test",
        transport: "stdio",
        command: "echo",
        defaults: {
          compression: {
            enabled: false,
            tokenThreshold: 2000,
          },
        },
        tools: {
          mytool: {
            compression: {
              enabled: true, // Tool overrides upstream
              tokenThreshold: 5000, // Tool overrides upstream
            },
          },
        },
      },
    ];
    const resolver = new ToolConfigResolver(createTestConfig({ upstreams }));

    const policy = resolver.resolveCompressionPolicy("test__mytool");
    expect(policy.enabled).toBe(true); // From tool override
    expect(policy.tokenThreshold).toBe(5000); // From tool override
  });

  it("should verify three-level hierarchy: global → upstream → tool", () => {
    const upstreams: UpstreamServerConfig[] = [
      {
        id: "test",
        name: "Test",
        transport: "stdio",
        command: "echo",
        defaults: {
          compression: {
            tokenThreshold: 3000, // Upstream level
          },
        },
        tools: {
          tool1: {}, // Uses upstream default (3000)
          tool2: {
            compression: {
              tokenThreshold: 5000, // Tool level
            },
          },
        },
      },
    ];
    const config = createTestConfig({ upstreams });
    if (config.defaults.compression) {
      config.defaults.compression.tokenThreshold = 1000; // Global level
    }
    const resolver = new ToolConfigResolver(config);

    const policy1 = resolver.resolveCompressionPolicy("test__tool1");
    expect(policy1.tokenThreshold).toBe(3000); // Upstream wins over global

    const policy2 = resolver.resolveCompressionPolicy("test__tool2");
    expect(policy2.tokenThreshold).toBe(5000); // Tool wins over upstream
  });
});

describe("ToolConfigResolver - Upstream-Level Masking Defaults", () => {
  it("should use upstream defaults.masking when configured", () => {
    const upstreams: UpstreamServerConfig[] = [
      {
        id: "test",
        name: "Test",
        transport: "stdio",
        command: "echo",
        defaults: {
          masking: {
            enabled: true,
            piiTypes: ["phone"],
            llmFallback: true,
            llmFallbackThreshold: "high",
          },
        },
        tools: {
          mytool: {},
        },
      },
    ];
    const config = createTestConfig({ upstreams });
    config.masking = {
      enabled: true,
      llmConfig: { baseUrl: "http://localhost", model: "test" },
    };
    const resolver = new ToolConfigResolver(config);

    const policy = resolver.resolveMaskingPolicy("test__mytool");
    expect(policy.enabled).toBe(true); // From upstream defaults
    expect(policy.piiTypes).toEqual(["phone"]); // From upstream defaults
    expect(policy.llmFallback).toBe(true); // From upstream defaults
    expect(policy.llmFallbackThreshold).toBe("high"); // From upstream defaults
  });

  it("should merge upstream masking defaults with global defaults", () => {
    const upstreams: UpstreamServerConfig[] = [
      {
        id: "test",
        name: "Test",
        transport: "stdio",
        command: "echo",
        defaults: {
          masking: {
            piiTypes: ["phone", "ssn"], // Override piiTypes only
          },
        },
        tools: {
          mytool: {},
        },
      },
    ];
    const config = createTestConfig({ upstreams });
    config.masking = {
      enabled: true,
      llmConfig: { baseUrl: "http://localhost", model: "test" },
    };
    config.defaults.masking = {
      enabled: true,
      piiTypes: ["email", "credit_card", "ssn", "phone", "ip_address"],
      llmFallback: false,
      llmFallbackThreshold: "low",
    };
    const resolver = new ToolConfigResolver(config);

    const policy = resolver.resolveMaskingPolicy("test__mytool");
    expect(policy.enabled).toBe(true); // From global default
    expect(policy.piiTypes).toEqual(["phone", "ssn"]); // From upstream default
    expect(policy.llmFallback).toBe(false); // From global default
    expect(policy.llmFallbackThreshold).toBe("low"); // From global default
  });

  it("should allow tool-level to override upstream masking defaults", () => {
    const upstreams: UpstreamServerConfig[] = [
      {
        id: "test",
        name: "Test",
        transport: "stdio",
        command: "echo",
        defaults: {
          masking: {
            enabled: true,
            piiTypes: ["phone"],
          },
        },
        tools: {
          mytool: {
            masking: {
              enabled: false, // Tool overrides upstream
              piiTypes: ["email"], // Tool overrides upstream
            },
          },
        },
      },
    ];
    const config = createTestConfig({ upstreams });
    config.masking = {
      enabled: true,
      llmConfig: { baseUrl: "http://localhost", model: "test" },
    };
    const resolver = new ToolConfigResolver(config);

    const policy = resolver.resolveMaskingPolicy("test__mytool");
    expect(policy.enabled).toBe(false); // From tool override
    expect(policy.piiTypes).toEqual(["email"]); // From tool override
  });

  it("should verify three-level hierarchy: global → upstream → tool", () => {
    const upstreams: UpstreamServerConfig[] = [
      {
        id: "test",
        name: "Test",
        transport: "stdio",
        command: "echo",
        defaults: {
          masking: {
            piiTypes: ["phone", "ssn"], // Upstream level
          },
        },
        tools: {
          tool1: {}, // Uses upstream default
          tool2: {
            masking: {
              piiTypes: ["email"], // Tool level
            },
          },
        },
      },
    ];
    const config = createTestConfig({ upstreams });
    config.masking = {
      enabled: true,
      llmConfig: { baseUrl: "http://localhost", model: "test" },
    };
    config.defaults.masking = {
      enabled: true,
      piiTypes: ["email", "credit_card", "ssn", "phone", "ip_address"], // Global level
      llmFallback: false,
      llmFallbackThreshold: "low",
    };
    const resolver = new ToolConfigResolver(config);

    const policy1 = resolver.resolveMaskingPolicy("test__tool1");
    expect(policy1.piiTypes).toEqual(["phone", "ssn"]); // Upstream wins over global

    const policy2 = resolver.resolveMaskingPolicy("test__tool2");
    expect(policy2.piiTypes).toEqual(["email"]); // Tool wins over upstream
  });
});

describe("ToolConfigResolver - Cache Policy Resolution", () => {
  it("should return defaults when no cache config", () => {
    const upstreams: UpstreamServerConfig[] = [
      {
        id: "test",
        name: "Test",
        transport: "stdio",
        command: "echo",
        tools: {
          mytool: {},
        },
      },
    ];
    const resolver = new ToolConfigResolver(createTestConfig({ upstreams }));

    const policy = resolver.resolveCachePolicy("test__mytool");
    expect(policy.enabled).toBe(true); // From createTestConfig defaults
    expect(policy.ttlSeconds).toBe(60); // From createTestConfig defaults
  });

  it("should use global defaults.cache when configured", () => {
    const upstreams: UpstreamServerConfig[] = [
      {
        id: "test",
        name: "Test",
        transport: "stdio",
        command: "echo",
        tools: {
          mytool: {},
        },
      },
    ];
    const config = createTestConfig({ upstreams });
    config.defaults.cache = {
      enabled: false,
      ttlSeconds: 600,
    };
    const resolver = new ToolConfigResolver(config);

    const policy = resolver.resolveCachePolicy("test__mytool");
    expect(policy.enabled).toBe(false); // From global defaults
    expect(policy.ttlSeconds).toBe(600); // From global defaults
  });

  it("should use upstream defaults.cache when configured", () => {
    const upstreams: UpstreamServerConfig[] = [
      {
        id: "test",
        name: "Test",
        transport: "stdio",
        command: "echo",
        defaults: {
          cache: {
            enabled: false,
            ttlSeconds: 900,
          },
        },
        tools: {
          mytool: {},
        },
      },
    ];
    const resolver = new ToolConfigResolver(createTestConfig({ upstreams }));

    const policy = resolver.resolveCachePolicy("test__mytool");
    expect(policy.enabled).toBe(false); // From upstream defaults
    expect(policy.ttlSeconds).toBe(900); // From upstream defaults
  });

  it("should use tool-level cache when configured", () => {
    const upstreams: UpstreamServerConfig[] = [
      {
        id: "test",
        name: "Test",
        transport: "stdio",
        command: "echo",
        tools: {
          mytool: {
            cache: {
              enabled: false,
              ttlSeconds: 120,
            },
          },
        },
      },
    ];
    const resolver = new ToolConfigResolver(createTestConfig({ upstreams }));

    const policy = resolver.resolveCachePolicy("test__mytool");
    expect(policy.enabled).toBe(false); // From tool override
    expect(policy.ttlSeconds).toBe(120); // From tool override
  });

  it("should merge upstream cache defaults with global defaults", () => {
    const upstreams: UpstreamServerConfig[] = [
      {
        id: "test",
        name: "Test",
        transport: "stdio",
        command: "echo",
        defaults: {
          cache: {
            ttlSeconds: 1200, // Override ttlSeconds only
          },
        },
        tools: {
          mytool: {},
        },
      },
    ];
    const config = createTestConfig({ upstreams });
    config.defaults.cache = {
      enabled: false, // Global
      ttlSeconds: 300, // Will be overridden
    };
    const resolver = new ToolConfigResolver(config);

    const policy = resolver.resolveCachePolicy("test__mytool");
    expect(policy.enabled).toBe(false); // From global default
    expect(policy.ttlSeconds).toBe(1200); // From upstream default
  });

  it("should allow partial tool-level overrides", () => {
    const upstreams: UpstreamServerConfig[] = [
      {
        id: "test",
        name: "Test",
        transport: "stdio",
        command: "echo",
        defaults: {
          cache: {
            enabled: true,
            ttlSeconds: 600,
          },
        },
        tools: {
          mytool: {
            cache: {
              ttlSeconds: 180, // Override ttlSeconds only
            },
          },
        },
      },
    ];
    const resolver = new ToolConfigResolver(createTestConfig({ upstreams }));

    const policy = resolver.resolveCachePolicy("test__mytool");
    expect(policy.enabled).toBe(true); // From upstream default
    expect(policy.ttlSeconds).toBe(180); // From tool override
  });

  it("should verify three-level hierarchy: global → upstream → tool", () => {
    const upstreams: UpstreamServerConfig[] = [
      {
        id: "test",
        name: "Test",
        transport: "stdio",
        command: "echo",
        defaults: {
          cache: {
            ttlSeconds: 900, // Upstream level
          },
        },
        tools: {
          tool1: {}, // Uses upstream default (900)
          tool2: {
            cache: {
              ttlSeconds: 60, // Tool level
            },
          },
        },
      },
    ];
    const config = createTestConfig({ upstreams });
    config.defaults.cache = {
      enabled: true,
      ttlSeconds: 300, // Global level
    };
    const resolver = new ToolConfigResolver(config);

    const policy1 = resolver.resolveCachePolicy("test__tool1");
    expect(policy1.ttlSeconds).toBe(900); // Upstream wins over global

    const policy2 = resolver.resolveCachePolicy("test__tool2");
    expect(policy2.ttlSeconds).toBe(60); // Tool wins over upstream
  });

  it("should return correct structure for ResolvedCachePolicy", () => {
    const upstreams: UpstreamServerConfig[] = [
      {
        id: "test",
        name: "Test",
        transport: "stdio",
        command: "echo",
        tools: {
          mytool: {
            cache: {
              enabled: false,
              ttlSeconds: 120,
            },
          },
        },
      },
    ];
    const resolver = new ToolConfigResolver(createTestConfig({ upstreams }));

    const policy = resolver.resolveCachePolicy("test__mytool");

    // Verify structure
    expect(policy).toHaveProperty("enabled");
    expect(policy).toHaveProperty("ttlSeconds");
    expect(typeof policy.enabled).toBe("boolean");
    expect(typeof policy.ttlSeconds).toBe("number");
  });

  it("should handle cache disabled case", () => {
    const upstreams: UpstreamServerConfig[] = [
      {
        id: "test",
        name: "Test",
        transport: "stdio",
        command: "echo",
        tools: {
          mytool: {
            cache: {
              enabled: false,
            },
          },
        },
      },
    ];
    const resolver = new ToolConfigResolver(createTestConfig({ upstreams }));

    const policy = resolver.resolveCachePolicy("test__mytool");
    expect(policy.enabled).toBe(false);
    expect(policy.ttlSeconds).toBeDefined(); // Should still have ttlSeconds from defaults
  });
});

describe("ToolConfigResolver - Constructor Edge Cases", () => {
  it("should default bypassEnabled to false when undefined", () => {
    const upstreams: UpstreamServerConfig[] = [
      {
        id: "test",
        name: "Test",
        transport: "stdio",
        command: "echo",
        tools: {},
      },
    ];
    const config = createTestConfig({ upstreams });
    // Explicitly remove bypassEnabled to test undefined case
    delete (config.compression as any).bypassEnabled;
    const resolver = new ToolConfigResolver(config);

    expect(resolver.isBypassEnabled()).toBe(false);
  });

  it("should default masking enabled to false when masking is undefined", () => {
    const upstreams: UpstreamServerConfig[] = [
      {
        id: "test",
        name: "Test",
        transport: "stdio",
        command: "echo",
        tools: { mytool: {} },
      },
    ];
    const config = createTestConfig({ upstreams });
    // Remove masking to test undefined case
    delete (config as any).masking;
    const resolver = new ToolConfigResolver(config);

    const policy = resolver.resolveMaskingPolicy("test__mytool");
    expect(policy.enabled).toBe(false);
  });

  it("should default masking enabled to false when masking.enabled is undefined", () => {
    const upstreams: UpstreamServerConfig[] = [
      {
        id: "test",
        name: "Test",
        transport: "stdio",
        command: "echo",
        tools: { mytool: {} },
      },
    ];
    const config = createTestConfig({ upstreams });
    // Set masking with enabled field
    config.masking = {
      enabled: false,
      llmConfig: { baseUrl: "http://localhost", model: "test" },
    };
    const resolver = new ToolConfigResolver(config);

    const policy = resolver.resolveMaskingPolicy("test__mytool");
    expect(policy.enabled).toBe(false);
  });
});

describe("ToolConfigResolver - Invalid Tool Names", () => {
  it("should return undefined for getToolConfig with invalid format", () => {
    const upstreams: UpstreamServerConfig[] = [
      {
        id: "test",
        name: "Test",
        transport: "stdio",
        command: "echo",
        tools: { mytool: { hidden: true } },
      },
    ];
    const resolver = new ToolConfigResolver(createTestConfig({ upstreams }));

    expect(resolver.getToolConfig("invalidname")).toBeUndefined();
    expect(resolver.getToolConfig("no-separator")).toBeUndefined();
  });

  it("should return false for isToolHidden with invalid format", () => {
    const upstreams: UpstreamServerConfig[] = [
      {
        id: "test",
        name: "Test",
        transport: "stdio",
        command: "echo",
        tools: { mytool: { hidden: true } },
      },
    ];
    const resolver = new ToolConfigResolver(createTestConfig({ upstreams }));

    expect(resolver.isToolHidden("invalidname")).toBe(false);
    expect(resolver.isToolHidden("no-separator")).toBe(false);
  });

  it("should return undefined for getDescriptionOverride with invalid format", () => {
    const upstreams: UpstreamServerConfig[] = [
      {
        id: "test",
        name: "Test",
        transport: "stdio",
        command: "echo",
        tools: {
          mytool: { overwriteDescription: "Custom description" },
        },
      },
    ];
    const resolver = new ToolConfigResolver(createTestConfig({ upstreams }));

    expect(resolver.getDescriptionOverride("invalidname")).toBeUndefined();
    expect(resolver.getDescriptionOverride("no-separator")).toBeUndefined();
  });
});

describe("ToolConfigResolver - Policy Resolution Without Tool Name", () => {
  it("should return built-in + global defaults for resolveCompressionPolicy with no args", () => {
    const upstreams: UpstreamServerConfig[] = [
      {
        id: "test",
        name: "Test",
        transport: "stdio",
        command: "echo",
        defaults: {
          compression: { tokenThreshold: 5000 },
        },
        tools: {
          mytool: { compression: { tokenThreshold: 9000 } },
        },
      },
    ];
    const config = createTestConfig({ upstreams });
    config.defaults.compression = { tokenThreshold: 2000 };
    const resolver = new ToolConfigResolver(config);

    const policy = resolver.resolveCompressionPolicy();
    // Should use built-in + global defaults only (ignoring upstream/tool)
    expect(policy.tokenThreshold).toBe(2000); // Global default
    expect(policy.enabled).toBe(true); // Built-in default
  });

  it("should return built-in + global defaults for resolveMaskingPolicy with no args", () => {
    const upstreams: UpstreamServerConfig[] = [
      {
        id: "test",
        name: "Test",
        transport: "stdio",
        command: "echo",
        defaults: {
          masking: { piiTypes: ["phone"] },
        },
        tools: {
          mytool: { masking: { piiTypes: ["ssn"] } },
        },
      },
    ];
    const config = createTestConfig({ upstreams });
    config.masking = { enabled: true };
    config.defaults.masking = {
      enabled: true,
      piiTypes: ["email"],
      llmFallback: false,
      llmFallbackThreshold: "low",
    };
    const resolver = new ToolConfigResolver(config);

    const policy = resolver.resolveMaskingPolicy();
    // Should use built-in + global defaults only (ignoring upstream/tool)
    expect(policy.piiTypes).toEqual(["email"]); // Global default
    expect(policy.enabled).toBe(true);
  });

  it("should return built-in + global defaults for resolveCachePolicy with no args", () => {
    const upstreams: UpstreamServerConfig[] = [
      {
        id: "test",
        name: "Test",
        transport: "stdio",
        command: "echo",
        defaults: {
          cache: { ttlSeconds: 900 },
        },
        tools: {
          mytool: { cache: { ttlSeconds: 1800 } },
        },
      },
    ];
    const config = createTestConfig({ upstreams });
    config.defaults.cache = { enabled: false, ttlSeconds: 300 };
    const resolver = new ToolConfigResolver(config);

    const policy = resolver.resolveCachePolicy();
    // Should use built-in + global defaults only (ignoring upstream/tool)
    expect(policy.ttlSeconds).toBe(300); // Global default
    expect(policy.enabled).toBe(false); // Global default
  });
});

describe("ToolConfigResolver - Policy Resolution With Invalid Tool Name", () => {
  it("should return global defaults for resolveCompressionPolicy with invalid name", () => {
    const upstreams: UpstreamServerConfig[] = [
      {
        id: "test",
        name: "Test",
        transport: "stdio",
        command: "echo",
        tools: {
          mytool: { compression: { tokenThreshold: 9000 } },
        },
      },
    ];
    const config = createTestConfig({ upstreams });
    config.defaults.compression = { tokenThreshold: 2000 };
    const resolver = new ToolConfigResolver(config);

    const policy = resolver.resolveCompressionPolicy("invalidname");
    // Should use global defaults (ignoring tool because name is invalid)
    expect(policy.tokenThreshold).toBe(2000);
    expect(policy.enabled).toBe(true);
  });

  it("should return global defaults for resolveMaskingPolicy with invalid name", () => {
    const upstreams: UpstreamServerConfig[] = [
      {
        id: "test",
        name: "Test",
        transport: "stdio",
        command: "echo",
        tools: {
          mytool: { masking: { piiTypes: ["ssn"] } },
        },
      },
    ];
    const config = createTestConfig({ upstreams });
    config.masking = { enabled: true };
    config.defaults.masking = {
      enabled: true,
      piiTypes: ["email"],
      llmFallback: false,
      llmFallbackThreshold: "low",
    };
    const resolver = new ToolConfigResolver(config);

    const policy = resolver.resolveMaskingPolicy("invalidname");
    // Should use global defaults (ignoring tool because name is invalid)
    expect(policy.piiTypes).toEqual(["email"]);
    expect(policy.enabled).toBe(true);
  });

  it("should return global defaults for resolveCachePolicy with invalid name", () => {
    const upstreams: UpstreamServerConfig[] = [
      {
        id: "test",
        name: "Test",
        transport: "stdio",
        command: "echo",
        tools: {
          mytool: { cache: { ttlSeconds: 1800 } },
        },
      },
    ];
    const config = createTestConfig({ upstreams });
    config.defaults.cache = { enabled: false, ttlSeconds: 300 };
    const resolver = new ToolConfigResolver(config);

    const policy = resolver.resolveCachePolicy("invalidname");
    // Should use global defaults (ignoring tool because name is invalid)
    expect(policy.ttlSeconds).toBe(300);
    expect(policy.enabled).toBe(false);
  });
});

describe("ToolConfigResolver - Nonexistent Upstream", () => {
  it("should return global defaults for nonexistent upstream in compression", () => {
    const upstreams: UpstreamServerConfig[] = [
      {
        id: "real",
        name: "Real",
        transport: "stdio",
        command: "echo",
        tools: {
          mytool: { compression: { tokenThreshold: 9000 } },
        },
      },
    ];
    const config = createTestConfig({ upstreams });
    config.defaults.compression = { tokenThreshold: 2000 };
    const resolver = new ToolConfigResolver(config);

    const policy = resolver.resolveCompressionPolicy("nonexistent__tool");
    // Should use global defaults (upstream doesn't exist)
    expect(policy.tokenThreshold).toBe(2000);
    expect(policy.enabled).toBe(true);
  });

  it("should return global defaults for nonexistent upstream in masking", () => {
    const upstreams: UpstreamServerConfig[] = [
      {
        id: "real",
        name: "Real",
        transport: "stdio",
        command: "echo",
        tools: {
          mytool: { masking: { piiTypes: ["ssn"] } },
        },
      },
    ];
    const config = createTestConfig({ upstreams });
    config.masking = { enabled: true };
    config.defaults.masking = {
      enabled: true,
      piiTypes: ["email"],
      llmFallback: false,
      llmFallbackThreshold: "low",
    };
    const resolver = new ToolConfigResolver(config);

    const policy = resolver.resolveMaskingPolicy("nonexistent__tool");
    // Should use global defaults (upstream doesn't exist)
    expect(policy.piiTypes).toEqual(["email"]);
    expect(policy.enabled).toBe(true);
  });

  it("should return global defaults for nonexistent upstream in cache", () => {
    const upstreams: UpstreamServerConfig[] = [
      {
        id: "real",
        name: "Real",
        transport: "stdio",
        command: "echo",
        tools: {
          mytool: { cache: { ttlSeconds: 1800 } },
        },
      },
    ];
    const config = createTestConfig({ upstreams });
    config.defaults.cache = { enabled: false, ttlSeconds: 300 };
    const resolver = new ToolConfigResolver(config);

    const policy = resolver.resolveCachePolicy("nonexistent__tool");
    // Should use global defaults (upstream doesn't exist)
    expect(policy.ttlSeconds).toBe(300);
    expect(policy.enabled).toBe(false);
  });

  it("should return undefined for getToolConfig with nonexistent upstream", () => {
    const upstreams: UpstreamServerConfig[] = [
      {
        id: "real",
        name: "Real",
        transport: "stdio",
        command: "echo",
        tools: {
          mytool: { hidden: true },
        },
      },
    ];
    const resolver = new ToolConfigResolver(createTestConfig({ upstreams }));

    expect(resolver.getToolConfig("nonexistent__tool")).toBeUndefined();
  });
});

describe("ToolConfigResolver - Missing Global Defaults", () => {
  it("should handle missing defaults.compression", () => {
    const upstreams: UpstreamServerConfig[] = [
      {
        id: "test",
        name: "Test",
        transport: "stdio",
        command: "echo",
        tools: { mytool: {} },
      },
    ];
    const config = createTestConfig({ upstreams });
    // Remove compression from defaults
    delete (config.defaults as any).compression;
    const resolver = new ToolConfigResolver(config);

    const policy = resolver.resolveCompressionPolicy("test__mytool");
    // Should use built-in defaults
    expect(policy.enabled).toBe(true);
    expect(policy.tokenThreshold).toBe(1000);
  });

  it("should handle missing defaults.masking", () => {
    const upstreams: UpstreamServerConfig[] = [
      {
        id: "test",
        name: "Test",
        transport: "stdio",
        command: "echo",
        tools: { mytool: {} },
      },
    ];
    const config = createTestConfig({ upstreams });
    config.masking = { enabled: true };
    // Remove masking from defaults
    delete (config.defaults as any).masking;
    const resolver = new ToolConfigResolver(config);

    const policy = resolver.resolveMaskingPolicy("test__mytool");
    // Should use built-in defaults
    expect(policy.piiTypes).toEqual([
      "email",
      "ssn",
      "phone",
      "credit_card",
      "ip_address",
    ]);
  });

  it("should handle missing defaults.cache", () => {
    const upstreams: UpstreamServerConfig[] = [
      {
        id: "test",
        name: "Test",
        transport: "stdio",
        command: "echo",
        tools: { mytool: {} },
      },
    ];
    const config = createTestConfig({ upstreams });
    // Remove cache from defaults
    delete (config.defaults as any).cache;
    const resolver = new ToolConfigResolver(config);

    const policy = resolver.resolveCachePolicy("test__mytool");
    // Should use built-in defaults
    expect(policy.enabled).toBe(true);
    expect(policy.ttlSeconds).toBe(300);
  });
});

describe("ToolConfigResolver - MergePolicy Edge Cases", () => {
  it("should return base when override is completely absent", () => {
    const upstreams: UpstreamServerConfig[] = [
      {
        id: "test",
        name: "Test",
        transport: "stdio",
        command: "echo",
        // No defaults defined at all
        tools: { mytool: {} }, // Tool has no config
      },
    ];
    const config = createTestConfig({ upstreams });
    // Remove all default policies
    delete (config.defaults as any).compression;
    const resolver = new ToolConfigResolver(config);

    const policy = resolver.resolveCompressionPolicy("test__mytool");
    // Should use built-in defaults only (mergePolicy returns base when override is undefined)
    expect(policy.enabled).toBe(true);
    expect(policy.tokenThreshold).toBe(1000);
  });

  it("should handle null values in defaults gracefully", () => {
    const upstreams: UpstreamServerConfig[] = [
      {
        id: "test",
        name: "Test",
        transport: "stdio",
        command: "echo",
        defaults: {
          compression: null as any, // Explicit null
        },
        tools: { mytool: {} },
      },
    ];
    const config = createTestConfig({ upstreams });
    const resolver = new ToolConfigResolver(config);

    const policy = resolver.resolveCompressionPolicy("test__mytool");
    // Should handle null gracefully and use built-in + global defaults
    expect(policy.enabled).toBe(true);
    expect(policy.tokenThreshold).toBe(1000);
  });

  it("should not overwrite base values with undefined in override", () => {
    const upstreams: UpstreamServerConfig[] = [
      {
        id: "test",
        name: "Test",
        transport: "stdio",
        command: "echo",
        tools: {
          mytool: {
            compression: {
              enabled: true,
              tokenThreshold: undefined, // Undefined should not overwrite
            } as any,
          },
        },
      },
    ];
    const config = createTestConfig({ upstreams });
    config.defaults.compression = { tokenThreshold: 2000, enabled: false };
    const resolver = new ToolConfigResolver(config);

    const policy = resolver.resolveCompressionPolicy("test__mytool");
    // tokenThreshold should remain 2000 (not overwritten by undefined)
    expect(policy.tokenThreshold).toBe(2000);
    // enabled should be true (overwritten by tool)
    expect(policy.enabled).toBe(true);
  });

  it("should handle masking policy with undefined values in override", () => {
    const upstreams: UpstreamServerConfig[] = [
      {
        id: "test",
        name: "Test",
        transport: "stdio",
        command: "echo",
        tools: {
          mytool: {
            masking: {
              enabled: true,
              piiTypes: undefined, // Undefined should not overwrite
            } as any,
          },
        },
      },
    ];
    const config = createTestConfig({ upstreams });
    config.masking = { enabled: true };
    config.defaults.masking = {
      enabled: false,
      piiTypes: ["email", "ssn"],
      llmFallback: false,
      llmFallbackThreshold: "low",
    };
    const resolver = new ToolConfigResolver(config);

    const policy = resolver.resolveMaskingPolicy("test__mytool");
    // piiTypes should remain from defaults (not overwritten by undefined)
    expect(policy.piiTypes).toEqual(["email", "ssn"]);
    // enabled should be true (overwritten by tool)
    expect(policy.enabled).toBe(true);
  });

  it("should handle cache policy with undefined values in override", () => {
    const upstreams: UpstreamServerConfig[] = [
      {
        id: "test",
        name: "Test",
        transport: "stdio",
        command: "echo",
        tools: {
          mytool: {
            cache: {
              enabled: false,
              ttlSeconds: undefined, // Undefined should not overwrite
            } as any,
          },
        },
      },
    ];
    const config = createTestConfig({ upstreams });
    config.defaults.cache = { enabled: true, ttlSeconds: 300 };
    const resolver = new ToolConfigResolver(config);

    const policy = resolver.resolveCachePolicy("test__mytool");
    // ttlSeconds should remain 300 (not overwritten by undefined)
    expect(policy.ttlSeconds).toBe(300);
    // enabled should be false (overwritten by tool)
    expect(policy.enabled).toBe(false);
  });
});

describe("ToolConfigResolver - Custom Patterns Merging Edge Cases", () => {
  it("should include global customPatterns when calling resolveMaskingPolicy with no args", () => {
    const upstreams: UpstreamServerConfig[] = [
      {
        id: "test",
        name: "Test",
        transport: "stdio",
        command: "echo",
        tools: { mytool: {} },
      },
    ];
    const config = createTestConfig({ upstreams });
    config.masking = {
      enabled: true,
      llmConfig: { baseUrl: "http://localhost", model: "test" },
    };
    config.defaults.masking = {
      enabled: true,
      piiTypes: ["email"],
      llmFallback: false,
      llmFallbackThreshold: "low",
      customPatterns: {
        apiKey: { regex: "api-.*", replacement: "[API_KEY]" },
      },
    };
    const resolver = new ToolConfigResolver(config);

    const policy = resolver.resolveMaskingPolicy();
    expect(policy.customPatterns).toEqual({
      apiKey: { regex: "api-.*", replacement: "[API_KEY]" },
    });
  });

  it("should merge customPatterns from all levels", () => {
    const upstreams: UpstreamServerConfig[] = [
      {
        id: "test",
        name: "Test",
        transport: "stdio",
        command: "echo",
        defaults: {
          masking: {
            customPatterns: {
              upstreamKey: { regex: "upstream-.*", replacement: "[UPSTREAM_KEY]" },
            },
          },
        },
        tools: {
          mytool: {
            masking: {
              customPatterns: {
                toolKey: { regex: "tool-.*", replacement: "[TOOL_KEY]" },
              },
            },
          },
        },
      },
    ];
    const config = createTestConfig({ upstreams });
    config.masking = { enabled: true };
    config.defaults.masking = {
      enabled: true,
      piiTypes: ["email"],
      llmFallback: false,
      llmFallbackThreshold: "low",
      customPatterns: {
        globalKey: { regex: "global-.*", replacement: "[GLOBAL_KEY]" },
      },
    };
    const resolver = new ToolConfigResolver(config);

    const policy = resolver.resolveMaskingPolicy("test__mytool");
    // Should merge all three levels
    expect(policy.customPatterns).toEqual({
      globalKey: { regex: "global-.*", replacement: "[GLOBAL_KEY]" },
      upstreamKey: { regex: "upstream-.*", replacement: "[UPSTREAM_KEY]" },
      toolKey: { regex: "tool-.*", replacement: "[TOOL_KEY]" },
    });
  });

  it("should handle customPatterns with invalid tool name", () => {
    const upstreams: UpstreamServerConfig[] = [
      {
        id: "test",
        name: "Test",
        transport: "stdio",
        command: "echo",
        tools: {
          mytool: {
            masking: {
              customPatterns: {
                toolKey: { regex: "tool-.*", replacement: "[TOOL_KEY]" },
              },
            },
          },
        },
      },
    ];
    const config = createTestConfig({ upstreams });
    config.masking = { enabled: true };
    config.defaults.masking = {
      enabled: true,
      piiTypes: ["email"],
      llmFallback: false,
      llmFallbackThreshold: "low",
      customPatterns: {
        globalKey: { regex: "global-.*", replacement: "[GLOBAL_KEY]" },
      },
    };
    const resolver = new ToolConfigResolver(config);

    const policy = resolver.resolveMaskingPolicy("invalidname");
    // Should only include global (tool is invalid)
    expect(policy.customPatterns).toEqual({
      globalKey: { regex: "global-.*", replacement: "[GLOBAL_KEY]" },
    });
  });
});
