import type { RateLimitResult } from '../types';

/**
 * Sliding Window Counter algorithm.
 *
 * Uses a weighted counter approach with two sub-windows (current + previous)
 * for O(1) time and space per key, while providing accurate sliding window
 * rate limiting.
 */

interface WindowState {
  /** Request count in the previous sub-window */
  prevCount: number;
  /** Request count in the current sub-window */
  currCount: number;
  /** Start time of the current sub-window */
  currStart: number;
}

/** How often to run eviction (every N consume calls) */
const EVICTION_INTERVAL = 1000;
/** Max keys to scan per eviction pass */
const EVICTION_BATCH = 500;

export class SlidingWindow {
  constructor(
    private maxRequests: number,
    private windowMs: number,
  ) {}

  private windows = new Map<string, WindowState>();
  private callCount = 0;

  consume(key: string): RateLimitResult {
    const now = Date.now();

    // Lazy eviction: periodically sweep expired keys
    if (++this.callCount >= EVICTION_INTERVAL) {
      this.callCount = 0;
      this.evict(now);
    }

    let state = this.windows.get(key);

    if (!state) {
      state = { prevCount: 0, currCount: 0, currStart: now };
      this.windows.set(key, state);
    }

    // Advance sub-windows if needed
    const elapsed = now - state.currStart;
    if (elapsed >= this.windowMs * 2) {
      state.prevCount = 0;
      state.currCount = 0;
      state.currStart = now;
    } else if (elapsed >= this.windowMs) {
      state.prevCount = state.currCount;
      state.currCount = 0;
      state.currStart = state.currStart + this.windowMs;
    }

    // Weighted count: previous window's contribution based on overlap
    const elapsedInCurrent = now - state.currStart;
    const weight = Math.max(0, 1 - elapsedInCurrent / this.windowMs);
    const estimatedCount = state.prevCount * weight + state.currCount;

    const resetAt = state.currStart + this.windowMs;

    if (estimatedCount < this.maxRequests) {
      state.currCount++;
      const newEstimate = state.prevCount * weight + state.currCount;
      return {
        allowed: true,
        remaining: Math.max(0, Math.floor(this.maxRequests - newEstimate)),
        limit: this.maxRequests,
        resetAt,
        retryAfter: 0,
      };
    }

    const retryAfter = Math.max(0, Math.ceil(resetAt - now));

    return {
      allowed: false,
      remaining: 0,
      limit: this.maxRequests,
      resetAt,
      retryAfter,
    };
  }

  reset(key: string): void {
    this.windows.delete(key);
  }

  /** Remove keys whose both windows have fully expired */
  private evict(now: number): void {
    const expiry = this.windowMs * 2;
    let scanned = 0;
    for (const [key, state] of this.windows) {
      if (scanned++ >= EVICTION_BATCH) break;
      if (now - state.currStart >= expiry) {
        this.windows.delete(key);
      }
    }
  }
}
