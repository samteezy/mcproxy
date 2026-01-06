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
   * Note: enabled/ttlSeconds are now policy-level, resolved per-tool
   */
  updateConfig(config: CacheConfig): void {
    this.config = config;
    // Clear cache on config reload to ensure fresh state
    this.clear();
  }

  /**
   * Get a value from the cache
   */
  get(key: string): T | undefined {
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
   * Note: ttlSeconds is now required (resolved per-tool via policy)
   */
  set(key: string, value: T, ttlSeconds: number): void {
    const logger = getLogger();

    // Enforce max entries
    if (this.cache.size >= this.config.maxEntries) {
      this.evictOldest();
    }

    const ttl = ttlSeconds * 1000;
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
    const logger = getLogger();
    const size = this.cache.size;
    this.cache.clear();
    logger.info(`Cleared ${size} cache entries`);
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
 * Delegates to compressedResultCacheKey for consistency
 */
export function toolCacheKey(
  toolName: string,
  args: Record<string, unknown>
): string {
  return compressedResultCacheKey(toolName, args);
}

/**
 * Generate a cache key from a resource read
 */
export function resourceCacheKey(uri: string): string {
  return `resource:${uri}`;
}

/**
 * Normalize a goal string for cache key consistency
 * Converts to lowercase and removes punctuation
 */
export function normalizeGoal(goal: string): string {
  return goal.toLowerCase().replace(/[^\w\s]/g, "").trim();
}

/**
 * Generate a cache key for compressed tool responses
 * Includes normalized goal for goal-aware compression caching
 */
export function compressedResultCacheKey(
  toolName: string,
  args: Record<string, unknown>,
  goal?: string
): string {
  const argsHash = JSON.stringify(args, Object.keys(args).sort());
  const goalPart = goal ? `:${normalizeGoal(goal)}` : "";
  return `compressed:${toolName}:${argsHash}${goalPart}`;
}
