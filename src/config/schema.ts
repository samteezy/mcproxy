import { z } from "zod";

export const transportSchema = z.enum(["stdio", "sse", "streamable-http"]);

export const upstreamServerSchema = z
  .object({
    id: z.string().min(1),
    name: z.string().min(1),
    transport: transportSchema,
    command: z.string().optional(),
    args: z.array(z.string()).optional(),
    env: z.record(z.string()).optional(),
    url: z.string().url().optional(),
    enabled: z.boolean().default(true),
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

export const compressionPolicySchema = z.object({
  enabled: z.boolean().optional(),
  tokenThreshold: z.number().int().positive().optional(),
  maxOutputTokens: z.number().int().positive().optional(),
  goalAware: z.boolean().optional(),
});

export const defaultPolicySchema = z.object({
  enabled: z.boolean().default(true),
  tokenThreshold: z.number().int().positive().default(1000),
  maxOutputTokens: z.number().int().positive().optional(),
});

export const compressionSchema = z.object({
  baseUrl: z.string().url(),
  apiKey: z.string().optional(),
  model: z.string().min(1),
  defaultPolicy: defaultPolicySchema.default({
    enabled: true,
    tokenThreshold: 1000,
  }),
  toolPolicies: z.record(compressionPolicySchema).optional(),
  goalAware: z.boolean().default(true),
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
  enabled: z.boolean().default(true),
  ttlSeconds: z.number().int().positive().default(300),
  maxEntries: z.number().int().positive().default(1000),
});

export const toolsSchema = z.object({
  hidden: z.array(z.string()).optional(),
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

export const maskingPolicySchema = z.object({
  enabled: z.boolean().optional(),
  piiTypes: z.array(piiTypeSchema).optional(),
  llmFallback: z.boolean().optional(),
  llmFallbackThreshold: z.number().min(0).max(1).optional(),
  customPatterns: z.record(customPatternDefSchema).optional(),
});

export const maskingDefaultPolicySchema = z.object({
  enabled: z.boolean().default(true),
  piiTypes: z
    .array(piiTypeSchema)
    .default(["email", "ssn", "phone", "credit_card", "ip_address"]),
  llmFallback: z.boolean().default(false),
  llmFallbackThreshold: z.number().min(0).max(1).default(0.7),
  customPatterns: z.record(customPatternDefSchema).optional(),
});

export const maskingLlmConfigSchema = z.object({
  baseUrl: z.string().url(),
  apiKey: z.string().optional(),
  model: z.string().min(1),
});

export const maskingSchema = z.object({
  enabled: z.boolean().default(false),
  defaultPolicy: maskingDefaultPolicySchema.default({
    enabled: true,
    piiTypes: ["email", "ssn", "phone", "credit_card", "ip_address"],
    llmFallback: false,
    llmFallbackThreshold: 0.7,
  }),
  toolPolicies: z.record(maskingPolicySchema).optional(),
  llmConfig: maskingLlmConfigSchema.optional(),
});

export const configSchema = z.object({
  downstream: downstreamSchema,
  upstreams: z.array(upstreamServerSchema).min(1),
  compression: compressionSchema,
  cache: cacheSchema.default({
    enabled: true,
    ttlSeconds: 300,
    maxEntries: 1000,
  }),
  tools: toolsSchema.optional(),
  masking: maskingSchema.optional(),
  logLevel: z.enum(["error", "warn", "info", "debug"]).default("info"),
});

export type ConfigSchema = z.infer<typeof configSchema>;
