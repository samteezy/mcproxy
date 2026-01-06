import { z } from "zod";

export const transportSchema = z.enum(["stdio", "sse", "streamable-http"]);

export const compressionPolicySchema = z.object({
  enabled: z.boolean().optional(),
  tokenThreshold: z.number().int().positive().optional(),
  maxOutputTokens: z.number().int().positive().optional(),
  goalAware: z.boolean().optional(),
  customInstructions: z.string().optional(),
});

export const piiTypeSchema = z.enum([
  "email",
  "ssn",
  "phone",
  "credit_card",
  "ip_address",
  "date_of_birth",
  "passport",
  "driver_license",
  "custom",
]);

export const customPatternDefSchema = z.object({
  regex: z.string().min(1),
  replacement: z.string(),
});

export const patternConfidenceSchema = z.enum(["low", "medium", "high"]);

export const maskingPolicySchema = z.object({
  enabled: z.boolean().optional(),
  piiTypes: z.array(piiTypeSchema).optional(),
  llmFallback: z.boolean().optional(),
  llmFallbackThreshold: patternConfidenceSchema.optional(),
  customPatterns: z.record(z.string(), customPatternDefSchema).optional(),
});

export const cachePolicySchema = z.object({
  enabled: z.boolean().optional(),
  ttlSeconds: z.number().int().positive().optional(),
});

export const proxyDefaultsSchema = z.object({
  compression: compressionPolicySchema.optional(),
  masking: maskingPolicySchema.optional(),
  cache: cachePolicySchema.optional(),
});

export const toolConfigSchema = z
  .object({
    hidden: z.boolean().default(false),
    compression: compressionPolicySchema.optional(),
    masking: maskingPolicySchema.optional(),
    cache: cachePolicySchema.optional(),
    overwriteDescription: z.string().optional(),
    hideParameters: z.array(z.string().min(1)).optional(),
    parameterOverrides: z.record(z.string(), z.unknown()).optional(),
  })
  .refine(
    (data) => {
      // Validation: All hidden parameters must have overrides
      if (data.hideParameters && data.hideParameters.length > 0) {
        if (!data.parameterOverrides) {
          return false;
        }
        // Check every hidden parameter has an override
        const overrides = data.parameterOverrides;
        return data.hideParameters.every((param) => param in overrides);
      }
      return true;
    },
    {
      message:
        "All hidden parameters must have corresponding values in parameterOverrides",
    }
  );

export const upstreamServerSchema = z
  .object({
    id: z.string().min(1),
    name: z.string().min(1),
    transport: transportSchema,
    command: z.string().optional(),
    args: z.array(z.string()).optional(),
    env: z.record(z.string(), z.string()).optional(),
    url: z.string().url().optional(),
    enabled: z.boolean().default(true),
    defaults: proxyDefaultsSchema.optional(),
    tools: z.record(z.string(), toolConfigSchema).optional(),
  })
  .refine(
    (data) => {
      if (data.transport === "stdio") {
        return !!data.command;
      }
      return !!data.url;
    },
    {
      message:
        "stdio transport requires 'command', sse/streamable-http require 'url'",
    }
  );

export const retryEscalationSchema = z.object({
  enabled: z.boolean().default(true),
  windowSeconds: z.number().min(1).default(60),
  tokenMultiplier: z.number().min(1).default(2),
});

export const compressionSchema = z.object({
  baseUrl: z.string().url(),
  apiKey: z.string().optional(),
  model: z.string().min(1),
  bypassEnabled: z.boolean().default(false),
  retryEscalation: retryEscalationSchema.optional(),
});

export const downstreamSchema = z
  .object({
    transport: transportSchema,
    port: z.number().int().positive().optional(),
    host: z.string().optional(),
  })
  .refine(
    (data) => {
      if (data.transport !== "stdio") {
        return data.port !== undefined;
      }
      return true;
    },
    {
      message: "sse/streamable-http transport requires 'port'",
    }
  );

export const cacheSchema = z.object({
  maxEntries: z.number().int().positive().default(1000),
  cacheErrors: z.boolean().default(true),
});

export const maskingLlmConfigSchema = z.object({
  baseUrl: z.string().url(),
  apiKey: z.string().optional(),
  model: z.string().min(1),
});

export const maskingSchema = z.object({
  enabled: z.boolean().default(false),
  llmConfig: maskingLlmConfigSchema.optional(),
});

export const configSchema = z.object({
  version: z.literal(2).default(2),
  downstream: downstreamSchema,
  upstreams: z.array(upstreamServerSchema).min(1),
  defaults: proxyDefaultsSchema.default({
    compression: {
      enabled: true,
      tokenThreshold: 1000,
      goalAware: true,
    },
    masking: {
      enabled: false,
      piiTypes: ["email", "ssn", "phone", "credit_card", "ip_address"],
      llmFallback: false,
      llmFallbackThreshold: "low" as const,
    },
    cache: {
      enabled: true,
      ttlSeconds: 300,
    },
  }),
  compression: compressionSchema,
  cache: cacheSchema.default({
    maxEntries: 1000,
    cacheErrors: true,
  }),
  masking: maskingSchema.optional(),
  logLevel: z.enum(["error", "warn", "info", "debug"]).default("info"),
});

export type ConfigSchema = z.infer<typeof configSchema>;
