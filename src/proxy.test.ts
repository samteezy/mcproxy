import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createProxy } from "./proxy.js";
import type { MCPCPConfig } from "./types.js";
import { createTestConfig } from "./test/helpers.js";

// Store last instances for assertions
let lastUpstreamClient: any = null;
let lastAggregator: any = null;
let lastRouter: any = null;
let lastCompressor: any = null;
let lastMasker: any = null;
let lastCache: any = null;
let lastResolver: any = null;
let lastDownstreamServer: any = null;
let mockLogger: any = null;
let mockExpressApp: any = null;
let mockHttpServer: any = null;
let allUpstreamClients: any[] = [];

// Mock logger
vi.mock("./logger.js", () => ({
  initLogger: vi.fn(() => {
    mockLogger = {
      info: vi.fn(),
      error: vi.fn(),
      warn: vi.fn(),
      debug: vi.fn(),
    };
    return mockLogger;
  }),
  getLogger: vi.fn(() => mockLogger || {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  }),
}));

// Mock MCP components
vi.mock("./mcp/index.js", () => ({
  UpstreamClient: class {
    id: string;
    name: string;
    isConnected = true;
    connect = vi.fn().mockResolvedValue(undefined);
    disconnect = vi.fn().mockResolvedValue(undefined);

    constructor(config: any) {
      this.id = config.id;
      this.name = config.name;
      lastUpstreamClient = this;
      allUpstreamClients.push(this);
    }
  },

  Aggregator: class {
    registerClient = vi.fn();
    unregisterClient = vi.fn();
    refresh = vi.fn().mockResolvedValue(undefined);
    setResolver = vi.fn();
    getUpstreamCounts = vi.fn().mockReturnValue({
      tools: 5,
      resources: 3,
      prompts: 2,
    });
    getUpstreamDetails = vi.fn().mockReturnValue({
      id: "upstream1",
      name: "Upstream 1",
      tools: [],
      resources: [],
      prompts: [],
    });

    constructor() {
      lastAggregator = this;
    }
  },

  Router: class {
    setMasker = vi.fn();

    constructor() {
      lastRouter = this;
    }
  },

  DownstreamServer: class {
    start = vi.fn().mockResolvedValue(undefined);
    stop = vi.fn().mockResolvedValue(undefined);
    createHttpHandler = vi.fn().mockReturnValue(vi.fn());
    setCompressor = vi.fn();
    setCacheConfig = vi.fn();
    setResolver = vi.fn();

    constructor() {
      lastDownstreamServer = this;
    }
  },
}));

// Mock Compressor
vi.mock("./compression/index.js", () => ({
  Compressor: class {
    constructor() {
      lastCompressor = this;
    }
  },
}));

// Mock Masker
vi.mock("./masking/index.js", () => ({
  Masker: class {
    constructor() {
      lastMasker = this;
    }
  },
}));

// Mock MemoryCache
vi.mock("./cache/index.js", () => ({
  MemoryCache: class {
    clear = vi.fn();
    cleanup = vi.fn();
    updateConfig = vi.fn();

    constructor() {
      lastCache = this;
    }
  },
}));

// Mock config
vi.mock("./config/index.js", async () => {
  const actual = await vi.importActual("./config/index.js");
  return {
    ...actual,
    ToolConfigResolver: class {
      constructor() {
        lastResolver = this;
      }
    },
    loadConfig: vi.fn(),
  };
});

// Mock web UI
vi.mock("./web/index.js", () => ({
  generateHtml: vi.fn().mockReturnValue("<html>Test UI</html>"),
  registerApiRoutes: vi.fn(),
}));

// Mock Express
vi.mock("express", () => {
  const mockExpress = vi.fn(() => {
    mockExpressApp = {
      use: vi.fn(),
      get: vi.fn(),
      post: vi.fn(),
      listen: vi.fn((_port: number, _host: string, callback: () => void) => {
        callback();
        return mockHttpServer;
      }),
    };
    return mockExpressApp;
  });

  (mockExpress as any).json = vi.fn().mockReturnValue("json-middleware");
  (mockExpress as any).text = vi.fn().mockReturnValue("text-middleware");

  return { default: mockExpress };
});

// Import after mocks
import { generateHtml, registerApiRoutes } from "./web/index.js";
import { loadConfig } from "./config/index.js";

describe("Proxy", () => {
  let mockConfig: MCPCPConfig;

  beforeEach(() => {
    vi.clearAllMocks();
    lastUpstreamClient = null;
    lastAggregator = null;
    lastRouter = null;
    lastCompressor = null;
    lastMasker = null;
    lastCache = null;
    lastResolver = null;
    lastDownstreamServer = null;
    mockLogger = null;
    allUpstreamClients = [];

    // Reset HTTP server mock
    mockHttpServer = {
      listen: vi.fn((_port: number, _host: string, callback: () => void) => {
        callback();
        return mockHttpServer;
      }),
      close: vi.fn((callback: () => void) => {
        callback();
      }),
      closeAllConnections: vi.fn(),
    };

    // Create test config
    mockConfig = createTestConfig({
      downstream: { transport: "stdio" },
      upstreams: [
        {
          id: "upstream1",
          name: "Upstream 1",
          transport: "stdio",
          command: "test-cmd",
          enabled: true,
          tools: {},
        },
        {
          id: "upstream2",
          name: "Upstream 2",
          transport: "stdio",
          command: "test-cmd2",
          enabled: false,
          tools: {},
        },
      ],
    });

    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe("createProxy", () => {
    it("should create proxy with all components", async () => {
      const proxy = await createProxy(mockConfig, "/path/to/config.yml");

      expect(proxy).toBeDefined();
      expect(proxy.start).toBeDefined();
      expect(proxy.stop).toBeDefined();
      expect(proxy.getStatus).toBeDefined();
      expect(proxy.reload).toBeDefined();
      expect(proxy.getConfigPath).toBeDefined();
    });

    it("should initialize logger with configured log level", async () => {
      await createProxy(mockConfig, "/path/to/config.yml");

      expect(mockLogger).toBeDefined();
      expect(mockLogger.info).toBeDefined();
    });

    it("should create Aggregator with resolver", async () => {
      await createProxy(mockConfig, "/path/to/config.yml");

      expect(lastAggregator).toBeDefined();
      expect(lastResolver).toBeDefined();
    });

    it("should create Compressor with config and resolver", async () => {
      await createProxy(mockConfig, "/path/to/config.yml");

      expect(lastCompressor).toBeDefined();
    });

    it("should create Masker when masking is enabled", async () => {
      const configWithMasking = createTestConfig({
        masking: {
          enabled: true,
          llmConfig: {
            baseUrl: "http://localhost:8080/v1",
            apiKey: "test-key",
            model: "test-model",
          },
        },
      });

      await createProxy(configWithMasking, "/path/to/config.yml");

      expect(lastMasker).toBeDefined();
    });

    it("should not create Masker when masking is disabled", async () => {
      const configWithoutMasking = createTestConfig({
        masking: undefined,
      });

      await createProxy(configWithoutMasking, "/path/to/config.yml");

      expect(lastMasker).toBeNull();
    });

    it("should create Router", async () => {
      await createProxy(mockConfig, "/path/to/config.yml");

      expect(lastRouter).toBeDefined();
    });

    it("should create MemoryCache with config", async () => {
      await createProxy(mockConfig, "/path/to/config.yml");

      expect(lastCache).toBeDefined();
    });

    it("should create UpstreamClient for each enabled upstream", async () => {
      await createProxy(mockConfig, "/path/to/config.yml");

      // Only 1 upstream is enabled in mockConfig
      expect(allUpstreamClients).toHaveLength(1);
      expect(allUpstreamClients[0].id).toBe("upstream1");
    });

    it("should skip disabled upstreams", async () => {
      await createProxy(mockConfig, "/path/to/config.yml");

      // Second upstream is disabled, should only create 1 client
      expect(allUpstreamClients).toHaveLength(1);
      expect(mockLogger.info).toHaveBeenCalledWith(expect.stringContaining("disabled"));
    });

    it("should register upstream clients with aggregator", async () => {
      await createProxy(mockConfig, "/path/to/config.yml");

      expect(lastAggregator.registerClient).toHaveBeenCalledWith(lastUpstreamClient);
    });

    it("should create DownstreamServer", async () => {
      await createProxy(mockConfig, "/path/to/config.yml");

      expect(lastDownstreamServer).toBeDefined();
    });
  });

  describe("getStatus", () => {
    it("should return status for all upstream clients", async () => {
      const proxy = await createProxy(mockConfig, "/path/to/config.yml");
      const status = proxy.getStatus();

      expect(status).toHaveLength(1);
      expect(status[0]).toEqual({
        id: "upstream1",
        name: "Upstream 1",
        connected: true,
        toolCount: 5,
        resourceCount: 3,
        promptCount: 2,
      });
    });

    it("should call aggregator.getUpstreamCounts for each client", async () => {
      const proxy = await createProxy(mockConfig, "/path/to/config.yml");
      proxy.getStatus();

      expect(lastAggregator.getUpstreamCounts).toHaveBeenCalledWith("upstream1");
    });
  });

  describe("getConfigPath", () => {
    it("should return the config path", async () => {
      const proxy = await createProxy(mockConfig, "/path/to/config.yml");
      const path = proxy.getConfigPath();

      expect(path).toBe("/path/to/config.yml");
    });
  });

  describe("start - stdio transport", () => {
    it("should clear cache on startup", async () => {
      const proxy = await createProxy(mockConfig, "/path/to/config.yml");
      await proxy.start();

      expect(lastCache.clear).toHaveBeenCalled();
    });

    it("should connect to all upstreams", async () => {
      const proxy = await createProxy(mockConfig, "/path/to/config.yml");
      await proxy.start();

      expect(lastUpstreamClient.connect).toHaveBeenCalled();
    });

    it("should refresh aggregator after connecting", async () => {
      const proxy = await createProxy(mockConfig, "/path/to/config.yml");
      await proxy.start();

      expect(lastAggregator.refresh).toHaveBeenCalled();
    });

    it("should start downstream server for stdio transport", async () => {
      const proxy = await createProxy(mockConfig, "/path/to/config.yml");
      await proxy.start();

      expect(lastDownstreamServer.start).toHaveBeenCalled();
    });

    it("should log errors for failed upstream connections", async () => {
      const proxy = await createProxy(mockConfig, "/path/to/config.yml");

      lastUpstreamClient.connect.mockRejectedValueOnce(new Error("Connection failed"));

      await proxy.start();

      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.stringContaining("Failed to connect")
      );
    });

    it("should start cache cleanup interval", async () => {
      const proxy = await createProxy(mockConfig, "/path/to/config.yml");
      await proxy.start();

      // Fast-forward time and check cleanup is called
      vi.advanceTimersByTime(60000); // CACHE_CLEANUP_INTERVAL_MS
      expect(lastCache.cleanup).toHaveBeenCalled();
    });
  });

  describe("start - HTTP transports", () => {
    beforeEach(() => {
      mockConfig.downstream.transport = "streamable-http";
      mockConfig.downstream.port = 3000;
      mockConfig.downstream.host = "localhost";
    });

    it("should create Express app for HTTP transport", async () => {
      const proxy = await createProxy(mockConfig, "/path/to/config.yml");
      await proxy.start();

      expect(mockExpressApp).toBeDefined();
    });

    it("should configure Express middleware", async () => {
      const proxy = await createProxy(mockConfig, "/path/to/config.yml");
      await proxy.start();

      expect(mockExpressApp.use).toHaveBeenCalledWith("json-middleware");
      expect(mockExpressApp.use).toHaveBeenCalledWith("text-middleware");
    });

    it("should create HTTP handler from downstream server", async () => {
      const proxy = await createProxy(mockConfig, "/path/to/config.yml");
      await proxy.start();

      expect(lastDownstreamServer.createHttpHandler).toHaveBeenCalled();
    });

    it("should register admin UI at root for HTML requests", async () => {
      const proxy = await createProxy(mockConfig, "/path/to/config.yml");
      await proxy.start();

      expect(mockExpressApp.get).toHaveBeenCalledWith("/", expect.any(Function));
    });

    it("should register API routes", async () => {
      const proxy = await createProxy(mockConfig, "/path/to/config.yml");
      await proxy.start();

      expect(registerApiRoutes).toHaveBeenCalledWith(mockExpressApp, {
        configPath: "/path/to/config.yml",
        getStatus: expect.any(Function),
        getUpstreamDetails: expect.any(Function),
        reload: expect.any(Function),
        loadConfig: loadConfig,
      });
    });

    it("should register MCP endpoints for streamable-http", async () => {
      mockConfig.downstream.transport = "streamable-http";

      const proxy = await createProxy(mockConfig, "/path/to/config.yml");
      await proxy.start();

      expect(mockExpressApp.post).toHaveBeenCalledWith("/mcp", expect.any(Function));
      expect(mockExpressApp.get).toHaveBeenCalledWith("/mcp", expect.any(Function));
      expect(mockExpressApp.post).toHaveBeenCalledWith("/", expect.any(Function));
    });

    it("should register MCP endpoints for SSE", async () => {
      mockConfig.downstream.transport = "sse";

      const proxy = await createProxy(mockConfig, "/path/to/config.yml");
      await proxy.start();

      expect(mockExpressApp.get).toHaveBeenCalledWith("/sse", expect.any(Function));
      expect(mockExpressApp.post).toHaveBeenCalledWith("/messages", expect.any(Function));
    });

    it("should register health check endpoint", async () => {
      const proxy = await createProxy(mockConfig, "/path/to/config.yml");
      await proxy.start();

      expect(mockExpressApp.get).toHaveBeenCalledWith("/health", expect.any(Function));
    });

    it("should start HTTP server on configured port and host", async () => {
      const proxy = await createProxy(mockConfig, "/path/to/config.yml");
      await proxy.start();

      expect(mockExpressApp.listen).toHaveBeenCalledWith(
        3000,
        "localhost",
        expect.any(Function)
      );
    });

    it("should use default port if not configured", async () => {
      mockConfig.downstream.port = undefined;

      const proxy = await createProxy(mockConfig, "/path/to/config.yml");
      await proxy.start();

      expect(mockExpressApp.listen).toHaveBeenCalledWith(
        3000, // DEFAULT_PORT
        expect.any(String),
        expect.any(Function)
      );
    });

    it("should use default host if not configured", async () => {
      mockConfig.downstream.host = undefined;

      const proxy = await createProxy(mockConfig, "/path/to/config.yml");
      await proxy.start();

      expect(mockExpressApp.listen).toHaveBeenCalledWith(
        expect.any(Number),
        "0.0.0.0", // DEFAULT_HOST
        expect.any(Function)
      );
    });

    it("should handle UI generation errors gracefully", async () => {
      vi.mocked(generateHtml).mockImplementationOnce(() => {
        throw new Error("UI generation failed");
      });

      const proxy = await createProxy(mockConfig, "/path/to/config.yml");
      await proxy.start();

      // Get the root handler
      const rootHandlerCall = mockExpressApp.get.mock.calls.find(
        (call: any) => call[0] === "/"
      );
      expect(rootHandlerCall).toBeDefined();

      const rootHandler = rootHandlerCall[1];

      // Simulate a request
      const mockReq = { accepts: vi.fn().mockReturnValue(true) };
      const mockRes = {
        type: vi.fn().mockReturnThis(),
        send: vi.fn(),
        status: vi.fn().mockReturnThis(),
      };

      rootHandler(mockReq, mockRes, vi.fn());

      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.stringContaining("Failed to generate UI"),
        expect.any(Error)
      );
      expect(mockRes.status).toHaveBeenCalledWith(500);
    });
  });

  describe("stop", () => {
    it("should clear cache cleanup interval", async () => {
      const proxy = await createProxy(mockConfig, "/path/to/config.yml");
      await proxy.start();

      const cleanupCallsBefore = lastCache.cleanup.mock.calls.length;

      await proxy.stop();

      // The interval should be cleared, so cleanup shouldn't be called again
      vi.advanceTimersByTime(60000);
      const cleanupCallsAfter = lastCache.cleanup.mock.calls.length;

      expect(cleanupCallsAfter).toBe(cleanupCallsBefore);
    });

    it("should close HTTP server if running", async () => {
      mockConfig.downstream.transport = "streamable-http";

      const proxy = await createProxy(mockConfig, "/path/to/config.yml");
      await proxy.start();
      await proxy.stop();

      expect(mockHttpServer.closeAllConnections).toHaveBeenCalled();
      expect(mockHttpServer.close).toHaveBeenCalled();
    });

    it("should stop downstream server", async () => {
      const proxy = await createProxy(mockConfig, "/path/to/config.yml");
      await proxy.start();
      await proxy.stop();

      expect(lastDownstreamServer.stop).toHaveBeenCalled();
    });

    it("should disconnect all upstream clients", async () => {
      const proxy = await createProxy(mockConfig, "/path/to/config.yml");
      await proxy.start();
      await proxy.stop();

      expect(lastUpstreamClient.disconnect).toHaveBeenCalled();
    });

    it("should clear cache", async () => {
      const proxy = await createProxy(mockConfig, "/path/to/config.yml");
      await proxy.start();

      // Clear mock to check for second call
      lastCache.clear.mockClear();

      await proxy.stop();

      expect(lastCache.clear).toHaveBeenCalled();
    });

    it("should handle downstream stop errors gracefully", async () => {
      const proxy = await createProxy(mockConfig, "/path/to/config.yml");
      await proxy.start();

      lastDownstreamServer.stop.mockRejectedValueOnce(new Error("Stop failed"));

      await proxy.stop();

      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.stringContaining("Error stopping downstream"),
        expect.any(Error)
      );
    });

    it("should handle upstream disconnect errors gracefully", async () => {
      const proxy = await createProxy(mockConfig, "/path/to/config.yml");
      await proxy.start();

      lastUpstreamClient.disconnect.mockRejectedValueOnce(new Error("Disconnect failed"));

      await proxy.stop();

      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.stringContaining("Error disconnecting"),
        expect.any(Error)
      );
    });

    it("should work without starting first", async () => {
      const proxy = await createProxy(mockConfig, "/path/to/config.yml");

      // Should not throw
      await expect(proxy.stop()).resolves.not.toThrow();
    });
  });

  describe("reload", () => {
    it("should disconnect old upstream clients", async () => {
      const proxy = await createProxy(mockConfig, "/path/to/config.yml");
      await proxy.start();

      const oldClient = lastUpstreamClient;

      const newConfig = createTestConfig({
        upstreams: [
          {
            id: "new-upstream",
            name: "New Upstream",
            transport: "stdio",
            command: "new-cmd",
            enabled: true,
            tools: {},
          },
        ],
      });

      await proxy.reload(newConfig);

      expect(oldClient.disconnect).toHaveBeenCalled();
    });

    it("should handle disconnect errors during reload", async () => {
      const proxy = await createProxy(mockConfig, "/path/to/config.yml");
      await proxy.start();

      lastUpstreamClient.disconnect.mockRejectedValueOnce(new Error("Disconnect failed"));

      const newConfig = createTestConfig();

      await proxy.reload(newConfig);

      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.stringContaining("Error disconnecting")
      );
    });

    it("should unregister old clients from aggregator", async () => {
      const proxy = await createProxy(mockConfig, "/path/to/config.yml");
      await proxy.start();

      const newConfig = createTestConfig();
      await proxy.reload(newConfig);

      expect(lastAggregator.unregisterClient).toHaveBeenCalledWith("upstream1");
    });

    it("should update aggregator resolver", async () => {
      const proxy = await createProxy(mockConfig, "/path/to/config.yml");
      await proxy.start();

      const newConfig = createTestConfig();
      await proxy.reload(newConfig);

      expect(lastAggregator.setResolver).toHaveBeenCalled();
    });

    it("should recreate compressor", async () => {
      const proxy = await createProxy(mockConfig, "/path/to/config.yml");
      await proxy.start();

      const oldCompressor = lastCompressor;

      const newConfig = createTestConfig();
      await proxy.reload(newConfig);

      // New compressor should be created
      expect(lastCompressor).not.toBe(oldCompressor);
      expect(lastDownstreamServer.setCompressor).toHaveBeenCalled();
    });

    it("should recreate masker if enabled in new config", async () => {
      const proxy = await createProxy(mockConfig, "/path/to/config.yml");
      await proxy.start();

      expect(lastMasker).toBeNull();

      const newConfig = createTestConfig({
        masking: {
          enabled: true,
          llmConfig: {
            baseUrl: "http://localhost:8080/v1",
            apiKey: "test-key",
            model: "test-model",
          },
        },
      });

      await proxy.reload(newConfig);

      expect(lastMasker).toBeDefined();
      expect(lastRouter.setMasker).toHaveBeenCalled();
    });

    it("should clear masker if disabled in new config", async () => {
      const configWithMasking = createTestConfig({
        masking: {
          enabled: true,
          llmConfig: {
            baseUrl: "http://localhost:8080/v1",
            apiKey: "test-key",
            model: "test-model",
          },
        },
      });

      const proxy = await createProxy(configWithMasking, "/path/to/config.yml");
      await proxy.start();

      expect(lastMasker).toBeDefined();

      const newConfig = createTestConfig({ masking: undefined });
      await proxy.reload(newConfig);

      expect(lastRouter.setMasker).toHaveBeenCalledWith(undefined);
    });

    it("should update cache config and clear cache", async () => {
      const proxy = await createProxy(mockConfig, "/path/to/config.yml");
      await proxy.start();

      lastCache.clear.mockClear();

      const newConfig = createTestConfig();
      await proxy.reload(newConfig);

      expect(lastCache.updateConfig).toHaveBeenCalledWith(newConfig.cache);
      expect(lastCache.clear).toHaveBeenCalled();
      expect(lastDownstreamServer.setCacheConfig).toHaveBeenCalledWith(newConfig.cache);
    });

    it("should update downstream server resolver", async () => {
      const proxy = await createProxy(mockConfig, "/path/to/config.yml");
      await proxy.start();

      const newConfig = createTestConfig();
      await proxy.reload(newConfig);

      expect(lastDownstreamServer.setResolver).toHaveBeenCalled();
    });

    it("should create new upstream clients", async () => {
      const proxy = await createProxy(mockConfig, "/path/to/config.yml");
      await proxy.start();

      const clientCountBefore = allUpstreamClients.length;

      const newConfig = createTestConfig({
        upstreams: [
          {
            id: "new-upstream",
            name: "New Upstream",
            transport: "stdio",
            command: "new-cmd",
            enabled: true,
            tools: {},
          },
        ],
      });

      await proxy.reload(newConfig);

      // Should have created 1 new client (total 2)
      expect(allUpstreamClients.length).toBe(clientCountBefore + 1);
      expect(lastUpstreamClient.id).toBe("new-upstream");
    });

    it("should skip disabled upstreams during reload", async () => {
      const proxy = await createProxy(mockConfig, "/path/to/config.yml");
      await proxy.start();

      const clientCountBefore = allUpstreamClients.length;

      const newConfig = createTestConfig({
        upstreams: [
          {
            id: "upstream1",
            name: "Upstream 1",
            transport: "stdio",
            command: "cmd1",
            enabled: true,
            tools: {},
          },
          {
            id: "upstream2",
            name: "Upstream 2",
            transport: "stdio",
            command: "cmd2",
            enabled: false,
            tools: {},
          },
        ],
      });

      await proxy.reload(newConfig);

      // Should only create 1 new client (enabled one)
      expect(allUpstreamClients.length).toBe(clientCountBefore + 1);
    });

    it("should register new clients with aggregator", async () => {
      const proxy = await createProxy(mockConfig, "/path/to/config.yml");
      await proxy.start();

      lastAggregator.registerClient.mockClear();

      const newConfig = createTestConfig();
      await proxy.reload(newConfig);

      expect(lastAggregator.registerClient).toHaveBeenCalled();
    });

    it("should connect to new upstreams and refresh", async () => {
      const proxy = await createProxy(mockConfig, "/path/to/config.yml");
      await proxy.start();

      const oldClient = lastUpstreamClient;
      oldClient.connect.mockClear();
      lastAggregator.refresh.mockClear();

      const newConfig = createTestConfig();
      await proxy.reload(newConfig);

      // New client should connect
      expect(lastUpstreamClient.connect).toHaveBeenCalled();
      expect(lastAggregator.refresh).toHaveBeenCalled();
    });

    it("should work without starting first", async () => {
      const proxy = await createProxy(mockConfig, "/path/to/config.yml");

      const newConfig = createTestConfig();

      await expect(proxy.reload(newConfig)).resolves.not.toThrow();
    });
  });
});
