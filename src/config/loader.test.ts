import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { loadConfig, generateExampleConfig } from "./loader.js";
import { createTestConfig } from "../test/helpers.js";

// Mock fs and path modules
vi.mock("node:fs", () => ({
  readFileSync: vi.fn(),
  existsSync: vi.fn(),
}));

vi.mock("node:path", () => ({
  resolve: vi.fn((path: string) => path),
}));

// Import mocked modules
import { readFileSync, existsSync } from "node:fs";

describe("loadConfig", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe("file loading", () => {
    it("should load valid JSON config from file", () => {
      const validConfig = createTestConfig();
      const configJson = JSON.stringify(validConfig);

      vi.mocked(existsSync).mockReturnValue(true);
      vi.mocked(readFileSync).mockReturnValue(configJson);

      const result = loadConfig("test-config.json");

      expect(existsSync).toHaveBeenCalledWith("test-config.json");
      expect(readFileSync).toHaveBeenCalledWith("test-config.json", "utf-8");
      expect(result).toBeDefined();
      expect(result.upstreams).toBeDefined();
      expect(result.compression).toBeDefined();
      expect(result.cache).toBeDefined();
    });

    it("should throw on missing file", () => {
      vi.mocked(existsSync).mockReturnValue(false);

      expect(() => loadConfig("missing.json")).toThrow(
        "Configuration file not found: missing.json"
      );
      expect(readFileSync).not.toHaveBeenCalled();
    });

    it("should throw on invalid JSON", () => {
      vi.mocked(existsSync).mockReturnValue(true);
      vi.mocked(readFileSync).mockReturnValue("{invalid json}");

      expect(() => loadConfig("invalid.json")).toThrow("Invalid JSON in configuration file");
    });

    it("should throw on malformed JSON syntax", () => {
      vi.mocked(existsSync).mockReturnValue(true);
      vi.mocked(readFileSync).mockReturnValue('{"key": "value"'); // Missing closing brace

      expect(() => loadConfig("malformed.json")).toThrow("Invalid JSON in configuration file");
    });

    it("should propagate non-SyntaxError errors", () => {
      vi.mocked(existsSync).mockReturnValue(true);
      vi.mocked(readFileSync).mockImplementation(() => {
        throw new Error("File read error");
      });

      expect(() => loadConfig("error.json")).toThrow("File read error");
    });
  });

  describe("schema validation", () => {
    it("should validate required fields", () => {
      vi.mocked(existsSync).mockReturnValue(true);
      vi.mocked(readFileSync).mockReturnValue(
        JSON.stringify({
          // Missing required fields
          downstream: { transport: "stdio" },
        })
      );

      expect(() => loadConfig("incomplete.json")).toThrow("Configuration validation failed");
    });

    it("should validate upstream configs", () => {
      vi.mocked(existsSync).mockReturnValue(true);
      vi.mocked(readFileSync).mockReturnValue(
        JSON.stringify({
          downstream: { transport: "stdio" },
          upstreams: [
            {
              id: "test",
              name: "Test",
              transport: "stdio",
              // Missing command for stdio transport
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
        })
      );

      expect(() => loadConfig("invalid-upstream.json")).toThrow(
        "Configuration validation failed"
      );
    });

    it("should validate compression config", () => {
      const config = createTestConfig({
        defaults: {
          compression: {
            enabled: true,
            tokenThreshold: -1, // Invalid: negative
          },
        } as any,
      });

      vi.mocked(existsSync).mockReturnValue(true);
      vi.mocked(readFileSync).mockReturnValue(JSON.stringify(config));

      expect(() => loadConfig("invalid-compression.json")).toThrow(
        "Configuration validation failed"
      );
    });

    it("should validate cache config", () => {
      const config = createTestConfig({
        defaults: {
          cache: {
            enabled: true,
            ttlSeconds: -10, // Invalid: negative
          },
        } as any,
      });

      vi.mocked(existsSync).mockReturnValue(true);
      vi.mocked(readFileSync).mockReturnValue(JSON.stringify(config));

      expect(() => loadConfig("invalid-cache.json")).toThrow("Configuration validation failed");
    });

    it("should accept valid config with all fields", () => {
      const config = createTestConfig({
        masking: {
          enabled: true,
        },
      });

      vi.mocked(existsSync).mockReturnValue(true);
      vi.mocked(readFileSync).mockReturnValue(JSON.stringify(config));

      const result = loadConfig("full-config.json");

      expect(result).toBeDefined();
      expect(result.masking).toBeDefined();
      expect(result.masking?.enabled).toBe(true);
    });

    it("should accept minimal valid config", () => {
      const minimalConfig = {
        downstream: { transport: "stdio" },
        upstreams: [
          {
            id: "test",
            name: "Test Server",
            transport: "stdio",
            command: "test-command",
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

      vi.mocked(existsSync).mockReturnValue(true);
      vi.mocked(readFileSync).mockReturnValue(JSON.stringify(minimalConfig));

      const result = loadConfig("minimal-config.json");

      expect(result).toBeDefined();
      expect(result.upstreams.length).toBe(1);
    });

    it("should include validation error details", () => {
      vi.mocked(existsSync).mockReturnValue(true);
      vi.mocked(readFileSync).mockReturnValue(
        JSON.stringify({
          downstream: { transport: "invalid-transport" },
          upstreams: [],
          compression: {
            baseUrl: "http://localhost:8080/v1",
            model: "test",
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
        })
      );

      try {
        loadConfig("error-details.json");
        expect.fail("Should have thrown");
      } catch (error: any) {
        expect(error.message).toContain("Configuration validation failed");
        expect(error.message).toContain("downstream.transport");
      }
    });
  });

  describe("default values", () => {
    it("should apply default enabled=true for upstreams", () => {
      const config = {
        downstream: { transport: "stdio" },
        upstreams: [
          {
            id: "test",
            name: "Test Server",
            transport: "stdio",
            command: "test-command",
            // enabled not specified
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

      vi.mocked(existsSync).mockReturnValue(true);
      vi.mocked(readFileSync).mockReturnValue(JSON.stringify(config));

      const result = loadConfig("defaults.json");

      expect(result.upstreams[0].enabled).toBe(true);
    });

    it("should handle optional masking config", () => {
      const config = createTestConfig();
      // Remove masking to test optional field
      delete (config as any).masking;

      vi.mocked(existsSync).mockReturnValue(true);
      vi.mocked(readFileSync).mockReturnValue(JSON.stringify(config));

      const result = loadConfig("no-masking.json");

      expect(result.masking).toBeUndefined();
    });
  });

  describe("transport-specific validation", () => {
    it("should require command for stdio transport", () => {
      const config = createTestConfig({
        upstreams: [
          {
            id: "test",
            name: "Test",
            transport: "stdio",
            // Missing command
          } as any,
        ],
      });

      vi.mocked(existsSync).mockReturnValue(true);
      vi.mocked(readFileSync).mockReturnValue(JSON.stringify(config));

      expect(() => loadConfig("stdio-no-command.json")).toThrow(
        "Configuration validation failed"
      );
    });

    it("should require url for http transport", () => {
      const config = createTestConfig({
        upstreams: [
          {
            id: "test",
            name: "Test",
            transport: "streamable-http",
            // Missing url
          } as any,
        ],
      });

      vi.mocked(existsSync).mockReturnValue(true);
      vi.mocked(readFileSync).mockReturnValue(JSON.stringify(config));

      expect(() => loadConfig("http-no-url.json")).toThrow("Configuration validation failed");
    });

    it("should accept valid stdio config", () => {
      const config = createTestConfig({
        upstreams: [
          {
            id: "stdio-server",
            name: "Stdio Server",
            transport: "stdio",
            command: "node",
            args: ["server.js"],
            env: { NODE_ENV: "production" },
          },
        ],
      });

      vi.mocked(existsSync).mockReturnValue(true);
      vi.mocked(readFileSync).mockReturnValue(JSON.stringify(config));

      const result = loadConfig("valid-stdio.json");

      expect(result.upstreams[0].transport).toBe("stdio");
      expect(result.upstreams[0].command).toBe("node");
      expect(result.upstreams[0].args).toEqual(["server.js"]);
    });

    it("should accept valid http config", () => {
      const config = createTestConfig({
        upstreams: [
          {
            id: "http-server",
            name: "HTTP Server",
            transport: "streamable-http",
            url: "http://localhost:3000",
          },
        ],
      });

      vi.mocked(existsSync).mockReturnValue(true);
      vi.mocked(readFileSync).mockReturnValue(JSON.stringify(config));

      const result = loadConfig("valid-http.json");

      expect(result.upstreams[0].transport).toBe("streamable-http");
      expect(result.upstreams[0].url).toBe("http://localhost:3000");
    });
  });
});

describe("generateExampleConfig", () => {
  it("should generate valid config", () => {
    const config = generateExampleConfig();

    expect(config).toBeDefined();
    expect(config.downstream).toBeDefined();
    expect(config.upstreams).toBeDefined();
    expect(config.compression).toBeDefined();
    expect(config.cache).toBeDefined();
  });

  it("should have stdio downstream by default", () => {
    const config = generateExampleConfig();
    expect(config.downstream.transport).toBe("stdio");
  });

  it("should include example upstream", () => {
    const config = generateExampleConfig();

    expect(config.upstreams.length).toBeGreaterThan(0);
    expect(config.upstreams[0].id).toBe("example-server");
    expect(config.upstreams[0].transport).toBe("stdio");
    expect(config.upstreams[0].enabled).toBe(true);
  });

  it("should have compression enabled by default", () => {
    const config = generateExampleConfig();

    expect(config.defaults.compression!.enabled).toBe(true);
    expect(config.defaults.compression!.tokenThreshold).toBeGreaterThan(0);
  });

  it("should have cache enabled by default", () => {
    const config = generateExampleConfig();

    expect(config.defaults.cache!.enabled).toBe(true);
    expect(config.defaults.cache!.ttlSeconds).toBeGreaterThan(0);
    expect(config.cache.maxEntries).toBeGreaterThan(0);
  });

  it("should have goalAware enabled", () => {
    const config = generateExampleConfig();
    expect(config.defaults.compression!.goalAware).toBe(true);
  });

  it("should have log level set", () => {
    const config = generateExampleConfig();
    expect(config.logLevel).toBe("info");
  });

  it("should pass schema validation", () => {
    const config = generateExampleConfig();

    // Mock fs to use generated config
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readFileSync).mockReturnValue(JSON.stringify(config));

    // Should not throw
    expect(() => loadConfig("generated.json")).not.toThrow();
  });
});
