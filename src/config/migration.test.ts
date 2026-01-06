import { describe, it, expect, beforeEach, vi } from "vitest";
import { isLegacyConfig, migrateConfigV1toV2 } from "./migration.js";
import * as logger from "../logger.js";

describe("isLegacyConfig", () => {
  describe("should detect legacy configs", () => {
    it("should return true for config with compression.defaultPolicy and cache.enabled", () => {
      const legacyConfig = {
        compression: {
          defaultPolicy: { enabled: true, tokenThreshold: 1000 },
        },
        cache: { enabled: true, ttlSeconds: 300 },
      };

      expect(isLegacyConfig(legacyConfig)).toBe(true);
    });

    it("should return true for config with version: 1", () => {
      const legacyConfig = {
        version: 1,
        compression: {
          defaultPolicy: { enabled: true, tokenThreshold: 1000 },
        },
        cache: { enabled: true, ttlSeconds: 300 },
      };

      expect(isLegacyConfig(legacyConfig)).toBe(true);
    });

    it("should return true for config with missing version field", () => {
      const legacyConfig = {
        compression: {
          defaultPolicy: { enabled: true, tokenThreshold: 1000 },
        },
        cache: { enabled: true, ttlSeconds: 300 },
      };

      expect(isLegacyConfig(legacyConfig)).toBe(true);
    });
  });

  describe("should detect new configs", () => {
    it("should return false for config with version: 2", () => {
      const newConfig = {
        version: 2,
        compression: {
          baseUrl: "http://localhost",
          model: "test",
        },
        defaults: {
          compression: { enabled: true, tokenThreshold: 1000 },
        },
      };

      expect(isLegacyConfig(newConfig)).toBe(false);
    });

    it("should return false for config without compression.defaultPolicy", () => {
      const newConfig = {
        compression: {
          baseUrl: "http://localhost",
          model: "test",
        },
        cache: { enabled: true, ttlSeconds: 300 },
      };

      expect(isLegacyConfig(newConfig)).toBe(false);
    });

    it("should return false for config without cache.enabled", () => {
      const newConfig = {
        compression: {
          defaultPolicy: { enabled: true, tokenThreshold: 1000 },
        },
        cache: { maxEntries: 100 },
      };

      expect(isLegacyConfig(newConfig)).toBe(false);
    });
  });
});

describe("migrateConfigV1toV2", () => {
  beforeEach(() => {
    // Mock logger to avoid console output during tests
    vi.spyOn(logger, "getLogger").mockReturnValue({
      warn: vi.fn(),
      info: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
    } as any);
  });

  describe("tool migration - cacheTtl conversion", () => {
    it("should convert cacheTtl: 0 to cache: { enabled: false }", () => {
      const legacyConfig = {
        downstream: { transport: "stdio" },
        upstreams: [
          {
            id: "test-server",
            name: "Test Server",
            transport: "stdio",
            command: "test",
            tools: {
              "test-tool": {
                cacheTtl: 0,
              },
            },
          },
        ],
        compression: {
          baseUrl: "http://localhost",
          apiKey: "test-key",
          model: "test-model",
          defaultPolicy: {
            enabled: true,
            tokenThreshold: 1000,
          },
        },
        cache: {
          enabled: true,
          ttlSeconds: 300,
          maxEntries: 100,
        },
      };

      const migrated = migrateConfigV1toV2(legacyConfig as any);

      expect(migrated.upstreams[0].tools?.["test-tool"]).toEqual({
        cache: { enabled: false },
      });
    });

    it("should convert cacheTtl: N to cache: { ttlSeconds: N }", () => {
      const legacyConfig = {
        downstream: { transport: "stdio" },
        upstreams: [
          {
            id: "test-server",
            name: "Test Server",
            transport: "stdio",
            command: "test",
            tools: {
              "test-tool": {
                cacheTtl: 60,
              },
            },
          },
        ],
        compression: {
          baseUrl: "http://localhost",
          apiKey: "test-key",
          model: "test-model",
          defaultPolicy: {
            enabled: true,
            tokenThreshold: 1000,
          },
        },
        cache: {
          enabled: true,
          ttlSeconds: 300,
          maxEntries: 100,
        },
      };

      const migrated = migrateConfigV1toV2(legacyConfig as any);

      expect(migrated.upstreams[0].tools?.["test-tool"]).toEqual({
        cache: { ttlSeconds: 60 },
      });
    });

    it("should not include cache field when cacheTtl is undefined", () => {
      const legacyConfig = {
        downstream: { transport: "stdio" },
        upstreams: [
          {
            id: "test-server",
            name: "Test Server",
            transport: "stdio",
            command: "test",
            tools: {
              "test-tool": {
                hidden: true,
              },
            },
          },
        ],
        compression: {
          baseUrl: "http://localhost",
          apiKey: "test-key",
          model: "test-model",
          defaultPolicy: {
            enabled: true,
            tokenThreshold: 1000,
          },
        },
        cache: {
          enabled: true,
          ttlSeconds: 300,
          maxEntries: 100,
        },
      };

      const migrated = migrateConfigV1toV2(legacyConfig as any);

      expect(migrated.upstreams[0].tools?.["test-tool"]).toEqual({
        hidden: true,
      });
      expect(migrated.upstreams[0].tools?.["test-tool"]).not.toHaveProperty("cache");
    });
  });

  describe("tool migration - property preservation", () => {
    it("should preserve compression policy", () => {
      const legacyConfig = {
        downstream: { transport: "stdio" },
        upstreams: [
          {
            id: "test-server",
            name: "Test Server",
            transport: "stdio",
            command: "test",
            tools: {
              "test-tool": {
                compression: {
                  enabled: false,
                  tokenThreshold: 5000,
                },
              },
            },
          },
        ],
        compression: {
          baseUrl: "http://localhost",
          model: "test-model",
          defaultPolicy: {
            enabled: true,
            tokenThreshold: 1000,
          },
        },
        cache: {
          enabled: true,
          ttlSeconds: 300,
          maxEntries: 100,
        },
      };

      const migrated = migrateConfigV1toV2(legacyConfig as any);

      expect(migrated.upstreams[0].tools?.["test-tool"]?.compression).toEqual({
        enabled: false,
        tokenThreshold: 5000,
      });
    });

    it("should preserve masking policy", () => {
      const legacyConfig = {
        downstream: { transport: "stdio" },
        upstreams: [
          {
            id: "test-server",
            name: "Test Server",
            transport: "stdio",
            command: "test",
            tools: {
              "test-tool": {
                masking: {
                  enabled: true,
                  piiTypes: ["email", "phone"],
                },
              },
            },
          },
        ],
        compression: {
          baseUrl: "http://localhost",
          model: "test-model",
          defaultPolicy: {
            enabled: true,
            tokenThreshold: 1000,
          },
        },
        cache: {
          enabled: true,
          ttlSeconds: 300,
          maxEntries: 100,
        },
      };

      const migrated = migrateConfigV1toV2(legacyConfig as any);

      expect(migrated.upstreams[0].tools?.["test-tool"]?.masking).toEqual({
        enabled: true,
        piiTypes: ["email", "phone"],
      });
    });

    it("should preserve all tool properties", () => {
      const legacyConfig = {
        downstream: { transport: "stdio" },
        upstreams: [
          {
            id: "test-server",
            name: "Test Server",
            transport: "stdio",
            command: "test",
            tools: {
              "test-tool": {
                hidden: true,
                overwriteDescription: "Custom description",
                hideParameters: ["secret"],
                parameterOverrides: { param1: "value1" },
              },
            },
          },
        ],
        compression: {
          baseUrl: "http://localhost",
          model: "test-model",
          defaultPolicy: {
            enabled: true,
            tokenThreshold: 1000,
          },
        },
        cache: {
          enabled: true,
          ttlSeconds: 300,
          maxEntries: 100,
        },
      };

      const migrated = migrateConfigV1toV2(legacyConfig as any);

      expect(migrated.upstreams[0].tools?.["test-tool"]).toEqual({
        hidden: true,
        overwriteDescription: "Custom description",
        hideParameters: ["secret"],
        parameterOverrides: { param1: "value1" },
      });
    });

    it("should filter out undefined fields", () => {
      const legacyConfig = {
        downstream: { transport: "stdio" },
        upstreams: [
          {
            id: "test-server",
            name: "Test Server",
            transport: "stdio",
            command: "test",
            tools: {
              "test-tool": {
                hidden: true,
                // All other fields undefined
              },
            },
          },
        ],
        compression: {
          baseUrl: "http://localhost",
          model: "test-model",
          defaultPolicy: {
            enabled: true,
            tokenThreshold: 1000,
          },
        },
        cache: {
          enabled: true,
          ttlSeconds: 300,
          maxEntries: 100,
        },
      };

      const migrated = migrateConfigV1toV2(legacyConfig as any);
      const tool = migrated.upstreams[0].tools?.["test-tool"];

      expect(tool).toEqual({ hidden: true });
      expect(Object.keys(tool!)).toHaveLength(1);
    });
  });

  describe("complete config migration", () => {
    it("should migrate compression.defaultPolicy to defaults.compression", () => {
      const legacyConfig = {
        downstream: { transport: "stdio" },
        upstreams: [],
        compression: {
          baseUrl: "http://localhost:8080",
          apiKey: "test-key",
          model: "test-model",
          defaultPolicy: {
            enabled: false,
            tokenThreshold: 2000,
            maxOutputTokens: 500,
          },
          goalAware: false,
          bypassEnabled: true,
        },
        cache: {
          enabled: true,
          ttlSeconds: 300,
          maxEntries: 100,
        },
      };

      const migrated = migrateConfigV1toV2(legacyConfig as any);

      expect(migrated.defaults.compression).toEqual({
        enabled: false,
        tokenThreshold: 2000,
        maxOutputTokens: 500,
        goalAware: false,
      });
    });

    it("should migrate masking config to defaults.masking when present", () => {
      const legacyConfig = {
        downstream: { transport: "stdio" },
        upstreams: [],
        compression: {
          baseUrl: "http://localhost",
          model: "test-model",
          defaultPolicy: {
            enabled: true,
            tokenThreshold: 1000,
          },
        },
        cache: {
          enabled: true,
          ttlSeconds: 300,
          maxEntries: 100,
        },
        masking: {
          enabled: true,
          defaultPolicy: {
            enabled: true,
            piiTypes: ["email", "ssn"],
            llmFallback: true,
            llmFallbackThreshold: "high",
            customPatterns: {
              customField: { regex: "test", replacement: "XXX" },
            },
          },
          llmConfig: {
            baseUrl: "http://llm-server",
            model: "llm-model",
          },
        },
      };

      const migrated = migrateConfigV1toV2(legacyConfig as any);

      expect(migrated.defaults.masking).toEqual({
        enabled: true,
        piiTypes: ["email", "ssn"],
        llmFallback: true,
        llmFallbackThreshold: "high",
        customPatterns: {
          customField: { regex: "test", replacement: "XXX" },
        },
      });
      expect(migrated.masking).toEqual({
        enabled: true,
        llmConfig: {
          baseUrl: "http://llm-server",
          model: "llm-model",
        },
      });
    });

    it("should use default masking when masking config is missing", () => {
      const legacyConfig = {
        downstream: { transport: "stdio" },
        upstreams: [],
        compression: {
          baseUrl: "http://localhost",
          model: "test-model",
          defaultPolicy: {
            enabled: true,
            tokenThreshold: 1000,
          },
        },
        cache: {
          enabled: true,
          ttlSeconds: 300,
          maxEntries: 100,
        },
      };

      const migrated = migrateConfigV1toV2(legacyConfig as any);

      expect(migrated.defaults.masking).toEqual({
        enabled: false,
        piiTypes: ["email", "ssn", "phone", "credit_card", "ip_address"],
        llmFallback: false,
        llmFallbackThreshold: "low",
      });
      expect(migrated.masking).toBeUndefined();
    });

    it("should migrate cache infrastructure correctly", () => {
      const legacyConfig = {
        downstream: { transport: "stdio" },
        upstreams: [],
        compression: {
          baseUrl: "http://localhost",
          model: "test-model",
          defaultPolicy: {
            enabled: true,
            tokenThreshold: 1000,
          },
        },
        cache: {
          enabled: false,
          ttlSeconds: 600,
          maxEntries: 500,
          cacheErrors: false,
        },
      };

      const migrated = migrateConfigV1toV2(legacyConfig as any);

      expect(migrated.defaults.cache).toEqual({
        enabled: false,
        ttlSeconds: 600,
      });
      expect(migrated.cache).toEqual({
        maxEntries: 500,
        cacheErrors: false,
      });
    });

    it("should default cacheErrors to true when undefined", () => {
      const legacyConfig = {
        downstream: { transport: "stdio" },
        upstreams: [],
        compression: {
          baseUrl: "http://localhost",
          model: "test-model",
          defaultPolicy: {
            enabled: true,
            tokenThreshold: 1000,
          },
        },
        cache: {
          enabled: true,
          ttlSeconds: 300,
          maxEntries: 100,
        },
      };

      const migrated = migrateConfigV1toV2(legacyConfig as any);

      expect(migrated.cache.cacheErrors).toBe(true);
    });

    it("should bump version to 2", () => {
      const legacyConfig = {
        downstream: { transport: "stdio" },
        upstreams: [],
        compression: {
          baseUrl: "http://localhost",
          model: "test-model",
          defaultPolicy: {
            enabled: true,
            tokenThreshold: 1000,
          },
        },
        cache: {
          enabled: true,
          ttlSeconds: 300,
          maxEntries: 100,
        },
      };

      const migrated = migrateConfigV1toV2(legacyConfig as any);

      expect(migrated.version).toBe(2);
    });

    it("should preserve all upstream properties", () => {
      const legacyConfig = {
        downstream: { transport: "stdio" },
        upstreams: [
          {
            id: "server1",
            name: "Server 1",
            transport: "stdio",
            command: "node",
            args: ["server.js"],
            env: { NODE_ENV: "test" },
            enabled: false,
          },
          {
            id: "server2",
            name: "Server 2",
            transport: "sse",
            url: "http://localhost:3000",
            enabled: true,
          },
        ],
        compression: {
          baseUrl: "http://localhost",
          model: "test-model",
          defaultPolicy: {
            enabled: true,
            tokenThreshold: 1000,
          },
        },
        cache: {
          enabled: true,
          ttlSeconds: 300,
          maxEntries: 100,
        },
      };

      const migrated = migrateConfigV1toV2(legacyConfig as any);

      expect(migrated.upstreams).toHaveLength(2);
      expect(migrated.upstreams[0]).toMatchObject({
        id: "server1",
        name: "Server 1",
        transport: "stdio",
        command: "node",
        args: ["server.js"],
        env: { NODE_ENV: "test" },
        enabled: false,
      });
      expect(migrated.upstreams[1]).toMatchObject({
        id: "server2",
        name: "Server 2",
        transport: "sse",
        url: "http://localhost:3000",
        enabled: true,
      });
    });

    it("should migrate complete legacy config with multiple tools", () => {
      const legacyConfig = {
        downstream: { transport: "stdio" },
        upstreams: [
          {
            id: "test-server",
            name: "Test Server",
            transport: "stdio",
            command: "test",
            tools: {
              "tool1": {
                cacheTtl: 0,
                hidden: true,
              },
              "tool2": {
                cacheTtl: 120,
                compression: { enabled: false },
              },
              "tool3": {
                masking: { enabled: true },
                overwriteDescription: "Custom",
              },
            },
          },
        ],
        compression: {
          baseUrl: "http://localhost",
          model: "test-model",
          defaultPolicy: {
            enabled: true,
            tokenThreshold: 1000,
          },
        },
        cache: {
          enabled: true,
          ttlSeconds: 300,
          maxEntries: 100,
        },
        logLevel: "debug",
      };

      const migrated = migrateConfigV1toV2(legacyConfig as any);

      expect(migrated.version).toBe(2);
      expect(migrated.logLevel).toBe("debug");
      expect(migrated.upstreams[0].tools?.["tool1"]).toEqual({
        cache: { enabled: false },
        hidden: true,
      });
      expect(migrated.upstreams[0].tools?.["tool2"]).toEqual({
        cache: { ttlSeconds: 120 },
        compression: { enabled: false },
      });
      expect(migrated.upstreams[0].tools?.["tool3"]).toEqual({
        masking: { enabled: true },
        overwriteDescription: "Custom",
      });
    });

    it("should default logLevel to info when undefined", () => {
      const legacyConfig = {
        downstream: { transport: "stdio" },
        upstreams: [],
        compression: {
          baseUrl: "http://localhost",
          model: "test-model",
          defaultPolicy: {
            enabled: true,
            tokenThreshold: 1000,
          },
        },
        cache: {
          enabled: true,
          ttlSeconds: 300,
          maxEntries: 100,
        },
      };

      const migrated = migrateConfigV1toV2(legacyConfig as any);

      expect(migrated.logLevel).toBe("info");
    });

    it("should default goalAware to true when undefined", () => {
      const legacyConfig = {
        downstream: { transport: "stdio" },
        upstreams: [],
        compression: {
          baseUrl: "http://localhost",
          model: "test-model",
          defaultPolicy: {
            enabled: true,
            tokenThreshold: 1000,
          },
        },
        cache: {
          enabled: true,
          ttlSeconds: 300,
          maxEntries: 100,
        },
      };

      const migrated = migrateConfigV1toV2(legacyConfig as any);

      expect(migrated.defaults.compression?.goalAware).toBe(true);
    });

    it("should default bypassEnabled to false when undefined", () => {
      const legacyConfig = {
        downstream: { transport: "stdio" },
        upstreams: [],
        compression: {
          baseUrl: "http://localhost",
          model: "test-model",
          defaultPolicy: {
            enabled: true,
            tokenThreshold: 1000,
          },
        },
        cache: {
          enabled: true,
          ttlSeconds: 300,
          maxEntries: 100,
        },
      };

      const migrated = migrateConfigV1toV2(legacyConfig as any);

      expect(migrated.compression.bypassEnabled).toBe(false);
    });
  });
});
