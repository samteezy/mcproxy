import { describe, it, expect, vi, beforeEach } from "vitest";
import { UpstreamClient } from "./client.js";
import { createTestUpstreamConfig } from "../test/helpers.js";
import type {
  Tool,
  ListToolsResult,
  CallToolResult,
  Resource,
  ListResourcesResult,
  ReadResourceResult,
  Prompt,
  ListPromptsResult,
  GetPromptResult,
  TextContent,
  ImageContent,
} from "@modelcontextprotocol/sdk/types.js";

// Store last created mock instance for assertions
let lastMockClient: any = null;

// Mock the entire client module with proper classes defined inside factory
vi.mock("@modelcontextprotocol/sdk/client/index.js", () => {
  return {
    Client: class {
      connect = vi.fn().mockResolvedValue(undefined);
      close = vi.fn().mockResolvedValue(undefined);
      getServerCapabilities = vi.fn().mockReturnValue({});
      listTools = vi.fn();
      callTool = vi.fn();
      listResources = vi.fn();
      readResource = vi.fn();
      listPrompts = vi.fn();
      getPrompt = vi.fn();

      constructor() {
        lastMockClient = this;
      }
    },
  };
});

vi.mock("@modelcontextprotocol/sdk/client/stdio.js", () => {
  return {
    StdioClientTransport: class {
      start = vi.fn();
      close = vi.fn();

      constructor() {
        // Transport mock instance stored for potential future use
      }
    },
  };
});

vi.mock("@modelcontextprotocol/sdk/client/sse.js", () => {
  return {
    SSEClientTransport: class {
      start = vi.fn();
      close = vi.fn();

      constructor() {
        // Transport mock instance stored for potential future use
      }
    },
  };
});

describe("UpstreamClient", () => {
  beforeEach(() => {
    // Don't clear mocks - each test sets up its own mocks
    lastMockClient = null;
  });

  describe("constructor", () => {
    it("should create client with stdio config", () => {
      const config = createTestUpstreamConfig({
        transport: "stdio",
        command: "node",
        args: ["server.js"],
      });

      const client = new UpstreamClient(config);

      expect(client).toBeDefined();
      expect(client.id).toBe(config.id);
      expect(client.name).toBe(config.name);
    });

    it("should create client with streamable-http config", () => {
      const config = createTestUpstreamConfig({
        transport: "streamable-http",
        url: "http://localhost:3000",
      });

      const client = new UpstreamClient(config);

      expect(client).toBeDefined();
      expect(client.id).toBe(config.id);
      expect(client.name).toBe(config.name);
    });

    it("should create client with SSE config", () => {
      const config = createTestUpstreamConfig({
        transport: "sse",
        url: "http://localhost:3000/sse",
      });

      const client = new UpstreamClient(config);

      expect(client).toBeDefined();
      expect(client.id).toBe(config.id);
      expect(client.name).toBe(config.name);
    });
  });

  describe("connect", () => {
    it("should connect with stdio transport", async () => {
      const config = createTestUpstreamConfig({
        transport: "stdio",
        command: "node",
        args: ["server.js"],
        env: { NODE_ENV: "test" },
      });

      const client = new UpstreamClient(config);
      await client.connect();

      // Verify connection was called
      expect(lastMockClient.connect).toHaveBeenCalled();
    });

    it("should connect with streamable-http transport", async () => {
      const config = createTestUpstreamConfig({
        transport: "streamable-http",
        url: "http://localhost:3000/mcp",
      });

      const client = new UpstreamClient(config);
      await client.connect();

      expect(lastMockClient.connect).toHaveBeenCalled();
    });

    it("should connect with SSE transport", async () => {
      const config = createTestUpstreamConfig({
        transport: "sse",
        url: "http://localhost:3000/sse",
      });

      const client = new UpstreamClient(config);
      await client.connect();

      expect(lastMockClient.connect).toHaveBeenCalled();
    });

    it("should throw on unsupported transport", async () => {
      const config = createTestUpstreamConfig({
        transport: "unsupported" as any,
      });

      const client = new UpstreamClient(config);

      await expect(client.connect()).rejects.toThrow("unknown transport");
    });

    it("should throw when stdio transport missing command", async () => {
      const config = createTestUpstreamConfig({
        transport: "stdio",
        command: undefined,
      });

      const client = new UpstreamClient(config);

      await expect(client.connect()).rejects.toThrow(
        "stdio transport requires 'command'"
      );
    });

    it("should throw when streamable-http transport missing url", async () => {
      const config = createTestUpstreamConfig({
        transport: "streamable-http",
        url: undefined,
      });

      const client = new UpstreamClient(config);

      await expect(client.connect()).rejects.toThrow(
        "streamable-http transport requires 'url'"
      );
    });

    it("should throw when sse transport missing url", async () => {
      const config = createTestUpstreamConfig({
        transport: "sse",
        url: undefined,
      });

      const client = new UpstreamClient(config);

      await expect(client.connect()).rejects.toThrow(
        "sse transport requires 'url'"
      );
    });

    it("should handle connection errors", async () => {
      const config = createTestUpstreamConfig();
      const client = new UpstreamClient(config);

      // Mock AFTER client creation
      lastMockClient.connect.mockRejectedValue(new Error("Connection failed"));

      await expect(client.connect()).rejects.toThrow("Connection failed");
    });

    it("should not connect twice", async () => {
      const config = createTestUpstreamConfig();
      const client = new UpstreamClient(config);

      await client.connect();
      await client.connect(); // Second connect should be no-op

      expect(lastMockClient.connect).toHaveBeenCalledTimes(1);
    });
  });

  describe("disconnect", () => {
    it("should disconnect when connected", async () => {
      const config = createTestUpstreamConfig();
      const client = new UpstreamClient(config);

      await client.connect();
      await client.disconnect();

      expect(lastMockClient.close).toHaveBeenCalled();
    });

    it("should handle disconnect when not connected", async () => {
      const config = createTestUpstreamConfig();
      const client = new UpstreamClient(config);

      await client.disconnect(); // Should not throw

      expect(lastMockClient.close).not.toHaveBeenCalled();
    });

    it("should handle disconnect errors", async () => {
      const config = createTestUpstreamConfig();
      const client = new UpstreamClient(config);

      // Mock AFTER client creation
      lastMockClient.close.mockRejectedValue(new Error("Disconnect failed"));

      await client.connect();
      await expect(client.disconnect()).rejects.toThrow("Disconnect failed");
    });
  });

  describe("capability checks", () => {
    it("should return true when server supports resources", async () => {
      const config = createTestUpstreamConfig();
      const client = new UpstreamClient(config);

      lastMockClient.getServerCapabilities.mockReturnValue({
        resources: {},
      });

      await client.connect();

      expect(client.supportsResources()).toBe(true);
    });

    it("should return false when server does not support resources", async () => {
      const config = createTestUpstreamConfig();
      const client = new UpstreamClient(config);

      lastMockClient.getServerCapabilities.mockReturnValue({});

      await client.connect();

      expect(client.supportsResources()).toBe(false);
    });

    it("should return true when server supports prompts", async () => {
      const config = createTestUpstreamConfig();
      const client = new UpstreamClient(config);

      lastMockClient.getServerCapabilities.mockReturnValue({
        prompts: {},
      });

      await client.connect();

      expect(client.supportsPrompts()).toBe(true);
    });

    it("should return false when server does not support prompts", async () => {
      const config = createTestUpstreamConfig();
      const client = new UpstreamClient(config);

      lastMockClient.getServerCapabilities.mockReturnValue({});

      await client.connect();

      expect(client.supportsPrompts()).toBe(false);
    });

    it("should return false for capabilities when not connected", () => {
      const config = createTestUpstreamConfig();
      const client = new UpstreamClient(config);

      expect(client.supportsResources()).toBe(false);
      expect(client.supportsPrompts()).toBe(false);
    });
  });

  describe("listTools", () => {
    it("should list tools when connected", async () => {
      const tools: Tool[] = [
        {
          name: "tool1",
          description: "Test tool 1",
          inputSchema: {
            type: "object",
            properties: {},
          },
        },
        {
          name: "tool2",
          description: "Test tool 2",
          inputSchema: {
            type: "object",
            properties: {},
          },
        },
      ];
      const result: ListToolsResult = { tools };

      const config = createTestUpstreamConfig();
      const client = new UpstreamClient(config);

      // Mock the method AFTER client is created
      lastMockClient.listTools.mockResolvedValue(result);

      await client.connect();

      const response = await client.listTools();

      expect(response).toEqual(tools); // Returns array, not result object
      expect(lastMockClient.listTools).toHaveBeenCalled();
    });

    it("should throw when not connected", async () => {
      const config = createTestUpstreamConfig();
      const client = new UpstreamClient(config);

      await expect(client.listTools()).rejects.toThrow(
        "not connected"
      );
    });
  });

  describe("callTool", () => {
    it("should call tool with arguments", async () => {
      const toolResult: CallToolResult = {
        content: [
          {
            type: "text",
            text: "Result text",
          } as TextContent,
        ],
      };
      const config = createTestUpstreamConfig();
      const client = new UpstreamClient(config);

      // Mock AFTER client creation
      lastMockClient.callTool.mockResolvedValue(toolResult);
      await client.connect();

      const result = await client.callTool("test-tool", { arg1: "value1" });

      expect(result).toEqual(toolResult);
      expect(lastMockClient.callTool).toHaveBeenCalledWith({
        name: "test-tool",
        arguments: { arg1: "value1" },
      });
    });

    it("should call tool without arguments", async () => {
      const toolResult: CallToolResult = {
        content: [{ type: "text", text: "Result" } as TextContent],
      };
      const config = createTestUpstreamConfig();
      const client = new UpstreamClient(config);

      // Mock AFTER client creation
      lastMockClient.callTool.mockResolvedValue(toolResult);
      await client.connect();

      await client.callTool("test-tool", {});

      expect(lastMockClient.callTool).toHaveBeenCalledWith({
        name: "test-tool",
        arguments: {},
      });
    });

    it("should handle legacy toolResult format", async () => {
      const legacyResult = {
        toolResult: "Legacy result string",
      };
      const config = createTestUpstreamConfig();
      const client = new UpstreamClient(config);

      // Mock AFTER client creation
      lastMockClient.callTool.mockResolvedValue(legacyResult);
      await client.connect();

      const result = await client.callTool("test-tool", {});

      expect(result).toEqual({
        content: [
          {
            type: "text",
            text: "Legacy result string",
          },
        ],
      });
    });

    it("should handle legacy toolResult with array", async () => {
      const legacyResult = {
        toolResult: ["item1", "item2"],
      };
      const config = createTestUpstreamConfig();
      const client = new UpstreamClient(config);

      // Mock AFTER client creation
      lastMockClient.callTool.mockResolvedValue(legacyResult);
      await client.connect();

      const result = await client.callTool("test-tool", {});

      expect(result).toEqual({
        content: [
          {
            type: "text",
            text: "item1,item2", // String() conversion, not JSON.stringify()
          },
        ],
      });
    });

    it("should handle legacy toolResult with object", async () => {
      const legacyResult = {
        toolResult: { key: "value", nested: { data: true } },
      };
      const config = createTestUpstreamConfig();
      const client = new UpstreamClient(config);

      // Mock AFTER client creation
      lastMockClient.callTool.mockResolvedValue(legacyResult);
      await client.connect();

      const result = await client.callTool("test-tool", {});

      expect(result).toEqual({
        content: [
          {
            type: "text",
            text: "[object Object]", // String() conversion of object
          },
        ],
      });
    });

    it("should handle modern content array format", async () => {
      const modernResult: CallToolResult = {
        content: [
          { type: "text", text: "Text content" } as TextContent,
          {
            type: "image",
            data: "base64data",
            mimeType: "image/png",
          } as ImageContent,
        ],
      };
      const config = createTestUpstreamConfig();
      const client = new UpstreamClient(config);

      // Mock AFTER client creation
      lastMockClient.callTool.mockResolvedValue(modernResult);
      await client.connect();

      const result = await client.callTool("test-tool", {});

      expect(result).toEqual(modernResult);
    });

    it("should handle isError flag", async () => {
      const errorResult: CallToolResult = {
        content: [{ type: "text", text: "Error occurred" } as TextContent],
        isError: true,
      };
      const config = createTestUpstreamConfig();
      const client = new UpstreamClient(config);

      // Mock AFTER client creation
      lastMockClient.callTool.mockResolvedValue(errorResult);
      await client.connect();

      const result = await client.callTool("test-tool", {});

      expect(result.isError).toBe(true);
      expect(result.content).toEqual([
        { type: "text", text: "Error occurred" },
      ]);
    });

    it("should throw when not connected", async () => {
      const config = createTestUpstreamConfig();
      const client = new UpstreamClient(config);

      await expect(client.callTool("test-tool", {})).rejects.toThrow(
        "not connected"
      );
    });
  });

  describe("listResources", () => {
    it("should list resources when connected", async () => {
      const resources: Resource[] = [
        {
          uri: "resource://1",
          name: "Resource 1",
          mimeType: "text/plain",
        },
        {
          uri: "resource://2",
          name: "Resource 2",
          mimeType: "application/json",
        },
      ];
      const result: ListResourcesResult = { resources };
      const config = createTestUpstreamConfig();
      const client = new UpstreamClient(config);

      // Mock capabilities and method AFTER client creation
      lastMockClient.getServerCapabilities.mockReturnValue({ resources: {} });
      lastMockClient.listResources.mockResolvedValue(result);
      await client.connect();

      const response = await client.listResources();

      expect(response).toEqual(resources); // Returns array, not result object
      expect(lastMockClient.listResources).toHaveBeenCalled();
    });

    it("should throw when not connected", async () => {
      const config = createTestUpstreamConfig();
      const client = new UpstreamClient(config);

      await expect(client.listResources()).rejects.toThrow(
        "not connected"
      );
    });
  });

  describe("readResource", () => {
    it("should read resource when connected", async () => {
      const result: ReadResourceResult = {
        contents: [
          {
            uri: "resource://1",
            mimeType: "text/plain",
            text: "Resource content",
          },
        ],
      };
      const config = createTestUpstreamConfig();
      const client = new UpstreamClient(config);

      // Mock AFTER client creation
      lastMockClient.readResource.mockResolvedValue(result);
      await client.connect();

      const response = await client.readResource("resource://1");

      expect(response).toEqual(result);
      expect(lastMockClient.readResource).toHaveBeenCalledWith({
        uri: "resource://1",
      });
    });

    it("should throw when not connected", async () => {
      const config = createTestUpstreamConfig();
      const client = new UpstreamClient(config);

      await expect(client.readResource("resource://1")).rejects.toThrow(
        "not connected"
      );
    });
  });

  describe("listPrompts", () => {
    it("should list prompts when connected", async () => {
      const prompts: Prompt[] = [
        {
          name: "prompt1",
          description: "First prompt",
        },
        {
          name: "prompt2",
          description: "Second prompt",
          arguments: [
            {
              name: "arg1",
              description: "Argument 1",
              required: true,
            },
          ],
        },
      ];
      const result: ListPromptsResult = { prompts };
      const config = createTestUpstreamConfig();
      const client = new UpstreamClient(config);

      // Mock capabilities and method AFTER client creation
      lastMockClient.getServerCapabilities.mockReturnValue({ prompts: {} });
      lastMockClient.listPrompts.mockResolvedValue(result);
      await client.connect();

      const response = await client.listPrompts();

      expect(response).toEqual(prompts); // Returns array, not result object
      expect(lastMockClient.listPrompts).toHaveBeenCalled();
    });

    it("should throw when not connected", async () => {
      const config = createTestUpstreamConfig();
      const client = new UpstreamClient(config);

      await expect(client.listPrompts()).rejects.toThrow(
        "not connected"
      );
    });
  });

  describe("getPrompt", () => {
    it("should get prompt with arguments", async () => {
      const result: GetPromptResult = {
        messages: [
          {
            role: "user",
            content: {
              type: "text",
              text: "Prompt message with arg: value1",
            },
          },
        ],
      };
      const config = createTestUpstreamConfig();
      const client = new UpstreamClient(config);

      // Mock AFTER client creation
      lastMockClient.getPrompt.mockResolvedValue(result);
      await client.connect();

      const response = await client.getPrompt("test-prompt", { arg1: "value1" });

      expect(response).toEqual(result);
      expect(lastMockClient.getPrompt).toHaveBeenCalledWith({
        name: "test-prompt",
        arguments: { arg1: "value1" },
      });
    });

    it("should get prompt without arguments", async () => {
      const result: GetPromptResult = {
        messages: [
          {
            role: "user",
            content: {
              type: "text",
              text: "Prompt message",
            },
          },
        ],
      };
      const config = createTestUpstreamConfig();
      const client = new UpstreamClient(config);

      // Mock AFTER client creation
      lastMockClient.getPrompt.mockResolvedValue(result);
      await client.connect();

      await client.getPrompt("test-prompt");

      expect(lastMockClient.getPrompt).toHaveBeenCalledWith({
        name: "test-prompt",
        arguments: undefined,
      });
    });

    it("should throw when not connected", async () => {
      const config = createTestUpstreamConfig();
      const client = new UpstreamClient(config);

      await expect(client.getPrompt("test-prompt")).rejects.toThrow(
        "not connected"
      );
    });
  });

  describe("integration scenarios", () => {
    it("should handle full lifecycle", async () => {
      const config = createTestUpstreamConfig();
      const client = new UpstreamClient(config);

      await client.connect();
      expect(lastMockClient.connect).toHaveBeenCalled();

      // Mock and use tools
      const testTool: Tool = {
        name: "test-tool",
        description: "Test tool",
        inputSchema: {
          type: "object",
          properties: {},
        },
      };
      lastMockClient.listTools.mockResolvedValue({
        tools: [testTool],
      });
      const tools = await client.listTools();
      expect(tools).toHaveLength(1); // listTools returns array, not object

      // Disconnect
      await client.disconnect();
      expect(lastMockClient.close).toHaveBeenCalled();
    });

    it("should handle reconnection", async () => {
      const config = createTestUpstreamConfig();
      const client = new UpstreamClient(config);

      // First connection
      await client.connect();
      await client.disconnect();

      // Reconnection
      await client.connect();

      expect(lastMockClient.connect).toHaveBeenCalledTimes(2);
      expect(lastMockClient.close).toHaveBeenCalledTimes(1);
    });

    it("should maintain config throughout lifecycle", async () => {
      const config = createTestUpstreamConfig({
        id: "custom-id",
        name: "Custom Server",
      });
      const client = new UpstreamClient(config);

      expect(client.id).toBe("custom-id");
      expect(client.name).toBe("Custom Server");

      await client.connect();
      expect(client.id).toBe("custom-id");

      await client.disconnect();
      expect(client.id).toBe("custom-id");
    });
  });

  describe("property getters", () => {
    it("should return id from config", () => {
      const config = createTestUpstreamConfig({ id: "test-id" });
      const client = new UpstreamClient(config);

      expect(client.id).toBe("test-id");
    });

    it("should return name from config", () => {
      const config = createTestUpstreamConfig({ name: "Test Server Name" });
      const client = new UpstreamClient(config);

      expect(client.name).toBe("Test Server Name");
    });

    it("should return connection status", async () => {
      const config = createTestUpstreamConfig();
      const client = new UpstreamClient(config);

      expect(client.isConnected).toBe(false);

      await client.connect();
      expect(client.isConnected).toBe(true);

      await client.disconnect();
      expect(client.isConnected).toBe(false);
    });
  });

  describe("unsupported capabilities", () => {
    it("should return empty array when resources not supported", async () => {
      const config = createTestUpstreamConfig();
      const client = new UpstreamClient(config);

      await client.connect();

      // Mock server that doesn't support resources
      lastMockClient.getServerCapabilities.mockReturnValue({
        resources: undefined,
        prompts: {},
      });

      const resources = await client.listResources();
      expect(resources).toEqual([]);
      expect(lastMockClient.listResources).not.toHaveBeenCalled();
    });

    it("should return empty array when prompts not supported", async () => {
      const config = createTestUpstreamConfig();
      const client = new UpstreamClient(config);

      await client.connect();

      // Mock server that doesn't support prompts
      lastMockClient.getServerCapabilities.mockReturnValue({
        resources: {},
        prompts: undefined,
      });

      const prompts = await client.listPrompts();
      expect(prompts).toEqual([]);
      expect(lastMockClient.listPrompts).not.toHaveBeenCalled();
    });

    it("should still list resources when prompts not supported", async () => {
      const config = createTestUpstreamConfig();
      const client = new UpstreamClient(config);

      await client.connect();

      // Mock server that supports resources but not prompts
      lastMockClient.getServerCapabilities.mockReturnValue({
        resources: {},
        prompts: undefined,
      });

      lastMockClient.listResources.mockResolvedValue({
        resources: [{ uri: "file://test.txt", name: "Test", mimeType: "text/plain" }],
      });

      const resources = await client.listResources();
      expect(resources).toHaveLength(1);
      expect(lastMockClient.listResources).toHaveBeenCalled();

      const prompts = await client.listPrompts();
      expect(prompts).toEqual([]);
      expect(lastMockClient.listPrompts).not.toHaveBeenCalled();
    });
  });
});
