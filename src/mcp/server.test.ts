import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { DownstreamServer } from "./server.js";
import type { Aggregator } from "./aggregator.js";
import type { Router } from "./router.js";
import type { Compressor } from "../compression/compressor.js";
import type { MemoryCache } from "../cache/memory.js";
import type { ToolConfigResolver } from "../config/tool-resolver.js";
import type {
  CallToolResult,
  ReadResourceResult,
  GetPromptResult,
  Tool,
  Resource,
  Prompt,
} from "@modelcontextprotocol/sdk/types.js";
import { Masker } from "../masking/masker.js";

// Mock the MCP SDK Server
let lastMockServer: any = null;
let lastMockTransport: any = null;

vi.mock("@modelcontextprotocol/sdk/server/index.js", () => {
  return {
    Server: class {
      setRequestHandler = vi.fn();
      connect = vi.fn().mockResolvedValue(undefined);
      close = vi.fn().mockResolvedValue(undefined);

      constructor() {
        lastMockServer = this;
      }
    },
  };
});

// Mock transports
vi.mock("@modelcontextprotocol/sdk/server/stdio.js", () => ({
  StdioServerTransport: class {},
}));

vi.mock("@modelcontextprotocol/sdk/server/streamableHttp.js", () => ({
  StreamableHTTPServerTransport: class {
    handleRequest = vi.fn().mockResolvedValue(undefined);
    close = vi.fn();
    constructor(public options: any) {
      lastMockTransport = this;
    }
  },
}));

vi.mock("@modelcontextprotocol/sdk/server/sse.js", () => ({
  SSEServerTransport: class {
    close = vi.fn();
    constructor(public path: string, public res: any) {
      lastMockTransport = this;
    }
  },
}));

// Mock Masker static method
vi.spyOn(Masker, "restoreOriginals").mockImplementation((text, map) => {
  let result = text;
  for (const [placeholder, original] of map.entries()) {
    result = result.replace(new RegExp(placeholder, "g"), original);
  }
  return result;
});

describe("DownstreamServer", () => {
  let mockAggregator: Partial<Aggregator>;
  let mockRouter: Partial<Router>;
  let mockCompressor: Partial<Compressor>;
  let mockCache: Partial<MemoryCache<CallToolResult>>;
  let mockResolver: Partial<ToolConfigResolver>;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();

    // Mock aggregator
    mockAggregator = {
      listTools: vi.fn().mockResolvedValue([]),
      listResources: vi.fn().mockResolvedValue([]),
      listPrompts: vi.fn().mockResolvedValue([]),
    };

    // Mock router
    mockRouter = {
      callTool: vi.fn(),
      readResource: vi.fn(),
      getPrompt: vi.fn(),
    };

    // Mock compressor
    mockCompressor = {
      compressToolResult: vi.fn().mockImplementation((result) =>
        Promise.resolve(result)
      ),
      compressResourceResult: vi.fn().mockImplementation((result) =>
        Promise.resolve(result)
      ),
    };

    // Mock cache
    mockCache = {
      get: vi.fn().mockReturnValue(undefined),
      set: vi.fn(),
    };

    // Mock resolver
    mockResolver = {
      getToolConfig: vi.fn().mockReturnValue({}),
      getRetryEscalation: vi.fn().mockReturnValue(undefined),
      resolveCachePolicy: vi.fn().mockReturnValue({ enabled: true, ttlSeconds: 60 }),
    };
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe("constructor and lifecycle", () => {
    it("should create server with capabilities", () => {
      new DownstreamServer({
        config: { transport: "stdio" },
        aggregator: mockAggregator as Aggregator,
        router: mockRouter as Router,
        compressor: mockCompressor as Compressor,
      });

      expect(lastMockServer).toBeDefined();
      expect(lastMockServer.setRequestHandler).toHaveBeenCalledTimes(6);
    });

    it("should start retry cleanup interval", () => {
      new DownstreamServer({
        config: { transport: "stdio" },
        aggregator: mockAggregator as Aggregator,
        router: mockRouter as Router,
        compressor: mockCompressor as Compressor,
        resolver: mockResolver as ToolConfigResolver,
      });

      expect(mockResolver.getRetryEscalation).not.toHaveBeenCalled();

      // Advance 60 seconds
      vi.advanceTimersByTime(60_000);

      expect(mockResolver.getRetryEscalation).toHaveBeenCalled();
    });

    it("should register all request handlers", () => {
      new DownstreamServer({
        config: { transport: "stdio" },
        aggregator: mockAggregator as Aggregator,
        router: mockRouter as Router,
        compressor: mockCompressor as Compressor,
      });

      // Verify all 6 handlers were registered
      expect(lastMockServer.setRequestHandler).toHaveBeenCalledTimes(6);
    });
  });

  describe("start", () => {
    it("should start stdio transport", async () => {
      const server = new DownstreamServer({
        config: { transport: "stdio" },
        aggregator: mockAggregator as Aggregator,
        router: mockRouter as Router,
        compressor: mockCompressor as Compressor,
      });

      await server.start();

      expect(lastMockServer.connect).toHaveBeenCalledTimes(1);
      expect(lastMockServer.connect).toHaveBeenCalledWith(expect.any(Object));
    });

    it("should handle http transport without connecting", async () => {
      const server = new DownstreamServer({
        config: { transport: "streamable-http", port: 3000 },
        aggregator: mockAggregator as Aggregator,
        router: mockRouter as Router,
        compressor: mockCompressor as Compressor,
      });

      await server.start();

      // Should not connect for HTTP transports
      expect(lastMockServer.connect).not.toHaveBeenCalled();
    });

    it("should handle sse transport without connecting", async () => {
      const server = new DownstreamServer({
        config: { transport: "sse", port: 3000 },
        aggregator: mockAggregator as Aggregator,
        router: mockRouter as Router,
        compressor: mockCompressor as Compressor,
      });

      await server.start();

      expect(lastMockServer.connect).not.toHaveBeenCalled();
    });
  });

  describe("stop", () => {
    it("should clear retry cleanup interval and close server", async () => {
      const server = new DownstreamServer({
        config: { transport: "stdio" },
        aggregator: mockAggregator as Aggregator,
        router: mockRouter as Router,
        compressor: mockCompressor as Compressor,
      });

      await server.stop();

      expect(lastMockServer.close).toHaveBeenCalledTimes(1);
    });

    it("should not throw if interval already cleared", async () => {
      const server = new DownstreamServer({
        config: { transport: "stdio" },
        aggregator: mockAggregator as Aggregator,
        router: mockRouter as Router,
        compressor: mockCompressor as Compressor,
      });

      await server.stop();
      await server.stop(); // Second call should not throw

      expect(lastMockServer.close).toHaveBeenCalledTimes(2);
    });
  });

  describe("setter methods", () => {
    it("should update compressor", () => {
      const server = new DownstreamServer({
        config: { transport: "stdio" },
        aggregator: mockAggregator as Aggregator,
        router: mockRouter as Router,
        compressor: mockCompressor as Compressor,
      });

      const newCompressor = {} as Compressor;
      server.setCompressor(newCompressor);

      // Can't directly verify, but should not throw
      expect(true).toBe(true);
    });

    it("should update cache config", () => {
      const server = new DownstreamServer({
        config: { transport: "stdio" },
        aggregator: mockAggregator as Aggregator,
        router: mockRouter as Router,
        compressor: mockCompressor as Compressor,
      });

      server.setCacheConfig({ maxEntries: 200 });

      expect(true).toBe(true);
    });

    it("should update resolver", () => {
      const server = new DownstreamServer({
        config: { transport: "stdio" },
        aggregator: mockAggregator as Aggregator,
        router: mockRouter as Router,
        compressor: mockCompressor as Compressor,
      });

      const newResolver = {} as ToolConfigResolver;
      server.setResolver(newResolver);

      expect(true).toBe(true);
    });
  });

  describe("createHttpHandler", () => {
    it("should create handler for streamable-http transport", async () => {
      const server = new DownstreamServer({
        config: { transport: "streamable-http", port: 3000 },
        aggregator: mockAggregator as Aggregator,
        router: mockRouter as Router,
        compressor: mockCompressor as Compressor,
      });

      const handler = server.createHttpHandler();

      const mockReq = {
        body: {},
        on: vi.fn(),
      } as any;

      const mockRes = {
        on: vi.fn(),
        status: vi.fn().mockReturnThis(),
        json: vi.fn(),
        headersSent: false,
      } as any;

      await handler(mockReq, mockRes);

      expect(mockRes.on).toHaveBeenCalledWith("close", expect.any(Function));
      expect(lastMockServer.connect).toHaveBeenCalled();
    });

    it("should create handler for sse transport", async () => {
      const server = new DownstreamServer({
        config: { transport: "sse", port: 3000 },
        aggregator: mockAggregator as Aggregator,
        router: mockRouter as Router,
        compressor: mockCompressor as Compressor,
      });

      const handler = server.createHttpHandler();

      const mockReq = {
        body: {},
        on: vi.fn(),
      } as any;

      const mockRes = {
        on: vi.fn(),
        status: vi.fn().mockReturnThis(),
        json: vi.fn(),
        headersSent: false,
      } as any;

      await handler(mockReq, mockRes);

      expect(mockRes.on).toHaveBeenCalledWith("close", expect.any(Function));
      expect(lastMockServer.connect).toHaveBeenCalled();
    });

    it("should return 400 for invalid transport", async () => {
      const server = new DownstreamServer({
        config: { transport: "stdio" }, // Invalid for HTTP handler
        aggregator: mockAggregator as Aggregator,
        router: mockRouter as Router,
        compressor: mockCompressor as Compressor,
      });

      const handler = server.createHttpHandler();

      const mockReq = {} as any;
      const mockRes = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn(),
      } as any;

      await handler(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith({
        error: "Invalid transport for HTTP",
      });
    });

    it("should handle errors during request processing", async () => {
      const server = new DownstreamServer({
        config: { transport: "streamable-http", port: 3000 },
        aggregator: mockAggregator as Aggregator,
        router: mockRouter as Router,
        compressor: mockCompressor as Compressor,
      });

      vi.mocked(lastMockServer.connect).mockRejectedValueOnce(
        new Error("Connection failed")
      );

      const handler = server.createHttpHandler();

      const mockReq = {
        body: {},
        on: vi.fn(),
      } as any;

      const mockRes = {
        on: vi.fn(),
        status: vi.fn().mockReturnThis(),
        json: vi.fn(),
        headersSent: false,
      } as any;

      await handler(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(500);
      expect(mockRes.json).toHaveBeenCalledWith({
        error: "Internal server error",
      });
    });

    it("should not send error response if headers already sent", async () => {
      const server = new DownstreamServer({
        config: { transport: "streamable-http", port: 3000 },
        aggregator: mockAggregator as Aggregator,
        router: mockRouter as Router,
        compressor: mockCompressor as Compressor,
      });

      vi.mocked(lastMockServer.connect).mockRejectedValueOnce(
        new Error("Connection failed")
      );

      const handler = server.createHttpHandler();

      const mockReq = {
        body: {},
        on: vi.fn(),
      } as any;

      const mockRes = {
        on: vi.fn(),
        status: vi.fn().mockReturnThis(),
        json: vi.fn(),
        headersSent: true, // Already sent
      } as any;

      await handler(mockReq, mockRes);

      expect(mockRes.status).not.toHaveBeenCalled();
      expect(mockRes.json).not.toHaveBeenCalled();
    });

    it("should close transport when response closes", async () => {
      const server = new DownstreamServer({
        config: { transport: "streamable-http", port: 3000 },
        aggregator: mockAggregator as Aggregator,
        router: mockRouter as Router,
        compressor: mockCompressor as Compressor,
      });

      const handler = server.createHttpHandler();

      let closeCallback: (() => void) | undefined;
      const mockReq = {
        body: {},
        on: vi.fn(),
      } as any;

      const mockRes = {
        on: vi.fn((event: string, callback: () => void) => {
          if (event === "close") {
            closeCallback = callback;
          }
        }),
        status: vi.fn().mockReturnThis(),
        json: vi.fn(),
        headersSent: false,
      } as any;

      await handler(mockReq, mockRes);

      expect(closeCallback).toBeDefined();
      expect(lastMockTransport.close).not.toHaveBeenCalled();

      // Trigger the close event
      closeCallback!();

      expect(lastMockTransport.close).toHaveBeenCalled();
    });
  });

  describe("request handlers - tools/list", () => {
    it("should delegate to aggregator", async () => {
      const tools: Tool[] = [
        {
          name: "server1__test-tool",
          description: "Test tool",
          inputSchema: { type: "object", properties: {} },
        },
      ];

      vi.mocked(mockAggregator.listTools!).mockResolvedValue(tools);

      new DownstreamServer({
        config: { transport: "stdio" },
        aggregator: mockAggregator as Aggregator,
        router: mockRouter as Router,
        compressor: mockCompressor as Compressor,
      });

      // Get the tools/list handler (first registered handler, index 0)
      const handler = vi.mocked(lastMockServer.setRequestHandler).mock.calls[0][1];
      const result = await handler({} as any);

      expect(result).toEqual({ tools });
      expect(mockAggregator.listTools).toHaveBeenCalled();
    });
  });

  describe("request handlers - tools/call", () => {
    let server: DownstreamServer;
    let callHandler: any;

    beforeEach(() => {
      server = new DownstreamServer({
        config: { transport: "stdio" },
        aggregator: mockAggregator as Aggregator,
        router: mockRouter as Router,
        compressor: mockCompressor as Compressor,
        cache: mockCache as MemoryCache<CallToolResult>,
        cacheConfig: { maxEntries: 100 },
        resolver: mockResolver as ToolConfigResolver,
      });

      // Get the tools/call handler (second registered handler, index 1)
      callHandler = vi.mocked(lastMockServer.setRequestHandler).mock.calls[1][1];
    });

    it("should call router and compress result", async () => {
      const toolResult: CallToolResult = {
        content: [{ type: "text", text: "Original response" }],
      };

      const compressedResult: CallToolResult = {
        content: [{ type: "text", text: "Compressed response" }],
      };

      vi.mocked(mockRouter.callTool!).mockResolvedValue({
        result: toolResult,
        bypass: false,
      });

      vi.mocked(mockCompressor.compressToolResult!).mockResolvedValue(
        compressedResult
      );

      const result = await callHandler({
        params: {
          name: "server1__test-tool",
          arguments: { arg1: "value1" },
        },
      });

      expect(mockRouter.callTool).toHaveBeenCalledWith("server1__test-tool", {
        arg1: "value1",
      });

      expect(mockCompressor.compressToolResult).toHaveBeenCalledWith(
        toolResult,
        "server1__test-tool",
        undefined,
        undefined
      );

      expect(result).toEqual(compressedResult);
    });

    it("should extract goal from arguments", async () => {
      const toolResult: CallToolResult = {
        content: [{ type: "text", text: "Response" }],
      };

      vi.mocked(mockRouter.callTool!).mockResolvedValue({
        result: toolResult,
        goal: "Find specific data",
        bypass: false,
      });

      await callHandler({
        params: {
          name: "server1__test-tool",
          arguments: { arg1: "value1", _mcpcp_goal: "Find specific data" },
        },
      });

      expect(mockCompressor.compressToolResult).toHaveBeenCalledWith(
        toolResult,
        "server1__test-tool",
        "Find specific data",
        undefined
      );
    });

    it("should skip compression when bypass is true", async () => {
      const toolResult: CallToolResult = {
        content: [{ type: "text", text: "Original response" }],
      };

      vi.mocked(mockRouter.callTool!).mockResolvedValue({
        result: toolResult,
        bypass: true,
      });

      const result = await callHandler({
        params: {
          name: "server1__test-tool",
          arguments: { _mcpcp_bypass: true },
        },
      });

      expect(mockCompressor.compressToolResult).not.toHaveBeenCalled();
      expect(result).toEqual(toolResult);
    });

    it("should use cache when available", async () => {
      const cachedResult: CallToolResult = {
        content: [{ type: "text", text: "Cached response" }],
      };

      vi.mocked(mockCache.get!).mockReturnValue(cachedResult);

      const result = await callHandler({
        params: {
          name: "server1__test-tool",
          arguments: { arg1: "value1" },
        },
      });

      expect(result).toEqual(cachedResult);
      expect(mockRouter.callTool).not.toHaveBeenCalled();
      expect(mockCompressor.compressToolResult).not.toHaveBeenCalled();
    });

    it("should cache compressed result", async () => {
      const toolResult: CallToolResult = {
        content: [{ type: "text", text: "Original" }],
      };

      const compressedResult: CallToolResult = {
        content: [{ type: "text", text: "Compressed" }],
      };

      vi.mocked(mockRouter.callTool!).mockResolvedValue({
        result: toolResult,
        bypass: false,
      });

      vi.mocked(mockCompressor.compressToolResult!).mockResolvedValue(
        compressedResult
      );

      await callHandler({
        params: {
          name: "server1__test-tool",
          arguments: { arg1: "value1" },
        },
      });

      expect(mockCache.set).toHaveBeenCalledWith(
        expect.any(String),
        compressedResult,
        60 // Default TTL from mock resolver
      );
    });

    it("should respect per-tool cache TTL", async () => {
      vi.mocked(mockResolver.resolveCachePolicy!).mockReturnValue({
        enabled: true,
        ttlSeconds: 120,
      });

      const toolResult: CallToolResult = {
        content: [{ type: "text", text: "Response" }],
      };

      vi.mocked(mockRouter.callTool!).mockResolvedValue({
        result: toolResult,
        bypass: false,
      });

      await callHandler({
        params: {
          name: "server1__test-tool",
          arguments: {},
        },
      });

      expect(mockCache.set).toHaveBeenCalledWith(
        expect.any(String),
        toolResult,
        120
      );
    });

    it("should skip caching when cache is disabled", async () => {
      vi.mocked(mockResolver.resolveCachePolicy!).mockReturnValue({
        enabled: false,
        ttlSeconds: 0,
      });

      const toolResult: CallToolResult = {
        content: [{ type: "text", text: "Response" }],
      };

      vi.mocked(mockRouter.callTool!).mockResolvedValue({
        result: toolResult,
        bypass: false,
      });

      await callHandler({
        params: {
          name: "server1__test-tool",
          arguments: {},
        },
      });

      expect(mockCache.get).not.toHaveBeenCalled();
      expect(mockCache.set).not.toHaveBeenCalled();
    });

    it("should not cache errors when cacheErrors is false", async () => {
      server.setCacheConfig({
        maxEntries: 100,
        cacheErrors: false,
      });

      const errorResult: CallToolResult = {
        content: [{ type: "text", text: "Error occurred" }],
        isError: true,
      };

      vi.mocked(mockRouter.callTool!).mockResolvedValue({
        result: errorResult,
        bypass: false,
      });

      await callHandler({
        params: {
          name: "server1__test-tool",
          arguments: {},
        },
      });

      expect(mockCache.set).not.toHaveBeenCalled();
    });

    it("should cache errors when cacheErrors is true", async () => {
      server.setCacheConfig({
        maxEntries: 100,
        cacheErrors: true,
      });

      const errorResult: CallToolResult = {
        content: [{ type: "text", text: "Error occurred" }],
        isError: true,
      };

      vi.mocked(mockRouter.callTool!).mockResolvedValue({
        result: errorResult,
        bypass: false,
      });

      await callHandler({
        params: {
          name: "server1__test-tool",
          arguments: {},
        },
      });

      expect(mockCache.set).toHaveBeenCalled();
    });

    it("should apply retry escalation when enabled", async () => {
      vi.mocked(mockResolver.getRetryEscalation!).mockReturnValue({
        enabled: true,
        windowSeconds: 300,
        tokenMultiplier: 1.5,
      });

      const toolResult: CallToolResult = {
        content: [{ type: "text", text: "Response" }],
      };

      vi.mocked(mockRouter.callTool!).mockResolvedValue({
        result: toolResult,
        bypass: false,
      });

      await callHandler({
        params: {
          name: "server1__test-tool",
          arguments: {},
        },
      });

      // First call - verify escalation multiplier was passed (base multiplier = 1.0)
      expect(mockCompressor.compressToolResult).toHaveBeenCalledWith(
        toolResult,
        "server1__test-tool",
        undefined,
        expect.any(Number) // Escalation multiplier is calculated
      );

      // Second call
      await callHandler({
        params: {
          name: "server1__test-tool",
          arguments: {},
        },
      });

      // Verify escalation multiplier was passed for second call
      expect(mockCompressor.compressToolResult).toHaveBeenCalledTimes(2);
      expect(mockCompressor.compressToolResult).toHaveBeenLastCalledWith(
        toolResult,
        "server1__test-tool",
        undefined,
        expect.any(Number) // Escalation continues
      );
    });

    it("should restore PII values before returning", async () => {
      const restorationMap = new Map([
        ["EMAIL_1", "user@example.com"],
        ["SSN_1", "123-45-6789"],
      ]);

      const toolResult: CallToolResult = {
        content: [
          { type: "text", text: "User EMAIL_1 has SSN SSN_1" },
          { type: "text", text: "Contact: EMAIL_1" },
        ],
      };

      vi.mocked(mockRouter.callTool!).mockResolvedValue({
        result: toolResult,
        bypass: false,
        restorationMap,
      });

      await callHandler({
        params: {
          name: "server1__test-tool",
          arguments: {},
        },
      });

      expect(Masker.restoreOriginals).toHaveBeenCalledTimes(2);
      expect(Masker.restoreOriginals).toHaveBeenCalledWith(
        "User EMAIL_1 has SSN SSN_1",
        restorationMap
      );
      expect(Masker.restoreOriginals).toHaveBeenCalledWith(
        "Contact: EMAIL_1",
        restorationMap
      );
    });

    it("should skip PII restoration when no restoration map", async () => {
      const toolResult: CallToolResult = {
        content: [{ type: "text", text: "Normal response" }],
      };

      vi.mocked(mockRouter.callTool!).mockResolvedValue({
        result: toolResult,
        bypass: false,
      });

      await callHandler({
        params: {
          name: "server1__test-tool",
          arguments: {},
        },
      });

      expect(Masker.restoreOriginals).not.toHaveBeenCalled();
    });

    it("should handle empty arguments", async () => {
      const toolResult: CallToolResult = {
        content: [{ type: "text", text: "Response" }],
      };

      vi.mocked(mockRouter.callTool!).mockResolvedValue({
        result: toolResult,
        bypass: false,
      });

      await callHandler({
        params: {
          name: "server1__test-tool",
        },
      });

      expect(mockRouter.callTool).toHaveBeenCalledWith("server1__test-tool", {});
    });
  });

  describe("request handlers - resources/list", () => {
    it("should delegate to aggregator", async () => {
      const resources: Resource[] = [
        {
          uri: "server1://file:///test.txt",
          name: "Test File",
        },
      ];

      vi.mocked(mockAggregator.listResources!).mockResolvedValue(resources);

      new DownstreamServer({
        config: { transport: "stdio" },
        aggregator: mockAggregator as Aggregator,
        router: mockRouter as Router,
        compressor: mockCompressor as Compressor,
      });

      // Get the resources/list handler (third registered handler, index 2)
      const handler = vi.mocked(lastMockServer.setRequestHandler).mock.calls[2][1];
      const result = await handler({} as any);

      expect(result).toEqual({ resources });
      expect(mockAggregator.listResources).toHaveBeenCalled();
    });
  });

  describe("request handlers - resources/read", () => {
    it("should route to router and compress result", async () => {
      const resourceResult: ReadResourceResult = {
        contents: [
          {
            uri: "file:///test.txt",
            text: "File contents here",
          },
        ],
      };

      const compressedResult: ReadResourceResult = {
        contents: [
          {
            uri: "file:///test.txt",
            text: "Compressed contents",
          },
        ],
      };

      vi.mocked(mockRouter.readResource!).mockResolvedValue(resourceResult);
      vi.mocked(mockCompressor.compressResourceResult!).mockResolvedValue(
        compressedResult
      );

      new DownstreamServer({
        config: { transport: "stdio" },
        aggregator: mockAggregator as Aggregator,
        router: mockRouter as Router,
        compressor: mockCompressor as Compressor,
      });

      // Get the resources/read handler (fourth registered handler, index 3)
      const handler = vi.mocked(lastMockServer.setRequestHandler).mock.calls[3][1];
      const result = await handler({
        params: { uri: "server1://file:///test.txt" },
      } as any);

      expect(mockRouter.readResource).toHaveBeenCalledWith(
        "server1://file:///test.txt"
      );
      expect(mockCompressor.compressResourceResult).toHaveBeenCalledWith(
        resourceResult,
        "server1://file:///test.txt"
      );
      expect(result).toEqual(compressedResult);
    });
  });

  describe("request handlers - prompts/list", () => {
    it("should delegate to aggregator", async () => {
      const prompts: Prompt[] = [
        {
          name: "server1__test-prompt",
          description: "Test prompt",
        },
      ];

      vi.mocked(mockAggregator.listPrompts!).mockResolvedValue(prompts);

      new DownstreamServer({
        config: { transport: "stdio" },
        aggregator: mockAggregator as Aggregator,
        router: mockRouter as Router,
        compressor: mockCompressor as Compressor,
      });

      // Get the prompts/list handler (fifth registered handler, index 4)
      const handler = vi.mocked(lastMockServer.setRequestHandler).mock.calls[4][1];
      const result = await handler({} as any);

      expect(result).toEqual({ prompts });
      expect(mockAggregator.listPrompts).toHaveBeenCalled();
    });
  });

  describe("request handlers - prompts/get", () => {
    it("should route to router", async () => {
      const promptResult: GetPromptResult = {
        description: "Test prompt",
        messages: [
          {
            role: "user",
            content: { type: "text", text: "Hello" },
          },
        ],
      };

      vi.mocked(mockRouter.getPrompt!).mockResolvedValue(promptResult);

      new DownstreamServer({
        config: { transport: "stdio" },
        aggregator: mockAggregator as Aggregator,
        router: mockRouter as Router,
        compressor: mockCompressor as Compressor,
      });

      // Get the prompts/get handler (sixth registered handler, index 5)
      const handler = vi.mocked(lastMockServer.setRequestHandler).mock.calls[5][1];
      const result = await handler({
        params: {
          name: "server1__test-prompt",
          arguments: { name: "User" },
        },
      } as any);

      expect(mockRouter.getPrompt).toHaveBeenCalledWith("server1__test-prompt", {
        name: "User",
      });
      expect(result).toEqual(promptResult);
    });

    it("should handle prompts without arguments", async () => {
      const promptResult: GetPromptResult = {
        description: "Simple prompt",
        messages: [
          {
            role: "user",
            content: { type: "text", text: "Static message" },
          },
        ],
      };

      vi.mocked(mockRouter.getPrompt!).mockResolvedValue(promptResult);

      new DownstreamServer({
        config: { transport: "stdio" },
        aggregator: mockAggregator as Aggregator,
        router: mockRouter as Router,
        compressor: mockCompressor as Compressor,
      });

      // Get the prompts/get handler (sixth registered handler, index 5)
      const handler = vi.mocked(lastMockServer.setRequestHandler).mock.calls[5][1];
      const result = await handler({
        params: {
          name: "server1__simple-prompt",
        },
      } as any);

      expect(mockRouter.getPrompt).toHaveBeenCalledWith(
        "server1__simple-prompt",
        undefined
      );
      expect(result).toEqual(promptResult);
    });
  });
});
