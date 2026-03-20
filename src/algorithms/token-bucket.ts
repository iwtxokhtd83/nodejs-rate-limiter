import type { RateLimitResult } from '../types';

interface BucketState {
  tokens: number;
  lastRefill: number;
}

export class TokenBucket {
  private buckets = new Map<string, BucketState>();

  constructor(
    private maxTokens: number,
    private refillIntervalMs: number,
  ) {}

  consume(key: string): RateLimitResult {
    const now = Date.now();
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

    if (bucket.tokens >= 1) {
      bucket.tokens -= 1;
      return {
        allowed: true,
        remaining: Math.floor(bucket.tokens),
        limit: this.maxTokens,
        resetAt,
        retryAfter: 0,
      };
    }

    // Calculate when next token will be available
    const retryAfter = Math.ceil(
      ((1 - bucket.tokens) / this.maxTokens) * this.refillIntervalMs,
    );

    return {
      allowed: false,
      remaining: 0,
      limit: this.maxTokens,
      resetAt,
      retryAfter,
    };
  }

  reset(key: string): void {
    this.buckets.delete(key);
  }
}
