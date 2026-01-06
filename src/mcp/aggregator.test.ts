import { describe, it, expect, vi, beforeEach } from "vitest";
import { Aggregator } from "./aggregator.js";
import type { UpstreamClient } from "./client.js";
import type { ToolConfigResolver } from "../config/tool-resolver.js";
import type { Tool, Resource, Prompt } from "@modelcontextprotocol/sdk/types.js";

describe("Aggregator", () => {
  let mockResolver: ToolConfigResolver;
  let mockClient1: Partial<UpstreamClient>;
  let mockClient2: Partial<UpstreamClient>;

  beforeEach(() => {
    // Create mock resolver with default behaviors
    mockResolver = {
      isToolHidden: vi.fn().mockReturnValue(false),
      getParameterOverrides: vi.fn().mockReturnValue({}),
      getDescriptionOverride: vi.fn().mockReturnValue(null),
      getHiddenParameters: vi.fn().mockReturnValue([]),
      isGoalAwareEnabled: vi.fn().mockReturnValue(true),
      isBypassEnabled: vi.fn().mockReturnValue(false),
    } as any;

    // Create mock upstream clients
    mockClient1 = {
      id: "server1",
      isConnected: true,
      listTools: vi.fn().mockResolvedValue([]),
      listResources: vi.fn().mockResolvedValue([]),
      listPrompts: vi.fn().mockResolvedValue([]),
    };

    mockClient2 = {
      id: "server2",
      isConnected: true,
      listTools: vi.fn().mockResolvedValue([]),
      listResources: vi.fn().mockResolvedValue([]),
      listPrompts: vi.fn().mockResolvedValue([]),
    };
  });

  describe("constructor", () => {
    it("should create aggregator with resolver", () => {
      const aggregator = new Aggregator({ resolver: mockResolver });
      expect(aggregator).toBeDefined();
    });
  });

  describe("client management", () => {
    it("should register a client", () => {
      const aggregator = new Aggregator({ resolver: mockResolver });
      aggregator.registerClient(mockClient1 as UpstreamClient);

      const retrieved = aggregator.getClient("server1");
      expect(retrieved).toBe(mockClient1);
    });

    it("should unregister a client", () => {
      const aggregator = new Aggregator({ resolver: mockResolver });
      aggregator.registerClient(mockClient1 as UpstreamClient);
      aggregator.unregisterClient("server1");

      const retrieved = aggregator.getClient("server1");
      expect(retrieved).toBeUndefined();
    });

    it("should invalidate cache when registering client", async () => {
      const aggregator = new Aggregator({ resolver: mockResolver });
      aggregator.registerClient(mockClient1 as UpstreamClient);

      // First call should trigger refresh
      await aggregator.listTools();
      expect(mockClient1.listTools).toHaveBeenCalledTimes(1);

      // Register new client - should invalidate cache
      aggregator.registerClient(mockClient2 as UpstreamClient);

      // Next call should trigger refresh again
      await aggregator.listTools();
      expect(mockClient1.listTools).toHaveBeenCalledTimes(2);
    });

    it("should invalidate cache when unregistering client", async () => {
      const aggregator = new Aggregator({ resolver: mockResolver });
      aggregator.registerClient(mockClient1 as UpstreamClient);

      await aggregator.listTools();
      expect(mockClient1.listTools).toHaveBeenCalledTimes(1);

      aggregator.unregisterClient("server1");
      await aggregator.listTools();
      expect(mockClient1.listTools).toHaveBeenCalledTimes(1); // No longer called
    });
  });

  describe("setResolver", () => {
    it("should update resolver and invalidate cache", async () => {
      const aggregator = new Aggregator({ resolver: mockResolver });
      aggregator.registerClient(mockClient1 as UpstreamClient);

      await aggregator.listTools();
      expect(mockClient1.listTools).toHaveBeenCalledTimes(1);

      const newResolver = { ...mockResolver } as ToolConfigResolver;
      aggregator.setResolver(newResolver);

      await aggregator.listTools();
      expect(mockClient1.listTools).toHaveBeenCalledTimes(2);
    });
  });

  describe("refresh", () => {
    it("should aggregate tools from multiple upstreams", async () => {
      const tool1: Tool = {
        name: "tool1",
        description: "Tool 1",
        inputSchema: { type: "object", properties: {} },
      };
      const tool2: Tool = {
        name: "tool2",
        description: "Tool 2",
        inputSchema: { type: "object", properties: {} },
      };

      vi.mocked(mockClient1.listTools!).mockResolvedValue([tool1]);
      vi.mocked(mockClient2.listTools!).mockResolvedValue([tool2]);

      const aggregator = new Aggregator({ resolver: mockResolver });
      aggregator.registerClient(mockClient1 as UpstreamClient);
      aggregator.registerClient(mockClient2 as UpstreamClient);

      const tools = await aggregator.listTools();

      expect(tools).toHaveLength(2);
      expect(tools.find((t) => t.name === "server1__tool1")).toBeDefined();
      expect(tools.find((t) => t.name === "server2__tool2")).toBeDefined();
    });

    it("should aggregate resources from multiple upstreams", async () => {
      const resource1: Resource = {
        uri: "file://doc1.txt",
        name: "Doc 1",
        mimeType: "text/plain",
      };
      const resource2: Resource = {
        uri: "file://doc2.txt",
        name: "Doc 2",
        mimeType: "text/plain",
      };

      vi.mocked(mockClient1.listResources!).mockResolvedValue([resource1]);
      vi.mocked(mockClient2.listResources!).mockResolvedValue([resource2]);

      const aggregator = new Aggregator({ resolver: mockResolver });
      aggregator.registerClient(mockClient1 as UpstreamClient);
      aggregator.registerClient(mockClient2 as UpstreamClient);

      const resources = await aggregator.listResources();

      expect(resources).toHaveLength(2);
      expect(resources.find((r) => r.uri === "server1://file://doc1.txt")).toBeDefined();
      expect(resources.find((r) => r.uri === "server2://file://doc2.txt")).toBeDefined();
    });

    it("should aggregate prompts from multiple upstreams", async () => {
      const prompt1: Prompt = {
        name: "prompt1",
        description: "Prompt 1",
      };
      const prompt2: Prompt = {
        name: "prompt2",
        description: "Prompt 2",
      };

      vi.mocked(mockClient1.listPrompts!).mockResolvedValue([prompt1]);
      vi.mocked(mockClient2.listPrompts!).mockResolvedValue([prompt2]);

      const aggregator = new Aggregator({ resolver: mockResolver });
      aggregator.registerClient(mockClient1 as UpstreamClient);
      aggregator.registerClient(mockClient2 as UpstreamClient);

      const prompts = await aggregator.listPrompts();

      expect(prompts).toHaveLength(2);
      expect(prompts.find((p) => p.name === "server1__prompt1")).toBeDefined();
      expect(prompts.find((p) => p.name === "server2__prompt2")).toBeDefined();
    });

    it("should skip disconnected upstreams", async () => {
      vi.spyOn(mockClient1, 'isConnected', 'get').mockReturnValue(false);

      const tool: Tool = {
        name: "tool1",
        description: "Tool 1",
        inputSchema: { type: "object", properties: {} },
      };
      vi.mocked(mockClient2.listTools!).mockResolvedValue([tool]);

      const aggregator = new Aggregator({ resolver: mockResolver });
      aggregator.registerClient(mockClient1 as UpstreamClient);
      aggregator.registerClient(mockClient2 as UpstreamClient);

      const tools = await aggregator.listTools();

      expect(tools).toHaveLength(1);
      expect(tools[0].name).toBe("server2__tool1");
      expect(mockClient1.listTools).not.toHaveBeenCalled();
    });

    it("should handle partial upstream failures", async () => {
      const tool: Tool = {
        name: "tool1",
        description: "Tool 1",
        inputSchema: { type: "object", properties: {} },
      };

      vi.mocked(mockClient1.listTools!).mockRejectedValue(new Error("Connection error"));
      vi.mocked(mockClient2.listTools!).mockResolvedValue([tool]);

      const aggregator = new Aggregator({ resolver: mockResolver });
      aggregator.registerClient(mockClient1 as UpstreamClient);
      aggregator.registerClient(mockClient2 as UpstreamClient);

      // Should not throw, should continue with server2
      const tools = await aggregator.listTools();

      expect(tools).toHaveLength(1);
      expect(tools[0].name).toBe("server2__tool1");
    });

    it("should cache results until invalidated", async () => {
      const tool: Tool = {
        name: "tool1",
        description: "Tool 1",
        inputSchema: { type: "object", properties: {} },
      };
      vi.mocked(mockClient1.listTools!).mockResolvedValue([tool]);

      const aggregator = new Aggregator({ resolver: mockResolver });
      aggregator.registerClient(mockClient1 as UpstreamClient);

      await aggregator.listTools();
      await aggregator.listTools();
      await aggregator.listTools();

      // Should only call once due to caching
      expect(mockClient1.listTools).toHaveBeenCalledTimes(1);
    });
  });

  describe("tool filtering", () => {
    it("should filter out hidden tools", async () => {
      const tool1: Tool = {
        name: "visible",
        description: "Visible tool",
        inputSchema: { type: "object", properties: {} },
      };
      const tool2: Tool = {
        name: "hidden",
        description: "Hidden tool",
        inputSchema: { type: "object", properties: {} },
      };

      vi.mocked(mockClient1.listTools!).mockResolvedValue([tool1, tool2]);
      vi.mocked(mockResolver.isToolHidden).mockImplementation(
        (name: string) => name === "server1__hidden"
      );

      const aggregator = new Aggregator({ resolver: mockResolver });
      aggregator.registerClient(mockClient1 as UpstreamClient);

      const tools = await aggregator.listTools();

      expect(tools).toHaveLength(1);
      expect(tools[0].name).toBe("server1__visible");
    });

    it("should check isToolHidden with correct name", async () => {
      const tool: Tool = {
        name: "test",
        description: "Test tool",
        inputSchema: { type: "object", properties: {} },
      };

      vi.mocked(mockClient1.listTools!).mockResolvedValue([tool]);

      const aggregator = new Aggregator({ resolver: mockResolver });
      aggregator.registerClient(mockClient1 as UpstreamClient);

      expect(aggregator.isToolHidden("server1__test")).toBe(false);
      expect(mockResolver.isToolHidden).toHaveBeenCalledWith("server1__test");
    });
  });

  describe("schema transformations", () => {
    it("should inject goal field when goal-aware is enabled", async () => {
      const tool: Tool = {
        name: "test",
        description: "Test tool",
        inputSchema: {
          type: "object",
          properties: {
            arg1: { type: "string" },
          },
          required: ["arg1"],
        },
      };

      vi.mocked(mockClient1.listTools!).mockResolvedValue([tool]);
      vi.mocked(mockResolver.isGoalAwareEnabled).mockReturnValue(true);

      const aggregator = new Aggregator({ resolver: mockResolver });
      aggregator.registerClient(mockClient1 as UpstreamClient);

      const tools = await aggregator.listTools();

      expect(tools).toHaveLength(1);
      const resultTool = tools[0];

      // Check that _mcpcp_goal was added to properties
      expect(resultTool.inputSchema.properties).toHaveProperty("_mcpcp_goal");
      expect(resultTool.inputSchema.properties!._mcpcp_goal).toEqual({
        type: "string",
        description: expect.stringContaining("Specific search term"),
      });

      // Check that _mcpcp_goal was added to required
      expect(resultTool.inputSchema.required).toContain("_mcpcp_goal");
      expect(resultTool.inputSchema.required).toContain("arg1");

      // Check description was updated
      expect(resultTool.description).toContain("_mcpcp_goal");
    });

    it("should not inject goal field when goal-aware is disabled", async () => {
      const tool: Tool = {
        name: "test",
        description: "Test tool",
        inputSchema: {
          type: "object",
          properties: {
            arg1: { type: "string" },
          },
        },
      };

      vi.mocked(mockClient1.listTools!).mockResolvedValue([tool]);
      vi.mocked(mockResolver.isGoalAwareEnabled).mockReturnValue(false);

      const aggregator = new Aggregator({ resolver: mockResolver });
      aggregator.registerClient(mockClient1 as UpstreamClient);

      const tools = await aggregator.listTools();

      expect(tools[0].inputSchema.properties).not.toHaveProperty("_mcpcp_goal");
    });

    it("should inject bypass field when globally enabled", async () => {
      const tool: Tool = {
        name: "test",
        description: "Test tool",
        inputSchema: {
          type: "object",
          properties: {},
        },
      };

      vi.mocked(mockClient1.listTools!).mockResolvedValue([tool]);
      vi.mocked(mockResolver.isBypassEnabled).mockReturnValue(true);

      const aggregator = new Aggregator({ resolver: mockResolver });
      aggregator.registerClient(mockClient1 as UpstreamClient);

      const tools = await aggregator.listTools();

      expect(tools[0].inputSchema.properties).toHaveProperty("_mcpcp_bypass");
      expect(tools[0].inputSchema.properties!._mcpcp_bypass).toEqual({
        type: "boolean",
        description: expect.stringContaining("bypass compression"),
      });

      // Should NOT be in required (it's optional)
      expect(tools[0].inputSchema.required || []).not.toContain("_mcpcp_bypass");

      expect(tools[0].description).toContain("_mcpcp_bypass");
    });

    it("should hide parameters from schema", async () => {
      const tool: Tool = {
        name: "test",
        description: "Test tool",
        inputSchema: {
          type: "object",
          properties: {
            visible: { type: "string" },
            hidden1: { type: "string" },
            hidden2: { type: "number" },
          },
          required: ["visible", "hidden1"],
        },
      };

      vi.mocked(mockClient1.listTools!).mockResolvedValue([tool]);
      vi.mocked(mockResolver.getHiddenParameters).mockReturnValue(["hidden1", "hidden2"]);

      const aggregator = new Aggregator({ resolver: mockResolver });
      aggregator.registerClient(mockClient1 as UpstreamClient);

      const tools = await aggregator.listTools();

      const resultTool = tools[0];

      // Hidden parameters should be removed
      expect(resultTool.inputSchema.properties).toHaveProperty("visible");
      expect(resultTool.inputSchema.properties).not.toHaveProperty("hidden1");
      expect(resultTool.inputSchema.properties).not.toHaveProperty("hidden2");

      // Required should also be updated
      expect(resultTool.inputSchema.required).toContain("visible");
      expect(resultTool.inputSchema.required || []).not.toContain("hidden1");
    });

    it("should apply description override", async () => {
      const tool: Tool = {
        name: "test",
        description: "Original description",
        inputSchema: { type: "object", properties: {} },
      };

      vi.mocked(mockClient1.listTools!).mockResolvedValue([tool]);
      vi.mocked(mockResolver.getDescriptionOverride).mockReturnValue("Overridden description");

      const aggregator = new Aggregator({ resolver: mockResolver });
      aggregator.registerClient(mockClient1 as UpstreamClient);

      const tools = await aggregator.listTools();

      // Note: goal field injection will append to the overridden description
      expect(tools[0].description).toContain("Overridden description");
    });

    it("should combine all transformations correctly", async () => {
      const tool: Tool = {
        name: "test",
        description: "Original",
        inputSchema: {
          type: "object",
          properties: {
            visible: { type: "string" },
            hidden: { type: "string" },
          },
          required: ["visible"],
        },
      };

      vi.mocked(mockClient1.listTools!).mockResolvedValue([tool]);
      vi.mocked(mockResolver.getDescriptionOverride).mockReturnValue("Custom description");
      vi.mocked(mockResolver.getHiddenParameters).mockReturnValue(["hidden"]);
      vi.mocked(mockResolver.isGoalAwareEnabled).mockReturnValue(true);
      vi.mocked(mockResolver.isBypassEnabled).mockReturnValue(true);

      const aggregator = new Aggregator({ resolver: mockResolver });
      aggregator.registerClient(mockClient1 as UpstreamClient);

      const tools = await aggregator.listTools();
      const result = tools[0];

      // Check description has custom + goal + bypass
      expect(result.description).toContain("Custom description");
      expect(result.description).toContain("_mcpcp_goal");
      expect(result.description).toContain("_mcpcp_bypass");

      // Check properties
      expect(result.inputSchema.properties).toHaveProperty("visible");
      expect(result.inputSchema.properties).not.toHaveProperty("hidden");
      expect(result.inputSchema.properties).toHaveProperty("_mcpcp_goal");
      expect(result.inputSchema.properties).toHaveProperty("_mcpcp_bypass");

      // Check required
      expect(result.inputSchema.required).toContain("visible");
      expect(result.inputSchema.required).toContain("_mcpcp_goal");
      expect(result.inputSchema.required || []).not.toContain("_mcpcp_bypass");
    });

    it("should inject goal field when tool has no description", async () => {
      const tool: Tool = {
        name: "test",
        description: undefined,
        inputSchema: {
          type: "object",
          properties: {
            arg1: { type: "string" },
          },
          required: ["arg1"],
        },
      };

      vi.mocked(mockClient1.listTools!).mockResolvedValue([tool]);
      vi.mocked(mockResolver.isGoalAwareEnabled).mockReturnValue(true);

      const aggregator = new Aggregator({ resolver: mockResolver });
      aggregator.registerClient(mockClient1 as UpstreamClient);

      const tools = await aggregator.listTools();

      expect(tools).toHaveLength(1);
      const resultTool = tools[0];

      // Check that description was set (not undefined/null)
      expect(resultTool.description).toBeDefined();
      expect(resultTool.description).toContain("_mcpcp_goal");
    });

    it("should inject bypass field when tool has no description", async () => {
      const tool: Tool = {
        name: "test",
        description: undefined,
        inputSchema: {
          type: "object",
          properties: {},
        },
      };

      vi.mocked(mockClient1.listTools!).mockResolvedValue([tool]);
      vi.mocked(mockResolver.isBypassEnabled).mockReturnValue(true);

      const aggregator = new Aggregator({ resolver: mockResolver });
      aggregator.registerClient(mockClient1 as UpstreamClient);

      const tools = await aggregator.listTools();

      expect(tools[0].description).toBeDefined();
      expect(tools[0].description).toContain("_mcpcp_bypass");
    });

    it("should inject goal field when inputSchema.properties is undefined", async () => {
      const tool: Tool = {
        name: "test",
        description: "Test tool",
        inputSchema: {
          type: "object",
          // properties is missing
        },
      };

      vi.mocked(mockClient1.listTools!).mockResolvedValue([tool]);
      vi.mocked(mockResolver.isGoalAwareEnabled).mockReturnValue(true);

      const aggregator = new Aggregator({ resolver: mockResolver });
      aggregator.registerClient(mockClient1 as UpstreamClient);

      const tools = await aggregator.listTools();

      expect(tools[0].inputSchema.properties).toHaveProperty("_mcpcp_goal");
    });

    it("should inject goal field when inputSchema.required is undefined", async () => {
      const tool: Tool = {
        name: "test",
        description: "Test tool",
        inputSchema: {
          type: "object",
          properties: {},
          // required is missing
        },
      };

      vi.mocked(mockClient1.listTools!).mockResolvedValue([tool]);
      vi.mocked(mockResolver.isGoalAwareEnabled).mockReturnValue(true);

      const aggregator = new Aggregator({ resolver: mockResolver });
      aggregator.registerClient(mockClient1 as UpstreamClient);

      const tools = await aggregator.listTools();

      expect(tools[0].inputSchema.required).toContain("_mcpcp_goal");
    });

    it("should inject bypass field when inputSchema.properties is undefined", async () => {
      const tool: Tool = {
        name: "test",
        description: "Test tool",
        inputSchema: {
          type: "object",
          // properties is missing
        },
      };

      vi.mocked(mockClient1.listTools!).mockResolvedValue([tool]);
      vi.mocked(mockResolver.isBypassEnabled).mockReturnValue(true);

      const aggregator = new Aggregator({ resolver: mockResolver });
      aggregator.registerClient(mockClient1 as UpstreamClient);

      const tools = await aggregator.listTools();

      expect(tools[0].inputSchema.properties).toHaveProperty("_mcpcp_bypass");
    });

    it("should hide parameters when inputSchema.properties is undefined", async () => {
      const tool: Tool = {
        name: "test",
        description: "Test tool",
        inputSchema: {
          type: "object",
          // properties is missing
        },
      };

      vi.mocked(mockClient1.listTools!).mockResolvedValue([tool]);
      vi.mocked(mockResolver.getHiddenParameters).mockReturnValue(["param1"]);
      vi.mocked(mockResolver.isGoalAwareEnabled).mockReturnValue(false); // Disable goal injection

      const aggregator = new Aggregator({ resolver: mockResolver });
      aggregator.registerClient(mockClient1 as UpstreamClient);

      const tools = await aggregator.listTools();

      // Should not crash, properties should be empty object (no goal field)
      expect(tools[0].inputSchema.properties).toBeDefined();
      expect(Object.keys(tools[0].inputSchema.properties!)).toHaveLength(0);
    });

    it("should hide parameters when inputSchema.required is undefined", async () => {
      const tool: Tool = {
        name: "test",
        description: "Test tool",
        inputSchema: {
          type: "object",
          properties: {
            param1: { type: "string" },
          },
          // required is missing
        },
      };

      vi.mocked(mockClient1.listTools!).mockResolvedValue([tool]);
      vi.mocked(mockResolver.getHiddenParameters).mockReturnValue(["param1"]);
      vi.mocked(mockResolver.isGoalAwareEnabled).mockReturnValue(false); // Disable goal injection

      const aggregator = new Aggregator({ resolver: mockResolver });
      aggregator.registerClient(mockClient1 as UpstreamClient);

      const tools = await aggregator.listTools();

      // Should not crash, required should be empty array (no goal field since disabled)
      expect(tools[0].inputSchema.required || []).toHaveLength(0);
      expect(tools[0].inputSchema.properties).not.toHaveProperty("param1");
    });
  });

  describe("lookup methods", () => {
    it("should find tool by namespaced name", async () => {
      const tool: Tool = {
        name: "mytool",
        description: "My tool",
        inputSchema: { type: "object", properties: {} },
      };

      vi.mocked(mockClient1.listTools!).mockResolvedValue([tool]);

      const aggregator = new Aggregator({ resolver: mockResolver });
      aggregator.registerClient(mockClient1 as UpstreamClient);

      await aggregator.listTools(); // Trigger refresh

      const result = aggregator.findTool("server1__mytool");

      expect(result).toBeDefined();
      expect(result!.client).toBe(mockClient1);
      expect(result!.originalName).toBe("mytool");
    });

    it("should return null for non-existent tool", async () => {
      const aggregator = new Aggregator({ resolver: mockResolver });
      aggregator.registerClient(mockClient1 as UpstreamClient);

      await aggregator.listTools();

      const result = aggregator.findTool("nonexistent__tool");
      expect(result).toBeNull();
    });

    it("should find resource by namespaced URI", async () => {
      const resource: Resource = {
        uri: "file://doc.txt",
        name: "Document",
        mimeType: "text/plain",
      };

      vi.mocked(mockClient1.listResources!).mockResolvedValue([resource]);

      const aggregator = new Aggregator({ resolver: mockResolver });
      aggregator.registerClient(mockClient1 as UpstreamClient);

      await aggregator.listResources(); // Trigger refresh

      const result = aggregator.findResource("server1://file://doc.txt");

      expect(result).toBeDefined();
      expect(result!.client).toBe(mockClient1);
      expect(result!.originalUri).toBe("file://doc.txt");
    });

    it("should return null for non-existent resource", async () => {
      const aggregator = new Aggregator({ resolver: mockResolver });
      aggregator.registerClient(mockClient1 as UpstreamClient);

      await aggregator.listResources();

      const result = aggregator.findResource("server1://nonexistent");
      expect(result).toBeNull();
    });

    it("should find prompt by namespaced name", async () => {
      const prompt: Prompt = {
        name: "myprompt",
        description: "My prompt",
      };

      vi.mocked(mockClient1.listPrompts!).mockResolvedValue([prompt]);

      const aggregator = new Aggregator({ resolver: mockResolver });
      aggregator.registerClient(mockClient1 as UpstreamClient);

      await aggregator.listPrompts(); // Trigger refresh

      const result = aggregator.findPrompt("server1__myprompt");

      expect(result).toBeDefined();
      expect(result!.client).toBe(mockClient1);
      expect(result!.originalName).toBe("myprompt");
    });

    it("should return null for non-existent prompt", async () => {
      const aggregator = new Aggregator({ resolver: mockResolver });
      aggregator.registerClient(mockClient1 as UpstreamClient);

      await aggregator.listPrompts();

      const result = aggregator.findPrompt("server1__nonexistent");
      expect(result).toBeNull();
    });

    it("should return null when client not found in map", async () => {
      const tool: Tool = {
        name: "mytool",
        description: "My tool",
        inputSchema: { type: "object", properties: {} },
      };

      vi.mocked(mockClient1.listTools!).mockResolvedValue([tool]);

      const aggregator = new Aggregator({ resolver: mockResolver });
      aggregator.registerClient(mockClient1 as UpstreamClient);

      await aggregator.listTools(); // Trigger refresh

      // Now unregister the client
      aggregator.unregisterClient("server1");

      // Try to find the tool - should return null because client was removed
      const result = aggregator.findTool("server1__mytool");
      expect(result).toBeNull();
    });
  });

  describe("cache invalidation", () => {
    it("should refresh cache when calling listResources if cache invalid", async () => {
      const resource: Resource = {
        uri: "file://doc.txt",
        name: "doc",
        mimeType: "text/plain",
      };

      vi.mocked(mockClient1.listResources!).mockResolvedValue([resource]);

      const aggregator = new Aggregator({ resolver: mockResolver });
      aggregator.registerClient(mockClient1 as UpstreamClient);

      // First call triggers refresh
      const resources1 = await aggregator.listResources();
      expect(resources1).toHaveLength(1);
      expect(vi.mocked(mockClient1.listResources!).mock.calls.length).toBe(1);

      // Invalidate cache by registering another client
      aggregator.registerClient(mockClient2 as UpstreamClient);

      // Second call should trigger refresh again
      await aggregator.listResources();
      expect(vi.mocked(mockClient1.listResources!).mock.calls.length).toBe(2);
    });

    it("should refresh cache when calling listPrompts if cache invalid", async () => {
      const prompt: Prompt = {
        name: "myprompt",
        description: "My prompt",
      };

      vi.mocked(mockClient1.listPrompts!).mockResolvedValue([prompt]);

      const aggregator = new Aggregator({ resolver: mockResolver });
      aggregator.registerClient(mockClient1 as UpstreamClient);

      // First call triggers refresh
      const prompts1 = await aggregator.listPrompts();
      expect(prompts1).toHaveLength(1);
      expect(vi.mocked(mockClient1.listPrompts!).mock.calls.length).toBe(1);

      // Invalidate cache by registering another client
      aggregator.registerClient(mockClient2 as UpstreamClient);

      // Second call should trigger refresh again
      await aggregator.listPrompts();
      expect(vi.mocked(mockClient1.listPrompts!).mock.calls.length).toBe(2);
    });
  });

  describe("parameter overrides", () => {
    it("should get parameter overrides for a tool", () => {
      const overrides = { key: "value" };
      vi.mocked(mockResolver.getParameterOverrides).mockReturnValue(overrides);

      const aggregator = new Aggregator({ resolver: mockResolver });

      const result = aggregator.getParameterOverrides("server1__test");

      expect(result).toEqual(overrides);
      expect(mockResolver.getParameterOverrides).toHaveBeenCalledWith("server1__test");
    });
  });

  describe("upstream counts and details", () => {
    it("should return counts for specific upstream", async () => {
      const tool1: Tool = {
        name: "tool1",
        description: "Tool 1",
        inputSchema: { type: "object", properties: {} },
      };
      const tool2: Tool = {
        name: "tool2",
        description: "Tool 2",
        inputSchema: { type: "object", properties: {} },
      };
      const resource: Resource = {
        uri: "file://doc.txt",
        name: "Doc",
        mimeType: "text/plain",
      };

      vi.mocked(mockClient1.listTools!).mockResolvedValue([tool1, tool2]);
      vi.mocked(mockClient1.listResources!).mockResolvedValue([resource]);
      vi.mocked(mockClient2.listTools!).mockResolvedValue([tool1]);

      const aggregator = new Aggregator({ resolver: mockResolver });
      aggregator.registerClient(mockClient1 as UpstreamClient);
      aggregator.registerClient(mockClient2 as UpstreamClient);

      await aggregator.listTools(); // Trigger refresh

      const counts = aggregator.getUpstreamCounts("server1");

      expect(counts.tools).toBe(2);
      expect(counts.resources).toBe(1);
      expect(counts.prompts).toBe(0);
    });

    it("should return detailed items for specific upstream", async () => {
      const tool: Tool = {
        name: "tool1",
        description: "Tool 1",
        inputSchema: { type: "object", properties: {} },
      };

      vi.mocked(mockClient1.listTools!).mockResolvedValue([tool]);
      vi.mocked(mockClient2.listTools!).mockResolvedValue([tool]);

      const aggregator = new Aggregator({ resolver: mockResolver });
      aggregator.registerClient(mockClient1 as UpstreamClient);
      aggregator.registerClient(mockClient2 as UpstreamClient);

      await aggregator.listTools(); // Trigger refresh

      const details = aggregator.getUpstreamDetails("server1");

      expect(details.tools).toHaveLength(1);
      expect(details.tools[0].upstreamId).toBe("server1");
      expect(details.tools[0].name).toBe("server1__tool1");
      expect(details.tools[0].originalName).toBe("tool1");
    });
  });

  describe("getUpstreamCounts - prompts coverage", () => {
    it("should count prompts correctly for upstream", async () => {
      const client1: Partial<UpstreamClient> = {
        id: "client1",
        isConnected: true,
        listTools: vi.fn().mockResolvedValue([]),
        listResources: vi.fn().mockResolvedValue([]),
        listPrompts: vi.fn().mockResolvedValue([
          { name: "prompt1", description: "Prompt 1", arguments: [] },
          { name: "prompt2", description: "Prompt 2", arguments: [] },
        ]),
      };

      const client2: Partial<UpstreamClient> = {
        id: "client2",
        isConnected: true,
        listTools: vi.fn().mockResolvedValue([]),
        listResources: vi.fn().mockResolvedValue([]),
        listPrompts: vi.fn().mockResolvedValue([
          { name: "prompt3", description: "Prompt 3", arguments: [] },
        ]),
      };

      const aggregator = new Aggregator({ resolver: mockResolver });
      aggregator.registerClient(client1 as UpstreamClient);
      aggregator.registerClient(client2 as UpstreamClient);
      await aggregator.refresh();

      const counts1 = aggregator.getUpstreamCounts("client1");
      const counts2 = aggregator.getUpstreamCounts("client2");

      expect(counts1.prompts).toBe(2);
      expect(counts2.prompts).toBe(1);
    });
  });

  describe("getUpstreamDetails - full coverage", () => {
    it("should return resources and prompts for upstream", async () => {
      const client: Partial<UpstreamClient> = {
        id: "test-client",
        isConnected: true,
        listTools: vi.fn().mockResolvedValue([]),
        listResources: vi.fn().mockResolvedValue([
          { uri: "file://test.txt", name: "Test File", mimeType: "text/plain" },
        ]),
        listPrompts: vi.fn().mockResolvedValue([
          { name: "test-prompt", description: "Test Prompt", arguments: [] },
        ]),
      };

      const aggregator = new Aggregator({ resolver: mockResolver });
      aggregator.registerClient(client as UpstreamClient);
      await aggregator.refresh();

      const details = aggregator.getUpstreamDetails("test-client");

      expect(details.resources).toHaveLength(1);
      expect(details.resources[0].upstreamId).toBe("test-client");
      expect(details.resources[0].uri).toContain("test-client://");

      expect(details.prompts).toHaveLength(1);
      expect(details.prompts[0].upstreamId).toBe("test-client");
      expect(details.prompts[0].name).toBe("test-client__test-prompt");
    });

    it("should filter correctly by upstream ID", async () => {
      const client1: Partial<UpstreamClient> = {
        id: "client1",
        isConnected: true,
        listTools: vi.fn().mockResolvedValue([
          { name: "tool1", description: "Tool 1", inputSchema: { type: "object" } },
        ]),
        listResources: vi.fn().mockResolvedValue([
          { uri: "file://1.txt", name: "File 1", mimeType: "text/plain" },
        ]),
        listPrompts: vi.fn().mockResolvedValue([
          { name: "prompt1", description: "Prompt 1", arguments: [] },
        ]),
      };

      const client2: Partial<UpstreamClient> = {
        id: "client2",
        isConnected: true,
        listTools: vi.fn().mockResolvedValue([
          { name: "tool2", description: "Tool 2", inputSchema: { type: "object" } },
        ]),
        listResources: vi.fn().mockResolvedValue([
          { uri: "file://2.txt", name: "File 2", mimeType: "text/plain" },
        ]),
        listPrompts: vi.fn().mockResolvedValue([
          { name: "prompt2", description: "Prompt 2", arguments: [] },
        ]),
      };

      const aggregator = new Aggregator({ resolver: mockResolver });
      aggregator.registerClient(client1 as UpstreamClient);
      aggregator.registerClient(client2 as UpstreamClient);
      await aggregator.refresh();

      const details1 = aggregator.getUpstreamDetails("client1");
      const details2 = aggregator.getUpstreamDetails("client2");

      // Client 1 should only have its own items
      expect(details1.tools).toHaveLength(1);
      expect(details1.tools[0].originalName).toBe("tool1");
      expect(details1.resources).toHaveLength(1);
      expect(details1.resources[0].originalUri).toBe("file://1.txt");
      expect(details1.prompts).toHaveLength(1);
      expect(details1.prompts[0].originalName).toBe("prompt1");

      // Client 2 should only have its own items
      expect(details2.tools).toHaveLength(1);
      expect(details2.tools[0].originalName).toBe("tool2");
      expect(details2.resources).toHaveLength(1);
      expect(details2.resources[0].originalUri).toBe("file://2.txt");
      expect(details2.prompts).toHaveLength(1);
      expect(details2.prompts[0].originalName).toBe("prompt2");
    });
  });
});
