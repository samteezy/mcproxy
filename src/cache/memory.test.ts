import { describe, it, expect, beforeEach } from "vitest";
import {
  MemoryCache,
  toolCacheKey,
  resourceCacheKey,
  normalizeGoal,
  compressedResultCacheKey,
} from "./memory.js";

describe("MemoryCache", () => {
  let cache: MemoryCache<string>;

  beforeEach(() => {
    cache = new MemoryCache({ maxEntries: 100 });
  });

  it("should store and retrieve values", () => {
    cache.set("key1", "value1", 60);
    expect(cache.get("key1")).toBe("value1");
  });

  it("should return undefined for missing keys", () => {
    expect(cache.get("nonexistent")).toBeUndefined();
  });

  it("should expire entries after TTL", async () => {
    const shortTtlCache = new MemoryCache<string>({
      maxEntries: 100,
    });
    shortTtlCache.set("key1", "value1", 0.1); // 100ms TTL
    expect(shortTtlCache.get("key1")).toBe("value1");

    await new Promise((resolve) => setTimeout(resolve, 150));
    expect(shortTtlCache.get("key1")).toBeUndefined();
  });

  it("should respect custom TTL per entry", async () => {
    cache.set("short", "value", 0.1); // 100ms
    cache.set("long", "value", 10); // 10 seconds

    await new Promise((resolve) => setTimeout(resolve, 150));
    expect(cache.get("short")).toBeUndefined();
    expect(cache.get("long")).toBe("value");
  });

  it("should evict oldest entry when max entries exceeded", () => {
    const smallCache = new MemoryCache<string>({
      maxEntries: 2,
    });
    smallCache.set("key1", "value1", 60);
    smallCache.set("key2", "value2", 60);
    smallCache.set("key3", "value3", 60);

    expect(smallCache.get("key1")).toBeUndefined();
    expect(smallCache.get("key2")).toBe("value2");
    expect(smallCache.get("key3")).toBe("value3");
  });

  it("should clear all entries", () => {
    cache.set("key1", "value1", 60);
    cache.set("key2", "value2", 60);
    cache.clear();
    expect(cache.get("key1")).toBeUndefined();
    expect(cache.get("key2")).toBeUndefined();
    expect(cache.size).toBe(0);
  });

  it("should delete specific entries", () => {
    cache.set("key1", "value1", 60);
    cache.set("key2", "value2", 60);
    expect(cache.delete("key1")).toBe(true);
    expect(cache.get("key1")).toBeUndefined();
    expect(cache.get("key2")).toBe("value2");
  });

  it("should report has correctly", () => {
    cache.set("key1", "value1", 60);
    expect(cache.has("key1")).toBe(true);
    expect(cache.has("nonexistent")).toBe(false);
  });

  it("should cleanup expired entries", async () => {
    const shortTtlCache = new MemoryCache<string>({
      maxEntries: 100,
    });
    shortTtlCache.set("key1", "value1", 0.1); // 100ms TTL
    shortTtlCache.set("key2", "value2", 0.1); // 100ms TTL

    await new Promise((resolve) => setTimeout(resolve, 150));
    const removed = shortTtlCache.cleanup();
    expect(removed).toBe(2);
    expect(shortTtlCache.size).toBe(0);
  });

  it("should update config and clear cache", () => {
    cache.set("key1", "value1", 60);
    cache.updateConfig({ maxEntries: 200 });
    // updateConfig clears the cache
    expect(cache.get("key1")).toBeUndefined();
  });
});

describe("toolCacheKey", () => {
  it("should generate consistent keys for same inputs", () => {
    const key1 = toolCacheKey("myTool", { a: 1, b: 2 });
    const key2 = toolCacheKey("myTool", { a: 1, b: 2 });
    expect(key1).toBe(key2);
  });

  it("should generate same key regardless of argument order", () => {
    const key1 = toolCacheKey("myTool", { a: 1, b: 2 });
    const key2 = toolCacheKey("myTool", { b: 2, a: 1 });
    expect(key1).toBe(key2);
  });

  it("should generate different keys for different tools", () => {
    const key1 = toolCacheKey("tool1", { a: 1 });
    const key2 = toolCacheKey("tool2", { a: 1 });
    expect(key1).not.toBe(key2);
  });

  it("should generate different keys for different arguments", () => {
    const key1 = toolCacheKey("myTool", { a: 1 });
    const key2 = toolCacheKey("myTool", { a: 2 });
    expect(key1).not.toBe(key2);
  });
});

describe("resourceCacheKey", () => {
  it("should generate correct key format", () => {
    expect(resourceCacheKey("file:///path/to/file")).toBe(
      "resource:file:///path/to/file"
    );
  });
});

describe("normalizeGoal", () => {
  it("should convert to lowercase", () => {
    expect(normalizeGoal("Find API Endpoints")).toBe("find api endpoints");
  });

  it("should remove punctuation", () => {
    expect(normalizeGoal("What's the API?")).toBe("whats the api");
  });

  it("should trim whitespace", () => {
    expect(normalizeGoal("  find endpoints  ")).toBe("find endpoints");
  });

  it("should preserve internal spaces", () => {
    expect(normalizeGoal("find the api endpoints")).toBe("find the api endpoints");
  });

  it("should handle empty string", () => {
    expect(normalizeGoal("")).toBe("");
  });

  it("should normalize various punctuation", () => {
    expect(normalizeGoal("Hello, world! How are you?")).toBe(
      "hello world how are you"
    );
  });

  it("should preserve numbers", () => {
    expect(normalizeGoal("Find endpoint v2")).toBe("find endpoint v2");
  });
});

describe("compressedResultCacheKey", () => {
  it("should generate key without goal", () => {
    const key = compressedResultCacheKey("myTool", { a: 1 });
    expect(key).toContain("compressed:myTool:");
    expect(key).not.toContain("::");
  });

  it("should generate key with goal", () => {
    const key = compressedResultCacheKey("myTool", { a: 1 }, "Find endpoints");
    expect(key).toContain("compressed:myTool:");
    expect(key).toContain(":find endpoints");
  });

  it("should normalize goal in key", () => {
    const key1 = compressedResultCacheKey("myTool", { a: 1 }, "Find Endpoints!");
    const key2 = compressedResultCacheKey("myTool", { a: 1 }, "find endpoints");
    expect(key1).toBe(key2);
  });

  it("should generate same key regardless of argument order", () => {
    const key1 = compressedResultCacheKey("myTool", { a: 1, b: 2 }, "goal");
    const key2 = compressedResultCacheKey("myTool", { b: 2, a: 1 }, "goal");
    expect(key1).toBe(key2);
  });

  it("should generate different keys for different goals", () => {
    const key1 = compressedResultCacheKey("myTool", { a: 1 }, "goal1");
    const key2 = compressedResultCacheKey("myTool", { a: 1 }, "goal2");
    expect(key1).not.toBe(key2);
  });

  it("should generate different keys for goal vs no goal", () => {
    const key1 = compressedResultCacheKey("myTool", { a: 1 });
    const key2 = compressedResultCacheKey("myTool", { a: 1 }, "some goal");
    expect(key1).not.toBe(key2);
  });

  it("should handle complex nested arguments in compressed cache key", () => {
    const args = {
      nested: {
        deep: {
          value: 123,
        },
        array: [1, 2, 3],
      },
    };
    const key = compressedResultCacheKey("tool", args, "goal");
    expect(key).toContain("tool");
    expect(key).toBeDefined();
  });

  it("should handle array arguments in compressed cache key", () => {
    const key1 = compressedResultCacheKey("tool", { items: [1, 2, 3] }, "goal");
    const key2 = compressedResultCacheKey("tool", { items: [3, 2, 1] }, "goal");
    // Arrays in different order should generate different keys
    expect(key1).not.toBe(key2);
  });
});

describe("MemoryCache - Additional Edge Cases", () => {
  it("should handle size property correctly", () => {
    const cache = new MemoryCache<string>({
      maxEntries: 100,
    });

    expect(cache.size).toBe(0);
    cache.set("key1", "value1", 60);
    expect(cache.size).toBe(1);
    cache.set("key2", "value2", 60);
    expect(cache.size).toBe(2);
    cache.delete("key1");
    expect(cache.size).toBe(1);
    cache.clear();
    expect(cache.size).toBe(0);
  });

  it("should update config and clear cache", () => {
    const cache = new MemoryCache<string>({
      maxEntries: 100,
    });

    cache.set("key1", "value1", 60);
    expect(cache.get("key1")).toBe("value1");

    // Update config (clears cache)
    cache.updateConfig({ maxEntries: 200 });

    // Cache should be cleared
    expect(cache.get("key1")).toBeUndefined();
  });

  it("should handle multiple cleanup calls", () => {
    const cache = new MemoryCache<string>({
      maxEntries: 100,
    });

    cache.set("key1", "value1", 0.1); // 100ms TTL
    cache.set("key2", "value2", 0.1); // 100ms TTL

    // Multiple cleanup calls should not cause errors
    cache.cleanup();
    cache.cleanup();
    cache.cleanup();

    expect(true).toBe(true); // No errors thrown
  });

  it("should return false when deleting non-existent key", () => {
    const cache = new MemoryCache<string>({
      maxEntries: 100,
    });

    expect(cache.delete("nonexistent")).toBe(false);
  });

  it("should handle setting same key multiple times", () => {
    const cache = new MemoryCache<string>({
      maxEntries: 100,
    });

    cache.set("key1", "value1", 60);
    expect(cache.get("key1")).toBe("value1");
    expect(cache.size).toBe(1);

    cache.set("key1", "value2", 60);
    expect(cache.get("key1")).toBe("value2");
    expect(cache.size).toBe(1); // Size should still be 1
  });

  it("should handle resourceCacheKey with uri", () => {
    const key1 = resourceCacheKey("file://test.txt");
    const key2 = resourceCacheKey("file://test.txt");
    const key3 = resourceCacheKey("file://other.txt");

    expect(key1).toBe(key2);
    expect(key1).not.toBe(key3);
    expect(key1).toContain("file://test.txt");
  });
});
