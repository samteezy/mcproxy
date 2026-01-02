import winston from "winston";
import Transport from "winston-transport";
import type { LogEntry } from "./types.js";

let logger: winston.Logger | null = null;
let streamingTransport: StreamingTransport | null = null;

/**
 * Custom Winston transport that buffers logs and allows real-time subscription
 */
class StreamingTransport extends Transport {
  private buffer: LogEntry[] = [];
  private maxBufferSize: number;
  private subscribers: Set<(entry: LogEntry) => void> = new Set();

  constructor(opts?: Transport.TransportStreamOptions & { maxBufferSize?: number }) {
    super(opts);
    this.maxBufferSize = opts?.maxBufferSize ?? 1000;
  }

  log(info: { timestamp?: string; level: string; message: string; [key: string]: unknown }, callback: () => void): void {
    setImmediate(() => this.emit("logged", info));

    const { timestamp, level, message, ...rest } = info;
    const entry: LogEntry = {
      timestamp: timestamp ?? new Date().toISOString(),
      level,
      message,
      meta: Object.keys(rest).length > 0 ? rest as Record<string, unknown> : undefined,
    };

    // Add to circular buffer
    this.buffer.push(entry);
    if (this.buffer.length > this.maxBufferSize) {
      this.buffer.shift();
    }

    // Notify all subscribers
    this.subscribers.forEach((cb) => {
      try {
        cb(entry);
      } catch {
        // Ignore subscriber errors
      }
    });

    callback();
  }

  /**
   * Subscribe to new log entries
   * @returns Unsubscribe function
   */
  subscribe(callback: (entry: LogEntry) => void): () => void {
    this.subscribers.add(callback);
    return () => this.subscribers.delete(callback);
  }

  /**
   * Get recent log entries from buffer
   */
  getRecentLogs(count?: number): LogEntry[] {
    return count ? this.buffer.slice(-count) : [...this.buffer];
  }

  /**
   * Clear the buffer
   */
  clearBuffer(): void {
    this.buffer = [];
  }
}

/**
 * Initialize the logger with the specified level
 */
export function initLogger(level: string = "info"): winston.Logger {
  // Create the streaming transport
  streamingTransport = new StreamingTransport({ level });

  logger = winston.createLogger({
    level,
    format: winston.format.combine(
      winston.format.timestamp(),
      winston.format.errors({ stack: true }),
      winston.format.printf(({ timestamp, level, message, ...meta }) => {
        const metaStr = Object.keys(meta).length
          ? ` ${JSON.stringify(meta)}`
          : "";
        return `[${timestamp}] ${level.toUpperCase()}: ${message}${metaStr}`;
      })
    ),
    transports: [
      new winston.transports.Console(),
      streamingTransport,
    ],
  });

  return logger;
}

/**
 * Get the logger instance
 */
export function getLogger(): winston.Logger {
  if (!logger) {
    return initLogger();
  }
  return logger;
}

/**
 * Get the streaming transport for log subscriptions
 */
export function getStreamingTransport(): StreamingTransport | null {
  return streamingTransport;
}
