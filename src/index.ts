import type { Store, RateLimitResult, RateLimiterOptions, RedisStoreOptions, RedisLike, Algorithm } from './types';
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
   * Attempt to consume token(s) for the given key.
   * @param key - Rate limit key (e.g., user ID, IP address)
   * @param cost - Number of tokens to consume (default: 1)
   * Returns rate limit metadata including whether the request is allowed.
   */
  async consume(key: string, cost: number = 1): Promise<RateLimitResult> {
    return this.store.consume(key, cost);
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
    costFn?: (req: any) => number;
    onLimited?: (req: any, res: any) => void;
  }) {
    const keyFn = options?.keyFn ?? ((req: any) => req.ip ?? req.socket?.remoteAddress ?? 'unknown');
    const costFn = options?.costFn;
    const onLimited = options?.onLimited;

    return async (req: any, res: any, next: any) => {
      try {
        const key = keyFn(req);
        const cost = costFn ? costFn(req) : 1;
        const result = await this.consume(key, cost);

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
      } catch (err) {
        next(err);
      }
    };
  }
}

// Re-export types
export type { RateLimitResult, RateLimiterOptions, RedisStoreOptions, RedisLike, Store, Algorithm };

// Named exports for stores (advanced usage)
export { MemoryStore } from './stores/memory-store';
export { RedisStore } from './stores/redis-store';
