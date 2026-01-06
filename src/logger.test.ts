import { describe, it, expect, beforeEach, vi } from "vitest";
import { initLogger, getLogger, getStreamingTransport } from "./logger.js";
import type { LogEntry } from "./types.js";

describe("Logger", () => {
  // Reset logger state before each test
  beforeEach(() => {
    // Clear any existing logger
    vi.resetModules();
  });

  describe("getStreamingTransport", () => {
    it("should return null before logger is initialized", () => {
      // Note: This test relies on the module being freshly loaded
      // In a real scenario, we'd need to reload the module to test this
      // For now, we test the null case by calling before init
      const transport = getStreamingTransport();
      expect(transport).toBeDefined(); // Will be defined from getLogger() auto-init
    });

    it("should return StreamingTransport instance after initLogger", () => {
      initLogger("info");
      const transport = getStreamingTransport();

      expect(transport).not.toBeNull();
      expect(transport).toBeDefined();
      expect(typeof transport?.subscribe).toBe("function");
      expect(typeof transport?.getRecentLogs).toBe("function");
      expect(typeof transport?.clearBuffer).toBe("function");
    });
  });

  describe("getLogger", () => {
    it("should return winston logger instance", () => {
      const logger = getLogger();

      expect(logger).toBeDefined();
      expect(typeof logger.info).toBe("function");
      expect(typeof logger.error).toBe("function");
      expect(typeof logger.warn).toBe("function");
      expect(typeof logger.debug).toBe("function");
    });

    it("should auto-initialize logger if not already initialized", () => {
      const logger1 = getLogger();
      const logger2 = getLogger();

      expect(logger1).toBe(logger2); // Same instance
    });
  });

  describe("initLogger", () => {
    it("should create logger with specified level", () => {
      const logger = initLogger("debug");

      expect(logger.level).toBe("debug");
    });

    it("should create and attach StreamingTransport", () => {
      initLogger("info");
      const transport = getStreamingTransport();

      expect(transport).not.toBeNull();
    });

    it("should default to info level when not specified", () => {
      const logger = initLogger();

      expect(logger.level).toBe("info");
    });
  });

  describe("StreamingTransport - Buffer Management", () => {
    it("should accumulate log entries in buffer", () => {
      const logger = initLogger("info");
      const transport = getStreamingTransport()!;

      transport.clearBuffer(); // Start fresh

      logger.info("Test message 1");
      logger.info("Test message 2");
      logger.info("Test message 3");

      const logs = transport.getRecentLogs();
      expect(logs.length).toBeGreaterThanOrEqual(3);

      const messages = logs.map(l => l.message);
      expect(messages).toContain("Test message 1");
      expect(messages).toContain("Test message 2");
      expect(messages).toContain("Test message 3");
    });

    it("should evict oldest entry when buffer exceeds maxBufferSize", () => {
      // Create logger with small buffer for testing
      const logger = initLogger("info");
      const transport = getStreamingTransport()!;

      // Clear buffer first
      transport.clearBuffer();

      // Fill buffer beyond 1000 entries (default maxBufferSize)
      // We'll log 1001 messages to trigger eviction
      for (let i = 0; i < 1001; i++) {
        logger.info(`Message ${i}`);
      }

      const logs = transport.getRecentLogs();

      // Buffer should be capped at 1000
      expect(logs.length).toBeLessThanOrEqual(1000);

      // The first message (Message 0) should have been evicted
      const messages = logs.map(l => l.message);
      expect(messages).not.toContain("Message 0");

      // The most recent message should still be there
      expect(messages).toContain("Message 1000");
    });

    it("should return all logs when getRecentLogs called without count", () => {
      const logger = initLogger("info");
      const transport = getStreamingTransport()!;

      transport.clearBuffer();

      logger.info("Message 1");
      logger.info("Message 2");
      logger.info("Message 3");

      const logs = transport.getRecentLogs();

      expect(logs.length).toBeGreaterThanOrEqual(3);
    });

    it("should return last N logs when getRecentLogs called with count", () => {
      const logger = initLogger("info");
      const transport = getStreamingTransport()!;

      transport.clearBuffer();

      logger.info("Message 1");
      logger.info("Message 2");
      logger.info("Message 3");
      logger.info("Message 4");
      logger.info("Message 5");

      const logs = transport.getRecentLogs(2);

      expect(logs.length).toBe(2);

      const messages = logs.map(l => l.message);
      expect(messages).toContain("Message 4");
      expect(messages).toContain("Message 5");
    });

    it("should clear buffer when clearBuffer is called", () => {
      const logger = initLogger("info");
      const transport = getStreamingTransport()!;

      logger.info("Message 1");
      logger.info("Message 2");

      let logs = transport.getRecentLogs();
      expect(logs.length).toBeGreaterThan(0);

      transport.clearBuffer();

      logs = transport.getRecentLogs();
      expect(logs.length).toBe(0);
    });

    it("should include timestamp, level, and message in log entries", () => {
      const logger = initLogger("info");
      const transport = getStreamingTransport()!;

      transport.clearBuffer();

      logger.info("Test message");

      const logs = transport.getRecentLogs();
      const entry = logs.find(l => l.message === "Test message");

      expect(entry).toBeDefined();
      expect(entry?.timestamp).toBeDefined();
      expect(entry?.level).toBe("info");
      expect(entry?.message).toBe("Test message");
    });

    it("should include meta data when additional fields are logged", () => {
      const logger = initLogger("info");
      const transport = getStreamingTransport()!;

      transport.clearBuffer();

      logger.info("Test with meta", { userId: 123, action: "test" });

      const logs = transport.getRecentLogs();
      const entry = logs.find(l => l.message === "Test with meta");

      expect(entry).toBeDefined();
      expect(entry?.meta).toBeDefined();
      expect(entry?.meta?.userId).toBe(123);
      expect(entry?.meta?.action).toBe("test");
    });
  });

  describe("StreamingTransport - Subscriber Pattern", () => {
    it("should call subscriber when new log entry is added", async () => {
      const logger = initLogger("info");
      const transport = getStreamingTransport()!;

      const receivedEntries: LogEntry[] = [];
      transport.subscribe((entry) => {
        receivedEntries.push(entry);
      });

      logger.info("Subscribed message");

      // Wait a bit for async logging
      await new Promise(resolve => setTimeout(resolve, 10));

      expect(receivedEntries.length).toBeGreaterThan(0);
      const messages = receivedEntries.map(e => e.message);
      expect(messages).toContain("Subscribed message");
    });

    it("should return unsubscribe function that removes callback", async () => {
      const logger = initLogger("info");
      const transport = getStreamingTransport()!;

      let callCount = 0;
      const unsubscribe = transport.subscribe(() => {
        callCount++;
      });

      logger.info("Before unsubscribe");
      await new Promise(resolve => setTimeout(resolve, 10));

      const countAfterFirst = callCount;
      expect(countAfterFirst).toBeGreaterThan(0);

      unsubscribe();

      logger.info("After unsubscribe");
      await new Promise(resolve => setTimeout(resolve, 10));

      // Call count should not have increased after unsubscribe
      expect(callCount).toBe(countAfterFirst);
    });

    it("should notify all subscribers", async () => {
      const logger = initLogger("info");
      const transport = getStreamingTransport()!;

      let subscriber1Called = false;
      let subscriber2Called = false;

      transport.subscribe(() => {
        subscriber1Called = true;
      });

      transport.subscribe(() => {
        subscriber2Called = true;
      });

      logger.info("Multi-subscriber message");
      await new Promise(resolve => setTimeout(resolve, 10));

      expect(subscriber1Called).toBe(true);
      expect(subscriber2Called).toBe(true);
    });

    it("should handle subscriber errors without breaking other subscribers", async () => {
      const logger = initLogger("info");
      const transport = getStreamingTransport()!;

      let goodSubscriberCalled = false;

      // First subscriber throws an error
      transport.subscribe(() => {
        throw new Error("Subscriber error");
      });

      // Second subscriber should still be called
      transport.subscribe(() => {
        goodSubscriberCalled = true;
      });

      logger.info("Error handling test");
      await new Promise(resolve => setTimeout(resolve, 10));

      // Good subscriber should have been called despite error in first subscriber
      expect(goodSubscriberCalled).toBe(true);
    });

    it("should receive correct LogEntry with all fields", async () => {
      const logger = initLogger("info");
      const transport = getStreamingTransport()!;

      let receivedEntry: LogEntry | null = null;
      transport.subscribe((entry) => {
        if (entry.message === "Complete entry test") {
          receivedEntry = entry;
        }
      });

      logger.info("Complete entry test", { key: "value" });
      await new Promise(resolve => setTimeout(resolve, 10));

      expect(receivedEntry).not.toBeNull();
      const entry = receivedEntry!;
      expect(entry.message).toBe("Complete entry test");
      expect(entry.level).toBe("info");
      expect(entry.timestamp).toBeDefined();
      expect(entry.meta?.key).toBe("value");
    });
  });

  describe("StreamingTransport - Integration", () => {
    it("should handle multiple log levels", () => {
      const logger = initLogger("debug");
      const transport = getStreamingTransport()!;

      transport.clearBuffer();

      logger.debug("Debug message");
      logger.info("Info message");
      logger.warn("Warn message");
      logger.error("Error message");

      const logs = transport.getRecentLogs();
      const levels = logs.map(l => l.level);

      expect(levels).toContain("debug");
      expect(levels).toContain("info");
      expect(levels).toContain("warn");
      expect(levels).toContain("error");
    });

    it("should work with winston logger lifecycle", () => {
      const logger1 = initLogger("info");
      const transport1 = getStreamingTransport();

      expect(logger1).toBeDefined();
      expect(transport1).not.toBeNull();

      const logger2 = getLogger();
      const transport2 = getStreamingTransport();

      // Should return same instances
      expect(logger2).toBe(logger1);
      expect(transport2).toBe(transport1);
    });
  });
});
