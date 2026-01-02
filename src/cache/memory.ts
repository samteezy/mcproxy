import type { CacheConfig, CacheEntry } from "../types.js";
import { getLogger } from "../logger.js";

/**
 * In-memory cache with TTL and max entries
 */
export class MemoryCache<T> {
  private cache: Map<string, CacheEntry<T>> = new Map();
  private config: CacheConfig;

  constructor(config: CacheConfig) {
    this.config = config;
  }

  /**
   * Update the cache configuration (used during hot reload)
   */
  updateConfig(config: CacheConfig): void {
    this.config = config;
    if (!config.enabled) {
      this.clear();
    }
  }

  /**
   * Get a value from the cache
   */
  get(key: string): T | undefined {
    if (!this.config.enabled) {
      return undefined;
    }

    const entry = this.cache.get(key);
    if (!entry) {
      return undefined;
    }

    // Check if expired
    if (Date.now() - entry.timestamp > entry.ttl) {
      this.cache.delete(key);
      return undefined;
    }

    return entry.value;
  }

  /**
   * Set a value in the cache
   */
  set(key: string, value: T, ttlSeconds?: number): void {
    if (!this.config.enabled) {
      return;
    }

    const logger = getLogger();

    // Enforce max entries
    if (this.cache.size >= this.config.maxEntries) {
      this.evictOldest();
    }

    const ttl = (ttlSeconds ?? this.config.ttlSeconds) * 1000;
    this.cache.set(key, {
      value,
      timestamp: Date.now(),
      ttl,
    });

    logger.debug(`Cached key: ${key} (TTL: ${ttl}ms)`);
  }

  /**
   * Delete a value from the cache
   */
  delete(key: string): boolean {
    return this.cache.delete(key);
  }

  /**
   * Check if a key exists (and is not expired)
   */
  has(key: string): boolean {
    return this.get(key) !== undefined;
  }

  /**
   * Clear the entire cache
   */
  clear(): void {
    this.cache.clear();
  }

  /**
   * Get the current cache size
   */
  get size(): number {
    return this.cache.size;
  }

  /**
   * Evict the oldest entry
   */
  private evictOldest(): void {
    const logger = getLogger();
    let oldestKey: string | null = null;
    let oldestTime = Infinity;

    for (const [key, entry] of this.cache) {
      if (entry.timestamp < oldestTime) {
        oldestTime = entry.timestamp;
        oldestKey = key;
      }
    }

    if (oldestKey) {
      this.cache.delete(oldestKey);
      logger.debug(`Evicted oldest cache entry: ${oldestKey}`);
    }
  }

  /**
   * Clean up expired entries
   */
  cleanup(): number {
    const logger = getLogger();
    const now = Date.now();
    let removed = 0;

    for (const [key, entry] of this.cache) {
      if (now - entry.timestamp > entry.ttl) {
        this.cache.delete(key);
        removed++;
      }
    }

    if (removed > 0) {
      logger.debug(`Cleaned up ${removed} expired cache entries`);
    }

    return removed;
  }
}

/**
 * Generate a cache key from a tool call
 */
export function toolCacheKey(
  toolName: string,
  args: Record<string, unknown>
): string {
  const argsHash = JSON.stringify(args, Object.keys(args).sort());
  return `tool:${toolName}:${argsHash}`;
}

/**
 * Generate a cache key from a resource read
 */
export function resourceCacheKey(uri: string): string {
  return `resource:${uri}`;
}
