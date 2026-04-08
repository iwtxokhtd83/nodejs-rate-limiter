export interface RateLimitResult {
  /** Whether the request is allowed */
  allowed: boolean;
  /** Remaining tokens/requests in the current window */
  remaining: number;
  /** Total limit */
  limit: number;
  /** Unix timestamp (ms) when the limit resets */
  resetAt: number;
  /** Retry after (ms), 0 if allowed */
  retryAfter: number;
}

export interface Store {
  /**
   * Attempt to consume a token for the given key.
   * Returns the rate limit result.
   */
  consume(key: string): Promise<RateLimitResult>;

  /**
   * Reset the rate limit state for a key.
   */
  reset(key: string): Promise<void>;

  /**
   * Close/cleanup the store (e.g., disconnect Redis).
   */
  close(): Promise<void>;
}

export type Algorithm = 'token-bucket' | 'sliding-window';

export interface RateLimiterOptions {
  /** Algorithm to use. Default: 'sliding-window' */
  algorithm?: Algorithm;
  /** Maximum number of requests allowed in the window */
  limit: number;
  /** Time window in milliseconds */
  window: number;
  /** Key prefix for Redis store. Default: 'rl:' */
  prefix?: string;
}

export interface RedisStoreOptions extends RateLimiterOptions {
  /** ioredis client instance */
  client: RedisLike;
}

/** Minimal interface for Redis-compatible clients (ioredis, etc.) */
export interface RedisLike {
  eval(...args: any[]): Promise<any>;
  del(...keys: string[]): Promise<number>;
}
