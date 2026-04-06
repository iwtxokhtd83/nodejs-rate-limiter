<div align="center">

# node-rate-limiter-pro

**High-performance rate limiter for Node.js**

Token Bucket · Sliding Window · Redis · Distributed · Express Middleware

[![npm version](https://img.shields.io/npm/v/node-rate-limiter-pro.svg)](https://www.npmjs.com/package/node-rate-limiter-pro)
[![license](https://img.shields.io/npm/l/node-rate-limiter-pro.svg)](LICENSE)
[![node](https://img.shields.io/node/v/node-rate-limiter-pro.svg)](package.json)

</div>

---

## Why?

Most rate limiters are either too slow, too simple, or don't support distributed systems. This library gives you:

- **Two battle-tested algorithms** — Token Bucket and Sliding Window
- **Redis support** — share rate limits across multiple servers with atomic Lua scripts
- **Zero dependencies** for in-memory mode (Redis is an optional peer dependency)
- **Express middleware** out of the box
- **Blazing fast** — see [benchmarks](#benchmarks) below

## Install

```bash
npm install node-rate-limiter-pro
```

For Redis support:

```bash
npm install node-rate-limiter-pro ioredis
```

## Quick Start

```typescript
import { RateLimiter } from 'node-rate-limiter-pro';

const limiter = new RateLimiter({
  algorithm: 'sliding-window', // or 'token-bucket'
  limit: 100,                  // 100 requests
  window: 60_000,              // per 60 seconds
});

const result = await limiter.consume('user:123');

if (result.allowed) {
  // Process request
  console.log(`Remaining: ${result.remaining}`);
} else {
  // Rate limited
  console.log(`Retry after ${result.retryAfter}ms`);
}
```

## Algorithms

### Sliding Window

Tracks exact timestamps of each request within the window. Provides precise rate limiting with no burst allowance at window boundaries.

```typescript
const limiter = new RateLimiter({
  algorithm: 'sliding-window',
  limit: 100,
  window: 60_000,
});
```

**Best for:** API rate limiting, login attempt protection, fair usage enforcement.

### Token Bucket

Tokens refill gradually over time. Allows short bursts while maintaining an average rate.

```typescript
const limiter = new RateLimiter({
  algorithm: 'token-bucket',
  limit: 100,       // bucket capacity
  window: 60_000,   // full refill interval
});
```

**Best for:** Traffic shaping, allowing occasional bursts, smoothing request patterns.

## Redis (Distributed)

Share rate limits across multiple Node.js processes or servers. All operations are atomic via Lua scripts — no race conditions.

```typescript
import Redis from 'ioredis';
import { RateLimiter } from 'node-rate-limiter-pro';

const redis = new Redis();

const limiter = new RateLimiter({
  algorithm: 'sliding-window',
  limit: 100,
  window: 60_000,
  client: redis,       // ioredis instance
  prefix: 'myapp:rl:', // optional key prefix
});

const result = await limiter.consume('api:user:42');
```

## Express Middleware

Drop-in middleware for Express applications.

```typescript
import express from 'express';
import { RateLimiter } from 'node-rate-limiter-pro';

const app = express();

const limiter = new RateLimiter({
  algorithm: 'sliding-window',
  limit: 100,
  window: 60_000,
});

// Apply to all routes
app.use(limiter.middleware());

// Custom key function and error handler
app.use(
  limiter.middleware({
    keyFn: (req) => req.headers['x-api-key'] || req.ip,
    onLimited: (req, res) => {
      res.status(429).json({ error: 'Slow down!' });
    },
  })
);
```

Response headers are set automatically:

| Header | Description |
|---|---|
| `X-RateLimit-Limit` | Maximum requests allowed |
| `X-RateLimit-Remaining` | Remaining requests in window |
| `X-RateLimit-Reset` | Unix timestamp when limit resets |
| `Retry-After` | Seconds until next request allowed (only on 429) |

## API Reference

### `new RateLimiter(options)`

| Option | Type | Default | Description |
|---|---|---|---|
| `algorithm` | `'sliding-window' \| 'token-bucket'` | `'sliding-window'` | Rate limiting algorithm |
| `limit` | `number` | *required* | Max requests per window |
| `window` | `number` | *required* | Window size in milliseconds |
| `client` | `Redis` | `undefined` | ioredis client (enables Redis mode) |
| `prefix` | `string` | `'rl:'` | Redis key prefix |

### `limiter.consume(key): Promise<RateLimitResult>`

Attempt to consume one token/slot for the given key.

```typescript
interface RateLimitResult {
  allowed: boolean;    // Whether the request is allowed
  remaining: number;   // Remaining requests in window
  limit: number;       // Total limit
  resetAt: number;     // Unix timestamp (ms) when limit resets
  retryAfter: number;  // ms until next request allowed (0 if allowed)
}
```

### `limiter.reset(key): Promise<void>`

Reset the rate limit state for a key.

### `limiter.close(): Promise<void>`

Cleanup resources.

### `limiter.middleware(options?)`

Returns Express-compatible middleware.

| Option | Type | Description |
|---|---|---|
| `keyFn` | `(req) => string` | Custom key extraction (default: `req.ip`) |
| `onLimited` | `(req, res) => void` | Custom 429 response handler |

## Benchmarks

Benchmarks run on a single Node.js process, measuring raw throughput of the rate limiting logic (no HTTP overhead).

**Environment:** Node.js v22, Apple M-series / Intel i7, 5-second sustained test per scenario.

```
================================================================================
  BENCHMARK RESULTS
================================================================================
Name                                     ops/sec   avg (μs)   p99 (μs)
--------------------------------------------------------------------------------
Sliding Window (memory)              2,347,456          0          1
Token Bucket (memory)                2,213,067          0          1
Sliding Window (multi-key)           1,499,662          1          1
Token Bucket (multi-key)             1,514,288          1          1
Sliding Window (10x concurrent)        177,720          5         14
================================================================================
```

> Numbers from Node.js v24 on Windows. Run `npm run benchmark` to get results for your hardware.

### vs express-rate-limit

```
======================================================================
  COMPARISON RESULTS
======================================================================
Library                                        ops/sec   avg (μs)
----------------------------------------------------------------------
node-rate-limiter-pro (sliding-window)         1,968,296          0
node-rate-limiter-pro (token-bucket)           1,813,408          0
express-rate-limit                             185,412          5
======================================================================

🏆 node-rate-limiter-pro is ~10x faster than express-rate-limit
```

> Run `npm run benchmark:compare` to reproduce.

### Why is it faster?

- **O(1) algorithms** — Sliding Window uses a weighted counter (not timestamp arrays), Token Bucket uses simple arithmetic
- **Zero allocation hot path** — no objects or arrays created per request
- **Minimal overhead** — no middleware wrapping, no HTTP parsing in the core
- **Atomic Redis operations** — single Lua script round-trip, no multi-step transactions

## Architecture

```
┌─────────────────────────────────────────────┐
│              RateLimiter (API)               │
│  .consume()  .reset()  .middleware()         │
└──────────────────┬──────────────────────────┘
                   │
          ┌────────┴────────┐
          │                 │
   ┌──────▼──────┐   ┌─────▼──────┐
   │ MemoryStore │   │ RedisStore  │
   │             │   │ (Lua scripts│
   │  In-process │   │  atomic ops)│
   └──────┬──────┘   └─────┬──────┘
          │                 │
   ┌──────┴──────┐   ┌─────┴──────┐
   │  Algorithm  │   │  Algorithm  │
   │             │   │  (in Lua)   │
   │• TokenBucket│   │• TokenBucket│
   │• SlidingWin │   │• SlidingWin │
   └─────────────┘   └────────────┘
```

## Examples

See the [`examples/`](examples/) directory:

- [`basic-usage.ts`](examples/basic-usage.ts) — Simple in-memory usage
- [`express-middleware.ts`](examples/express-middleware.ts) — Express integration
- [`redis-distributed.ts`](examples/redis-distributed.ts) — Redis distributed setup

Run any example:

```bash
npx tsx examples/basic-usage.ts
```

## Contributing

Contributions are welcome. Please open an issue first to discuss what you'd like to change.

```bash
git clone https://github.com/iwtxokhtd83/nodejs-rate-limiter.git
cd nodejs-rate-limiter
npm install
npm test
npm run benchmark
```

## License

[MIT](LICENSE)
