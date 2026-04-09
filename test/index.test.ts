import { describe, it, expect, beforeEach } from 'vitest';
import { RateLimiter } from '../src';

describe('RateLimiter', () => {
  describe('Sliding Window (memory)', () => {
    let limiter: RateLimiter;

    beforeEach(() => {
      limiter = new RateLimiter({
        algorithm: 'sliding-window',
        limit: 3,
        window: 1000,
      });
    });

    it('should allow requests within limit', async () => {
      const r1 = await limiter.consume('user:1');
      expect(r1.allowed).toBe(true);
      expect(r1.remaining).toBe(2);
      expect(r1.limit).toBe(3);
    });

    it('should block requests exceeding limit', async () => {
      await limiter.consume('user:1');
      await limiter.consume('user:1');
      await limiter.consume('user:1');
      const r4 = await limiter.consume('user:1');
      expect(r4.allowed).toBe(false);
      expect(r4.remaining).toBe(0);
      expect(r4.retryAfter).toBeGreaterThan(0);
    });

    it('should track keys independently', async () => {
      await limiter.consume('user:1');
      await limiter.consume('user:1');
      await limiter.consume('user:1');

      const r = await limiter.consume('user:2');
      expect(r.allowed).toBe(true);
      expect(r.remaining).toBe(2);
    });

    it('should reset a key', async () => {
      await limiter.consume('user:1');
      await limiter.consume('user:1');
      await limiter.consume('user:1');

      await limiter.reset('user:1');
      const r = await limiter.consume('user:1');
      expect(r.allowed).toBe(true);
      expect(r.remaining).toBe(2);
    });

    it('should allow requests after window expires', async () => {
      await limiter.consume('user:1');
      await limiter.consume('user:1');
      await limiter.consume('user:1');

      // Wait for window to expire
      await new Promise((resolve) => setTimeout(resolve, 1100));

      const r = await limiter.consume('user:1');
      expect(r.allowed).toBe(true);
    });
  });

  describe('Token Bucket (memory)', () => {
    let limiter: RateLimiter;

    beforeEach(() => {
      limiter = new RateLimiter({
        algorithm: 'token-bucket',
        limit: 3,
        window: 1000,
      });
    });

    it('should allow requests within token limit', async () => {
      const r1 = await limiter.consume('user:1');
      expect(r1.allowed).toBe(true);
      expect(r1.remaining).toBe(2);
    });

    it('should block when tokens exhausted', async () => {
      await limiter.consume('user:1');
      await limiter.consume('user:1');
      await limiter.consume('user:1');
      const r4 = await limiter.consume('user:1');
      expect(r4.allowed).toBe(false);
      expect(r4.remaining).toBe(0);
    });

    it('should refill tokens over time', async () => {
      await limiter.consume('user:1');
      await limiter.consume('user:1');
      await limiter.consume('user:1');

      // Wait for partial refill
      await new Promise((resolve) => setTimeout(resolve, 500));

      const r = await limiter.consume('user:1');
      expect(r.allowed).toBe(true);
    });
  });

  describe('RateLimitResult metadata', () => {
    it('should include resetAt timestamp', async () => {
      const limiter = new RateLimiter({
        algorithm: 'sliding-window',
        limit: 10,
        window: 5000,
      });
      const before = Date.now();
      const result = await limiter.consume('user:1');
      expect(result.resetAt).toBeGreaterThanOrEqual(before + 5000);
    });

    it('should return retryAfter=0 when allowed', async () => {
      const limiter = new RateLimiter({
        algorithm: 'sliding-window',
        limit: 10,
        window: 5000,
      });
      const result = await limiter.consume('user:1');
      expect(result.retryAfter).toBe(0);
    });
  });

  describe('Variable cost — consume(key, cost)', () => {
    describe('Sliding Window', () => {
      it('should consume multiple tokens at once', async () => {
        const limiter = new RateLimiter({
          algorithm: 'sliding-window',
          limit: 10,
          window: 1000,
        });
        const r = await limiter.consume('user:1', 3);
        expect(r.allowed).toBe(true);
        expect(r.remaining).toBe(7);
      });

      it('should block when cost exceeds remaining', async () => {
        const limiter = new RateLimiter({
          algorithm: 'sliding-window',
          limit: 5,
          window: 1000,
        });
        await limiter.consume('user:1', 3);
        const r = await limiter.consume('user:1', 3);
        expect(r.allowed).toBe(false);
        expect(r.remaining).toBe(2);
      });

      it('should allow cost=1 after partial consumption', async () => {
        const limiter = new RateLimiter({
          algorithm: 'sliding-window',
          limit: 5,
          window: 1000,
        });
        await limiter.consume('user:1', 4);
        const r = await limiter.consume('user:1', 1);
        expect(r.allowed).toBe(true);
        expect(r.remaining).toBe(0);
      });

      it('should block when cost exceeds total limit', async () => {
        const limiter = new RateLimiter({
          algorithm: 'sliding-window',
          limit: 3,
          window: 1000,
        });
        const r = await limiter.consume('user:1', 5);
        expect(r.allowed).toBe(false);
      });
    });

    describe('Token Bucket', () => {
      it('should consume multiple tokens at once', async () => {
        const limiter = new RateLimiter({
          algorithm: 'token-bucket',
          limit: 10,
          window: 1000,
        });
        const r = await limiter.consume('user:1', 4);
        expect(r.allowed).toBe(true);
        expect(r.remaining).toBe(6);
      });

      it('should block when cost exceeds available tokens', async () => {
        const limiter = new RateLimiter({
          algorithm: 'token-bucket',
          limit: 5,
          window: 1000,
        });
        await limiter.consume('user:1', 3);
        const r = await limiter.consume('user:1', 3);
        expect(r.allowed).toBe(false);
        expect(r.remaining).toBe(2);
        expect(r.retryAfter).toBeGreaterThan(0);
      });

      it('should return correct retryAfter for high cost', async () => {
        const limiter = new RateLimiter({
          algorithm: 'token-bucket',
          limit: 10,
          window: 10000,
        });
        await limiter.consume('user:1', 8);
        const r = await limiter.consume('user:1', 5);
        expect(r.allowed).toBe(false);
        // Need 3 more tokens, refill rate is 10 per 10s = 1 per 1s
        expect(r.retryAfter).toBeGreaterThan(0);
      });

      it('should default to cost=1', async () => {
        const limiter = new RateLimiter({
          algorithm: 'token-bucket',
          limit: 10,
          window: 1000,
        });
        const r = await limiter.consume('user:1');
        expect(r.allowed).toBe(true);
        expect(r.remaining).toBe(9);
      });
    });
  });

  describe('Express middleware', () => {
    it('should call next() when allowed', async () => {
      const limiter = new RateLimiter({
        algorithm: 'sliding-window',
        limit: 10,
        window: 1000,
      });

      const middleware = limiter.middleware();
      let nextCalled = false;
      const req = { ip: '127.0.0.1' } as any;
      const headers: Record<string, any> = {};
      const res = {
        setHeader: (k: string, v: any) => { headers[k] = v; },
        status: () => res,
        json: () => {},
      } as any;

      await middleware(req, res, () => { nextCalled = true; });
      expect(nextCalled).toBe(true);
      expect(headers['X-RateLimit-Limit']).toBe(10);
      expect(headers['X-RateLimit-Remaining']).toBe(9);
    });

    it('should return 429 when rate limited', async () => {
      const limiter = new RateLimiter({
        algorithm: 'sliding-window',
        limit: 1,
        window: 1000,
      });

      const middleware = limiter.middleware();
      const req = { ip: '127.0.0.1' } as any;
      let statusCode: number | undefined;
      let responseBody: any;
      const res = {
        setHeader: () => {},
        status: (code: number) => { statusCode = code; return res; },
        json: (body: any) => { responseBody = body; },
      } as any;

      // First request — allowed
      await middleware(req, res, () => {});

      // Second request — blocked
      await middleware(req, res, () => {});
      expect(statusCode).toBe(429);
      expect(responseBody.error).toBe('Too Many Requests');
    });

    it('should forward errors to next() when consume throws', async () => {
      const limiter = new RateLimiter({
        algorithm: 'sliding-window',
        limit: 10,
        window: 1000,
      });

      // Monkey-patch consume to simulate a Redis failure
      const error = new Error('Redis connection lost');
      limiter.consume = async () => { throw error; };

      const middleware = limiter.middleware();
      const req = { ip: '127.0.0.1' } as any;
      const res = {
        setHeader: () => {},
        status: () => res,
        json: () => {},
      } as any;

      let nextError: any;
      await middleware(req, res, (err: any) => { nextError = err; });
      expect(nextError).toBe(error);
    });
  });
});
