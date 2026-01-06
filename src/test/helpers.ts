import { vi } from "vitest";
import type {
  Tool,
  Resource,
  Prompt,
  CallToolResult,
  TextContent,
  ImageContent,
  EmbeddedResource,
} from "@modelcontextprotocol/sdk/types.js";
import type {
  MCPCPConfig,
  UpstreamServerConfig,
  CompressionConfig,
  CacheConfig,
  DownstreamConfig,
  ToolConfig,
  MaskingConfig,
  CompressionPolicy,
  MaskingPolicy,
} from "../types.js";

/**
 * Create a test upstream server configuration
 */
export function createTestUpstreamConfig(
  overrides?: Partial<UpstreamServerConfig>
): UpstreamServerConfig {
  return {
    id: "test-upstream",
    name: "Test Upstream Server",
    transport: "stdio",
    command: "test-command",
    args: ["--test"],
    enabled: true,
    tools: {},
    ...overrides,
  };
}

/**
 * Create a test downstream configuration
 */
export function createTestDownstreamConfig(
  overrides?: Partial<DownstreamConfig>
): DownstreamConfig {
  return {
    transport: "stdio",
    ...overrides,
  };
}

/**
 * Create a test compression configuration (v0.4.0 - infrastructure only)
 */
export function createTestCompressionConfig(
  overrides?: Partial<CompressionConfig>
): CompressionConfig {
  return {
    baseUrl: "http://localhost:8080/v1",
    apiKey: "test-key",
    model: "test-model",
    bypassEnabled: false,
    retryEscalation: {
      enabled: true,
      windowSeconds: 60,
      tokenMultiplier: 1,
    },
    ...overrides,
  };
}

/**
 * Create a test cache configuration (v0.4.0 - infrastructure only)
 */
export function createTestCacheConfig(overrides?: Partial<CacheConfig>): CacheConfig {
  return {
    maxEntries: 100,
    cacheErrors: true,
    ...overrides,
  };
}

/**
 * Create a test masking configuration (v0.4.0 - infrastructure only)
 */
export function createTestMaskingConfig(overrides?: Partial<MaskingConfig>): MaskingConfig {
  return {
    enabled: true,
    llmConfig: {
      baseUrl: "http://localhost:8080/v1",
      apiKey: "test-key",
      model: "test-model",
    },
    ...overrides,
  };
}

/**
 * Create a full test MCPCP configuration (v0.4.0)
 */
export function createTestConfig(overrides?: Partial<MCPCPConfig>): MCPCPConfig {
  return {
    version: 2,
    downstream: createTestDownstreamConfig(overrides?.downstream),
    upstreams: overrides?.upstreams || [createTestUpstreamConfig()],
    defaults: overrides?.defaults || {
      compression: {
        enabled: true,
        tokenThreshold: 1000,
        maxOutputTokens: 500,
        goalAware: true,
      },
      masking: {
        enabled: false,
        piiTypes: ["email", "ssn", "phone"],
        llmFallback: false,
        llmFallbackThreshold: "low",
      },
      cache: {
        enabled: true,
        ttlSeconds: 60,
      },
    },
    compression: createTestCompressionConfig(overrides?.compression),
    cache: createTestCacheConfig(overrides?.cache),
    logLevel: "error",
    ...overrides,
  };
}

/**
 * Create a test tool configuration
 */
export function createTestToolConfig(overrides?: Partial<ToolConfig>): ToolConfig {
  return {
    hidden: false,
    ...overrides,
  };
}

/**
 * Create a test MCP Tool
 */
export function createTestTool(overrides?: Partial<Tool>): Tool {
  return {
    name: "test_tool",
    description: "A test tool",
    inputSchema: {
      type: "object",
      properties: {
        input: {
          type: "string",
          description: "Test input",
        },
      },
      required: ["input"],
    },
    ...overrides,
  };
}

/**
 * Create a test MCP Resource
 */
export function createTestResource(overrides?: Partial<Resource>): Resource {
  return {
    uri: "test://resource",
    name: "Test Resource",
    description: "A test resource",
    mimeType: "text/plain",
    ...overrides,
  };
}

/**
 * Create a test MCP Prompt
 */
export function createTestPrompt(overrides?: Partial<Prompt>): Prompt {
  return {
    name: "test_prompt",
    description: "A test prompt",
    arguments: [
      {
        name: "arg1",
        description: "Test argument",
        required: true,
      },
    ],
    ...overrides,
  };
}

/**
 * Create a test text content block
 */
export function createTestTextContent(text: string): TextContent {
  return {
    type: "text",
    text,
  };
}

/**
 * Create a test image content block
 */
export function createTestImageContent(data: string, mimeType: string): ImageContent {
  return {
    type: "image",
    data,
    mimeType,
  };
}

/**
 * Create a test embedded resource block
 */
export function createTestEmbeddedResource(
  uri: string,
  text: string
): EmbeddedResource {
  return {
    type: "resource",
    resource: {
      uri,
      text,
    },
  };
}

/**
 * Create a test tool call result (success)
 */
export function createTestToolResult(
  content: string | Array<TextContent | ImageContent | EmbeddedResource>,
  isError = false
): CallToolResult {
  const contentArray = typeof content === "string" ? [createTestTextContent(content)] : content;

  return {
    content: contentArray,
    isError,
  };
}

/**
 * Create a mock logger (silent)
 */
export function createMockLogger() {
  return {
    error: vi.fn(),
    warn: vi.fn(),
    info: vi.fn(),
    debug: vi.fn(),
  };
}

/**
 * Mock tokenizer count function
 * Default: ~4 characters per token (approximation)
 */
export function mockTokenCount(text: string): number {
  return Math.ceil(text.length / 4);
}

/**
 * Create a mock MCP Client
 */
export function createMockMCPClient(options?: {
  tools?: Tool[];
  resources?: Resource[];
  prompts?: Prompt[];
  supportsResources?: boolean;
  supportsPrompts?: boolean;
}) {
  const {
    tools = [],
    resources = [],
    prompts = [],
    supportsResources = true,
    supportsPrompts = true,
  } = options || {};

  return {
    connect: vi.fn().mockResolvedValue(undefined),
    close: vi.fn().mockResolvedValue(undefined),
    listTools: vi.fn().mockResolvedValue({ tools }),
    callTool: vi.fn().mockResolvedValue({
      content: [createTestTextContent("Mock tool result")],
    }),
    listResources: vi.fn().mockResolvedValue({ resources }),
    readResource: vi.fn().mockResolvedValue({
      contents: [createTestTextContent("Mock resource content")],
    }),
    listPrompts: vi.fn().mockResolvedValue({ prompts }),
    getPrompt: vi.fn().mockResolvedValue({
      messages: [
        {
          role: "user",
          content: createTestTextContent("Mock prompt"),
        },
      ],
    }),
    getServerCapabilities: vi.fn().mockReturnValue({
      resources: supportsResources ? {} : undefined,
      prompts: supportsPrompts ? {} : undefined,
    }),
  };
}

/**
 * Create a mock MCP Server
 */
export function createMockMCPServer() {
  return {
    connect: vi.fn().mockResolvedValue(undefined),
    close: vi.fn().mockResolvedValue(undefined),
    setRequestHandler: vi.fn(),
    onclose: undefined,
    onerror: undefined,
  };
}

/**
 * Create a mock transport
 */
export function createMockTransport() {
  return {
    start: vi.fn().mockResolvedValue(undefined),
    close: vi.fn().mockResolvedValue(undefined),
    send: vi.fn().mockResolvedValue(undefined),
    onmessage: undefined,
    onclose: undefined,
    onerror: undefined,
  };
}

/**
 * Create mock Express request
 */
export function createMockRequest(body?: unknown, headers?: Record<string, string>) {
  return {
    body: body || {},
    headers: headers || {},
    method: "POST",
    url: "/test",
    on: vi.fn(),
  };
}

/**
 * Create mock Express response
 */
export function createMockResponse() {
  const res = {
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
    send: vi.fn().mockReturnThis(),
    setHeader: vi.fn().mockReturnThis(),
    writeHead: vi.fn().mockReturnThis(),
    write: vi.fn().mockReturnThis(),
    end: vi.fn().mockReturnThis(),
    on: vi.fn(),
  };
  return res;
}

/**
 * Wait for a specified duration (useful for async tests)
 */
export function waitFor(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Create a test compression policy
 */
export function createTestCompressionPolicy(
  overrides?: Partial<CompressionPolicy>
): CompressionPolicy {
  return {
    enabled: true,
    tokenThreshold: 1000,
    maxOutputTokens: 500,
    goalAware: true,
    ...overrides,
  };
}

/**
 * Create a test masking policy
 */
export function createTestMaskingPolicy(
  overrides?: Partial<MaskingPolicy>
): MaskingPolicy {
  return {
    enabled: true,
    piiTypes: ["email", "ssn", "phone"],
    llmFallback: false,
    llmFallbackThreshold: "low",
    ...overrides,
  };
}
