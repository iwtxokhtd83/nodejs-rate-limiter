# Getting Started

## Installation

```bash
npm install node-rate-limiter-pro
```

For Redis (distributed) support:

```bash
npm install node-rate-limiter-pro ioredis
```

## Requirements

- Node.js >= 18.0.0
- TypeScript >= 5.0 (optional, but recommended)
- Redis >= 6.0 (only if using Redis store)

## Basic Usage

```typescript
import { RateLimiter } from 'node-rate-limiter-pro';

// Create a limiter: 100 requests per 60 seconds
const limiter = new RateLimiter({
  algorithm: 'sliding-window',
  limit: 100,
  window: 60_000,
});

// Consume a token for a given key
const result = await limiter.consume('user:123');

if (result.allowed) {
  console.log(`Request allowed. Remaining: ${result.remaining}`);
} else {
  console.log(`Rate limited. Retry after ${result.retryAfter}ms`);
}
```

## Choosing an Algorithm

| Feature | Sliding Window | Token Bucket |
|---|---|---|
| Burst handling | No bursts allowed | Allows short bursts |
| Accuracy | Weighted approximation | Exact token count |
| Memory per key | O(1) | O(1) |
| Best for | API rate limiting, login protection | Traffic shaping, smoothing |

See [[Algorithms]] for detailed explanations.

## Choosing a Store

| Feature | Memory Store | Redis Store |
|---|---|---|
| Setup | Zero config | Requires Redis |
| Distribution | Single process only | Multi-process / multi-server |
| Performance | ~2M ops/sec | ~50K ops/sec (network bound) |
| Persistence | Lost on restart | Survives restarts |
| Dependencies | None | ioredis |

See [[Redis & Distributed Mode]] for Redis setup.

## Next Steps

- [[Algorithms]] — Understand how each algorithm works
- [[Express Middleware]] — Integrate with Express
- [[API Reference]] — Full API documentation
