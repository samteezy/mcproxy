import { describe, it, expect } from "vitest";
import * as index from "./index.js";

describe("Module Exports", () => {
  describe("main exports", () => {
    it("should export createProxy function", () => {
      expect(index.createProxy).toBeDefined();
      expect(typeof index.createProxy).toBe("function");
    });
  });

  describe("configuration exports", () => {
    it("should export loadConfig function", () => {
      expect(index.loadConfig).toBeDefined();
      expect(typeof index.loadConfig).toBe("function");
    });

    it("should export generateExampleConfig function", () => {
      expect(index.generateExampleConfig).toBeDefined();
      expect(typeof index.generateExampleConfig).toBe("function");
    });
  });

  describe("component exports", () => {
    it("should export UpstreamClient class", () => {
      expect(index.UpstreamClient).toBeDefined();
      expect(typeof index.UpstreamClient).toBe("function");
    });

    it("should export DownstreamServer class", () => {
      expect(index.DownstreamServer).toBeDefined();
      expect(typeof index.DownstreamServer).toBe("function");
    });

    it("should export Aggregator class", () => {
      expect(index.Aggregator).toBeDefined();
      expect(typeof index.Aggregator).toBe("function");
    });

    it("should export Router class", () => {
      expect(index.Router).toBeDefined();
      expect(typeof index.Router).toBe("function");
    });

    it("should export Compressor class", () => {
      expect(index.Compressor).toBeDefined();
      expect(typeof index.Compressor).toBe("function");
    });

    it("should export MemoryCache class", () => {
      expect(index.MemoryCache).toBeDefined();
      expect(typeof index.MemoryCache).toBe("function");
    });
  });

  describe("logger exports", () => {
    it("should export initLogger function", () => {
      expect(index.initLogger).toBeDefined();
      expect(typeof index.initLogger).toBe("function");
    });

    it("should export getLogger function", () => {
      expect(index.getLogger).toBeDefined();
      expect(typeof index.getLogger).toBe("function");
    });
  });

  describe("complete module structure", () => {
    it("should only export expected keys", () => {
      const exports = Object.keys(index);
      const expected = [
        "createProxy",
        "loadConfig",
        "generateExampleConfig",
        "UpstreamClient",
        "DownstreamServer",
        "Aggregator",
        "Router",
        "Compressor",
        "MemoryCache",
        "initLogger",
        "getLogger",
      ];

      expected.forEach((key) => {
        expect(exports).toContain(key);
      });
    });

    it("should have all exports defined and not null", () => {
      Object.entries(index).forEach(([_key, value]) => {
        expect(value).toBeDefined();
        expect(value).not.toBeNull();
      });
    });
  });

  describe("export types", () => {
    it("should export functions for proxy operations", () => {
      expect(typeof index.createProxy).toBe("function");
      expect(typeof index.loadConfig).toBe("function");
      expect(typeof index.generateExampleConfig).toBe("function");
    });

    it("should export constructor functions for components", () => {
      const constructors = [
        index.UpstreamClient,
        index.DownstreamServer,
        index.Aggregator,
        index.Router,
        index.Compressor,
        index.MemoryCache,
      ];

      constructors.forEach((Constructor) => {
        expect(typeof Constructor).toBe("function");
        // Constructor functions should have a prototype
        expect(Constructor.prototype).toBeDefined();
      });
    });

    it("should export functions for logger", () => {
      expect(typeof index.initLogger).toBe("function");
      expect(typeof index.getLogger).toBe("function");
    });
  });
});
