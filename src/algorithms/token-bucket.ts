import type { RateLimitResult } from '../types';

interface BucketState {
  tokens: number;
  lastRefill: number;
}

/** How often to run eviction (every N consume calls) */
const EVICTION_INTERVAL = 1000;
/** Max keys to scan per eviction pass */
const EVICTION_BATCH = 500;

export class TokenBucket {
  private buckets = new Map<string, BucketState>();
  private callCount = 0;

  constructor(
    private maxTokens: number,
    private refillIntervalMs: number,
  ) {}

  consume(key: string, cost: number = 1): RateLimitResult {
    const now = Date.now();

    // Lazy eviction: periodically sweep stale keys
    if (++this.callCount >= EVICTION_INTERVAL) {
      this.callCount = 0;
      this.evict(now);
    }

    let bucket = this.buckets.get(key);

    if (!bucket) {
      bucket = { tokens: this.maxTokens, lastRefill: now };
      this.buckets.set(key, bucket);
    }

    // Refill tokens based on elapsed time
    const elapsed = now - bucket.lastRefill;
    const tokensToAdd = (elapsed / this.refillIntervalMs) * this.maxTokens;
    bucket.tokens = Math.min(this.maxTokens, bucket.tokens + tokensToAdd);
    bucket.lastRefill = now;

    const resetAt = now + this.refillIntervalMs;

    if (bucket.tokens >= cost) {
      bucket.tokens -= cost;
      return {
        allowed: true,
        remaining: Math.floor(bucket.tokens),
        limit: this.maxTokens,
        resetAt,
        retryAfter: 0,
      };
    }

    // Calculate when enough tokens will be available
    const retryAfter = Math.ceil(
      ((cost - bucket.tokens) / this.maxTokens) * this.refillIntervalMs,
    );

    return {
      allowed: false,
      remaining: Math.floor(bucket.tokens),
      limit: this.maxTokens,
      resetAt,
      retryAfter,
    };
  }

  reset(key: string): void {
    this.buckets.delete(key);
  }

  /** Remove keys that have been idle long enough to have fully refilled */
  private evict(now: number): void {
    let scanned = 0;
    for (const [key, bucket] of this.buckets) {
      if (scanned++ >= EVICTION_BATCH) break;
      // If idle for >= 2x refill interval, bucket is full and stale
      if (now - bucket.lastRefill >= this.refillIntervalMs * 2) {
        this.buckets.delete(key);
      }
    }
  }
}
