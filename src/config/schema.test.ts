import { describe, it, expect } from "vitest";
import {
  toolConfigSchema,
  compressionPolicySchema,
  maskingPolicySchema,
  upstreamServerSchema,
  transportSchema,
  configSchema,
} from "./schema.js";

describe("toolConfigSchema - Parameter Hiding Validation", () => {
  it("should accept valid tool config with no parameter hiding", () => {
    const config = {
      hidden: false,
      compression: { enabled: true, tokenThreshold: 1000 },
    };
    const result = toolConfigSchema.safeParse(config);
    expect(result.success).toBe(true);
  });

  it("should accept hideParameters as array of strings", () => {
    const config = {
      hideParameters: ["param1", "param2"],
      parameterOverrides: { param1: "value1", param2: "value2" },
    };
    const result = toolConfigSchema.safeParse(config);
    expect(result.success).toBe(true);
  });

  it("should accept parameterOverrides as record", () => {
    const config = {
      parameterOverrides: { param: "value", other: 123 },
    };
    const result = toolConfigSchema.safeParse(config);
    expect(result.success).toBe(true);
  });

  it("should accept parameterOverrides with complex values", () => {
    const config = {
      parameterOverrides: {
        headers: { "User-Agent": "MCPCP/1.0" },
        exclude_dirs: [".git", "node_modules"],
        timeout: 30,
        enabled: true,
      },
    };
    const result = toolConfigSchema.safeParse(config);
    expect(result.success).toBe(true);
  });

  it("should reject hidden parameters without overrides", () => {
    const config = {
      hideParameters: ["max_length"],
      parameterOverrides: {},
    };
    const result = toolConfigSchema.safeParse(config);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toContain(
        "All hidden parameters must have corresponding values in parameterOverrides"
      );
    }
  });

  it("should reject hidden parameters with missing overrides", () => {
    const config = {
      hideParameters: ["max_length"],
      // No parameterOverrides at all
    };
    const result = toolConfigSchema.safeParse(config);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toContain(
        "All hidden parameters must have corresponding values in parameterOverrides"
      );
    }
  });

  it("should reject hidden parameters with partial overrides", () => {
    const config = {
      hideParameters: ["param1", "param2"],
      parameterOverrides: { param1: "value1" },
      // param2 is missing
    };
    const result = toolConfigSchema.safeParse(config);
    expect(result.success).toBe(false);
  });

  it("should allow overrides without hiding", () => {
    const config = {
      parameterOverrides: { param: "value" },
      // No hideParameters
    };
    const result = toolConfigSchema.safeParse(config);
    expect(result.success).toBe(true);
  });

  it("should allow empty hideParameters array", () => {
    const config = {
      hideParameters: [],
      parameterOverrides: {},
    };
    const result = toolConfigSchema.safeParse(config);
    expect(result.success).toBe(true);
  });

  it("should reject hideParameters with non-string values", () => {
    const config = {
      hideParameters: [123, "valid"],
      parameterOverrides: {},
    };
    const result = toolConfigSchema.safeParse(config);
    expect(result.success).toBe(false);
  });

  it("should reject hideParameters with empty strings", () => {
    const config = {
      hideParameters: [""],
      parameterOverrides: { "": "value" },
    };
    const result = toolConfigSchema.safeParse(config);
    expect(result.success).toBe(false);
  });

  it("should accept valid cache policy", () => {
    const config = {
      cache: { ttlSeconds: 300 },
    };
    const result = toolConfigSchema.safeParse(config);
    expect(result.success).toBe(true);
  });

  it("should reject negative cache ttlSeconds", () => {
    const config = {
      cache: { ttlSeconds: -1 },
    };
    const result = toolConfigSchema.safeParse(config);
    expect(result.success).toBe(false);
  });

  it("should accept cache with disabled flag", () => {
    const config = {
      cache: { enabled: false },
    };
    const result = toolConfigSchema.safeParse(config);
    expect(result.success).toBe(true);
  });

  it("should accept complete tool config with all new fields", () => {
    const config = {
      hidden: false,
      compression: { enabled: true, tokenThreshold: 1000 },
      cache: { ttlSeconds: 60 },
      hideParameters: ["max_length"],
      parameterOverrides: { max_length: 50000 },
      overwriteDescription: "Custom description",
    };
    const result = toolConfigSchema.safeParse(config);
    expect(result.success).toBe(true);
  });
});

describe("compressionPolicySchema", () => {
  it("should accept enabled flag", () => {
    const result = compressionPolicySchema.safeParse({ enabled: true });
    expect(result.success).toBe(true);
  });

  it("should accept tokenThreshold", () => {
    const result = compressionPolicySchema.safeParse({ tokenThreshold: 1000 });
    expect(result.success).toBe(true);
  });

  it("should reject negative tokenThreshold", () => {
    const result = compressionPolicySchema.safeParse({ tokenThreshold: -100 });
    expect(result.success).toBe(false);
  });

  it("should reject zero tokenThreshold", () => {
    const result = compressionPolicySchema.safeParse({ tokenThreshold: 0 });
    expect(result.success).toBe(false);
  });

  it("should accept maxOutputTokens", () => {
    const result = compressionPolicySchema.safeParse({ maxOutputTokens: 500 });
    expect(result.success).toBe(true);
  });

  it("should reject negative maxOutputTokens", () => {
    const result = compressionPolicySchema.safeParse({ maxOutputTokens: -50 });
    expect(result.success).toBe(false);
  });

  it("should accept goalAware flag", () => {
    const result = compressionPolicySchema.safeParse({ goalAware: true });
    expect(result.success).toBe(true);
  });

  it("should accept customInstructions", () => {
    const result = compressionPolicySchema.safeParse({
      customInstructions: "Focus on technical details",
    });
    expect(result.success).toBe(true);
  });

  it("should accept all fields together", () => {
    const result = compressionPolicySchema.safeParse({
      enabled: true,
      tokenThreshold: 1000,
      maxOutputTokens: 500,
      goalAware: true,
      customInstructions: "Test",
    });
    expect(result.success).toBe(true);
  });
});

describe("maskingPolicySchema", () => {
  it("should accept enabled flag", () => {
    const result = maskingPolicySchema.safeParse({ enabled: true });
    expect(result.success).toBe(true);
  });

  it("should accept piiTypes array", () => {
    const result = maskingPolicySchema.safeParse({
      piiTypes: ["email", "ssn", "phone"],
    });
    expect(result.success).toBe(true);
  });

  it("should reject invalid PII type", () => {
    const result = maskingPolicySchema.safeParse({
      piiTypes: ["email", "invalid_type"],
    });
    expect(result.success).toBe(false);
  });

  it("should accept llmFallback flag", () => {
    const result = maskingPolicySchema.safeParse({ llmFallback: true });
    expect(result.success).toBe(true);
  });

  it("should accept llmFallbackThreshold", () => {
    const result = maskingPolicySchema.safeParse({ llmFallbackThreshold: "low" });
    expect(result.success).toBe(true);
  });

  it("should reject invalid llmFallbackThreshold", () => {
    const result = maskingPolicySchema.safeParse({ llmFallbackThreshold: "invalid" });
    expect(result.success).toBe(false);
  });

  it("should accept customPatterns", () => {
    const result = maskingPolicySchema.safeParse({
      customPatterns: {
        api_key: { regex: "\\bAPI[_-]?KEY\\b", replacement: "[REDACTED]" },
      },
    });
    expect(result.success).toBe(true);
  });

  it("should reject customPattern with empty regex", () => {
    const result = maskingPolicySchema.safeParse({
      customPatterns: {
        test: { regex: "", replacement: "[REDACTED]" },
      },
    });
    expect(result.success).toBe(false);
  });
});

describe("transportSchema", () => {
  it("should accept stdio", () => {
    const result = transportSchema.safeParse("stdio");
    expect(result.success).toBe(true);
  });

  it("should accept sse", () => {
    const result = transportSchema.safeParse("sse");
    expect(result.success).toBe(true);
  });

  it("should accept streamable-http", () => {
    const result = transportSchema.safeParse("streamable-http");
    expect(result.success).toBe(true);
  });

  it("should reject invalid transport", () => {
    const result = transportSchema.safeParse("websocket");
    expect(result.success).toBe(false);
  });
});

describe("upstreamServerSchema", () => {
  it("should accept minimal stdio config", () => {
    const config = {
      id: "test",
      name: "Test Server",
      transport: "stdio",
      command: "test-command",
    };
    const result = upstreamServerSchema.safeParse(config);
    expect(result.success).toBe(true);
  });

  it("should accept stdio with args and env", () => {
    const config = {
      id: "test",
      name: "Test Server",
      transport: "stdio",
      command: "node",
      args: ["server.js", "--port", "3000"],
      env: { NODE_ENV: "production" },
    };
    const result = upstreamServerSchema.safeParse(config);
    expect(result.success).toBe(true);
  });

  it("should accept streamable-http config", () => {
    const config = {
      id: "test",
      name: "Test Server",
      transport: "streamable-http",
      url: "http://localhost:3000",
    };
    const result = upstreamServerSchema.safeParse(config);
    expect(result.success).toBe(true);
  });

  it("should accept sse config", () => {
    const config = {
      id: "test",
      name: "Test Server",
      transport: "sse",
      url: "http://localhost:3000/sse",
    };
    const result = upstreamServerSchema.safeParse(config);
    expect(result.success).toBe(true);
  });

  it("should require command for stdio", () => {
    const config = {
      id: "test",
      name: "Test Server",
      transport: "stdio",
      // Missing command
    };
    const result = upstreamServerSchema.safeParse(config);
    expect(result.success).toBe(false);
  });

  it("should require url for http transports", () => {
    const config = {
      id: "test",
      name: "Test Server",
      transport: "streamable-http",
      // Missing url
    };
    const result = upstreamServerSchema.safeParse(config);
    expect(result.success).toBe(false);
  });

  it("should reject invalid url format", () => {
    const config = {
      id: "test",
      name: "Test Server",
      transport: "streamable-http",
      url: "not-a-url",
    };
    const result = upstreamServerSchema.safeParse(config);
    expect(result.success).toBe(false);
  });

  it("should default enabled to true", () => {
    const config = {
      id: "test",
      name: "Test Server",
      transport: "stdio",
      command: "test",
    };
    const result = upstreamServerSchema.safeParse(config);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.enabled).toBe(true);
    }
  });

  it("should accept enabled: false", () => {
    const config = {
      id: "test",
      name: "Test Server",
      transport: "stdio",
      command: "test",
      enabled: false,
    };
    const result = upstreamServerSchema.safeParse(config);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.enabled).toBe(false);
    }
  });

  it("should accept tools config", () => {
    const config = {
      id: "test",
      name: "Test Server",
      transport: "stdio",
      command: "test",
      tools: {
        my_tool: {
          hidden: false,
          compression: { enabled: true },
        },
      },
    };
    const result = upstreamServerSchema.safeParse(config);
    expect(result.success).toBe(true);
  });

  it("should require id", () => {
    const config = {
      name: "Test Server",
      transport: "stdio",
      command: "test",
    };
    const result = upstreamServerSchema.safeParse(config);
    expect(result.success).toBe(false);
  });

  it("should require name", () => {
    const config = {
      id: "test",
      transport: "stdio",
      command: "test",
    };
    const result = upstreamServerSchema.safeParse(config);
    expect(result.success).toBe(false);
  });

  it("should reject empty id", () => {
    const config = {
      id: "",
      name: "Test Server",
      transport: "stdio",
      command: "test",
    };
    const result = upstreamServerSchema.safeParse(config);
    expect(result.success).toBe(false);
  });
});

describe("configSchema", () => {
  it("should accept minimal valid config", () => {
    const config = {
      downstream: { transport: "stdio" },
      upstreams: [
        {
          id: "test",
          name: "Test Server",
          transport: "stdio",
          command: "test",
        },
      ],
      compression: {
        baseUrl: "http://localhost:8080/v1",
        model: "test-model",
        defaultPolicy: {
          enabled: true,
          tokenThreshold: 1000,
        },
      },
      cache: {
        enabled: true,
        ttlSeconds: 60,
        maxEntries: 100,
      },
    };
    const result = configSchema.safeParse(config);
    expect(result.success).toBe(true);
  });

  it("should accept config with masking", () => {
    const config = {
      downstream: { transport: "stdio" },
      upstreams: [
        {
          id: "test",
          name: "Test Server",
          transport: "stdio",
          command: "test",
        },
      ],
      compression: {
        baseUrl: "http://localhost:8080/v1",
        model: "test-model",
        defaultPolicy: {
          enabled: true,
          tokenThreshold: 1000,
        },
      },
      cache: {
        enabled: true,
        ttlSeconds: 60,
        maxEntries: 100,
      },
      masking: {
        enabled: true,
        defaultPolicy: {
          enabled: true,
          piiTypes: ["email", "ssn"],
        },
      },
    };
    const result = configSchema.safeParse(config);
    expect(result.success).toBe(true);
  });

  it("should accept config with http downstream", () => {
    const config = {
      downstream: {
        transport: "streamable-http",
        port: 3000,
        host: "0.0.0.0",
      },
      upstreams: [
        {
          id: "test",
          name: "Test Server",
          transport: "stdio",
          command: "test",
        },
      ],
      compression: {
        baseUrl: "http://localhost:8080/v1",
        model: "test-model",
        defaultPolicy: {
          enabled: true,
          tokenThreshold: 1000,
        },
      },
      cache: {
        enabled: true,
        ttlSeconds: 60,
        maxEntries: 100,
      },
    };
    const result = configSchema.safeParse(config);
    expect(result.success).toBe(true);
  });

  it("should require downstream", () => {
    const config = {
      upstreams: [
        {
          id: "test",
          name: "Test Server",
          transport: "stdio",
          command: "test",
        },
      ],
      compression: {
        baseUrl: "http://localhost:8080/v1",
        model: "test-model",
        defaultPolicy: {
          enabled: true,
          tokenThreshold: 1000,
        },
      },
      cache: {
        enabled: true,
        ttlSeconds: 60,
        maxEntries: 100,
      },
    };
    const result = configSchema.safeParse(config);
    expect(result.success).toBe(false);
  });

  it("should require upstreams", () => {
    const config = {
      downstream: { transport: "stdio" },
      compression: {
        baseUrl: "http://localhost:8080/v1",
        model: "test-model",
        defaultPolicy: {
          enabled: true,
          tokenThreshold: 1000,
        },
      },
      cache: {
        enabled: true,
        ttlSeconds: 60,
        maxEntries: 100,
      },
    };
    const result = configSchema.safeParse(config);
    expect(result.success).toBe(false);
  });

  it("should require compression", () => {
    const config = {
      downstream: { transport: "stdio" },
      upstreams: [
        {
          id: "test",
          name: "Test Server",
          transport: "stdio",
          command: "test",
        },
      ],
      cache: {
        enabled: true,
        ttlSeconds: 60,
        maxEntries: 100,
      },
    };
    const result = configSchema.safeParse(config);
    expect(result.success).toBe(false);
  });

  it("should use default cache when not provided", () => {
    const config = {
      downstream: { transport: "stdio" },
      upstreams: [
        {
          id: "test",
          name: "Test Server",
          transport: "stdio",
          command: "test",
        },
      ],
      compression: {
        baseUrl: "http://localhost:8080/v1",
        model: "test-model",
      },
    };
    const result = configSchema.safeParse(config);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.cache).toBeDefined();
      expect(result.data.cache.maxEntries).toBe(1000);
      expect(result.data.defaults.cache!.enabled).toBe(true);
    }
  });

  it("should accept valid logLevel", () => {
    const config = {
      downstream: { transport: "stdio" },
      upstreams: [
        {
          id: "test",
          name: "Test Server",
          transport: "stdio",
          command: "test",
        },
      ],
      compression: {
        baseUrl: "http://localhost:8080/v1",
        model: "test-model",
        defaultPolicy: {
          enabled: true,
          tokenThreshold: 1000,
        },
      },
      cache: {
        enabled: true,
        ttlSeconds: 60,
        maxEntries: 100,
      },
      logLevel: "debug",
    };
    const result = configSchema.safeParse(config);
    expect(result.success).toBe(true);
  });
});
