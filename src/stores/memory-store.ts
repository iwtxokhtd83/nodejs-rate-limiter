import type { Store, RateLimitResult, RateLimiterOptions } from '../types';
import { TokenBucket } from '../algorithms/token-bucket';
import { SlidingWindow } from '../algorithms/sliding-window';

export class MemoryStore implements Store {
  private algorithm: TokenBucket | SlidingWindow;

  constructor(options: RateLimiterOptions) {
    const algo = options.algorithm ?? 'sliding-window';
    if (algo === 'token-bucket') {
      this.algorithm = new TokenBucket(options.limit, options.window);
    } else {
      this.algorithm = new SlidingWindow(options.limit, options.window);
    }
  }

  async consume(key: string, cost: number = 1): Promise<RateLimitResult> {
    return this.algorithm.consume(key, cost);
  }

  async reset(key: string): Promise<void> {
    this.algorithm.reset(key);
  }

  async close(): Promise<void> {
    // No-op for memory store
  }
}
