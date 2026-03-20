import type { Store, RateLimitResult, RateLimiterOptions, RedisStoreOptions, Algorithm } from './types';
import { MemoryStore } from './stores/memory-store';
import { RedisStore } from './stores/redis-store';

export class RateLimiter {
  private store: Store;

  constructor(private options: RateLimiterOptions | RedisStoreOptions) {
    if ('client' in options && options.client) {
      this.store = new RedisStore(options as RedisStoreOptions);
    } else {
      this.store = new MemoryStore(options);
    }
  }

  /**
   * Attempt to consume a token for the given key.
   * Returns rate limit metadata including whether the request is allowed.
   */
  async consume(key: string): Promise<RateLimitResult> {
    return this.store.consume(key);
  }

  /**
   * Reset the rate limit state for a given key.
   */
  async reset(key: string): Promise<void> {
    return this.store.reset(key);
  }

  /**
   * Cleanup resources (e.g., close connections).
   */
  async close(): Promise<void> {
    return this.store.close();
  }

  /**
   * Express/Connect middleware factory.
   * Uses the request IP as the rate limit key by default.
   */
  middleware(options?: {
    keyFn?: (req: any) => string;
    onLimited?: (req: any, res: any) => void;
  }) {
    const keyFn = options?.keyFn ?? ((req: any) => req.ip ?? req.socket?.remoteAddress ?? 'unknown');
    const onLimited = options?.onLimited;

    return async (req: any, res: any, next: any) => {
      const key = keyFn(req);
      const result = await this.consume(key);

      res.setHeader('X-RateLimit-Limit', result.limit);
      res.setHeader('X-RateLimit-Remaining', result.remaining);
      res.setHeader('X-RateLimit-Reset', result.resetAt);

      if (!result.allowed) {
        res.setHeader('Retry-After', Math.ceil(result.retryAfter / 1000));
        if (onLimited) {
          return onLimited(req, res);
        }
        res.status(429).json({
          error: 'Too Many Requests',
          retryAfter: result.retryAfter,
        });
        return;
      }

      next();
    };
  }
}

// Re-export types
export type { RateLimitResult, RateLimiterOptions, RedisStoreOptions, Store, Algorithm };

// Named exports for stores (advanced usage)
export { MemoryStore } from './stores/memory-store';
export { RedisStore } from './stores/redis-store';
