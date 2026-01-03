import { describe, it, expect } from "vitest";
import { toolConfigSchema } from "./schema.js";

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

  it("should accept valid cacheTtl", () => {
    const config = {
      cacheTtl: 300,
    };
    const result = toolConfigSchema.safeParse(config);
    expect(result.success).toBe(true);
  });

  it("should reject negative cacheTtl", () => {
    const config = {
      cacheTtl: -1,
    };
    const result = toolConfigSchema.safeParse(config);
    expect(result.success).toBe(false);
  });

  it("should accept cacheTtl of 0 (no caching)", () => {
    const config = {
      cacheTtl: 0,
    };
    const result = toolConfigSchema.safeParse(config);
    expect(result.success).toBe(true);
  });

  it("should accept complete tool config with all new fields", () => {
    const config = {
      hidden: false,
      compression: { enabled: true, tokenThreshold: 1000 },
      cacheTtl: 60,
      hideParameters: ["max_length"],
      parameterOverrides: { max_length: 50000 },
      overwriteDescription: "Custom description",
    };
    const result = toolConfigSchema.safeParse(config);
    expect(result.success).toBe(true);
  });
});
