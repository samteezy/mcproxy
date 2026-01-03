import { describe, it, expect } from "vitest";
import { ToolConfigResolver } from "./tool-resolver.js";
import type { UpstreamServerConfig, MCPCPConfig } from "../types.js";

function createTestConfig(upstreams: UpstreamServerConfig[]): MCPCPConfig {
  return {
    upstreams,
    compression: {
      baseUrl: "http://localhost:8080",
      model: "test-model",
      defaultPolicy: {
        enabled: true,
        tokenThreshold: 1000,
      },
    },
    cache: {
      enabled: false,
      ttlSeconds: 60,
    },
  } as MCPCPConfig;
}

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
    const resolver = new ToolConfigResolver(createTestConfig(upstreams));

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
    const resolver = new ToolConfigResolver(createTestConfig(upstreams));

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
    const resolver = new ToolConfigResolver(createTestConfig(upstreams));

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
    const resolver = new ToolConfigResolver(createTestConfig(upstreams));

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
    const resolver = new ToolConfigResolver(createTestConfig(upstreams));

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
    const resolver = new ToolConfigResolver(createTestConfig(upstreams));

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
    const resolver = new ToolConfigResolver(createTestConfig(upstreams));

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
    const resolver = new ToolConfigResolver(createTestConfig(upstreams));

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
    const resolver = new ToolConfigResolver(createTestConfig(upstreams));

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
