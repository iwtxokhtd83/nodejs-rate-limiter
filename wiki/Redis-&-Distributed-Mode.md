# Redis & Distributed Mode

nodejs-rate-limiter supports Redis as a backing store, enabling rate limiting across multiple Node.js processes, servers, or containers.

## Setup

```typescript
import Redis from 'ioredis';
import { RateLimiter } from 'nodejs-rate-limiter';

const redis = new Redis({
  host: '127.0.0.1',
  port: 6379,
  // password: 'your-password',
  // tls: {},
});

const limiter = new RateLimiter({
  algorithm: 'sliding-window',
  limit: 100,
  window: 60_000,
  client: redis,
  prefix: 'myapp:rl:',
});
```

## How It Works

All Redis operations are performed via **atomic Lua scripts**. This means:

- **No race conditions** — the entire check-and-update is a single atomic operation
- **No distributed locks needed** — Lua scripts execute atomically on the Redis server
- **Single round-trip** — one network call per `consume()`, regardless of algorithm

### Sliding Window (Redis)

Uses a Redis Sorted Set (ZSET) where each member is a unique request ID and the score is the timestamp.

```
ZREMRANGEBYSCORE key -inf (now - window)   -- evict expired
ZCARD key                                   -- count current
ZADD key now unique_id                      -- add if under limit
PEXPIRE key window                          -- set TTL
```

### Token Bucket (Redis)

Uses a Redis Hash with two fields: `tokens` and `lastRefill`.

```
HMGET key tokens lastRefill                 -- read state
-- calculate refill based on elapsed time
HMSET key tokens new_count lastRefill now   -- update state
PEXPIRE key window                          -- set TTL
```

## Key Prefix

Use the `prefix` option to namespace your rate limit keys. This is useful when:

- Multiple services share the same Redis instance
- You want to distinguish between different rate limit policies
- You need to bulk-delete rate limit keys

```typescript
// API rate limits
const apiLimiter = new RateLimiter({
  limit: 100, window: 60_000,
  client: redis, prefix: 'api:rl:',
});

// Auth rate limits
const authLimiter = new RateLimiter({
  limit: 5, window: 300_000,
  client: redis, prefix: 'auth:rl:',
});
```

## Multi-Server Deployment

```
┌─────────────┐  ┌─────────────┐  ┌─────────────┐
│  Server A   │  │  Server B   │  │  Server C   │
│  Node.js    │  │  Node.js    │  │  Node.js    │
│  + limiter  │  │  + limiter  │  │  + limiter  │
└──────┬──────┘  └──────┬──────┘  └──────┬──────┘
       │                │                │
       └────────────────┼────────────────┘
                        │
                 ┌──────▼──────┐
                 │    Redis    │
                 │  (shared)   │
                 └─────────────┘
```

All servers share the same rate limit counters through Redis. A user hitting Server A and then Server B will see a consistent rate limit.

## Redis Cluster / Sentinel

ioredis natively supports Redis Cluster and Sentinel. Just pass the appropriate client:

```typescript
import Redis from 'ioredis';

// Redis Cluster
const cluster = new Redis.Cluster([
  { host: 'node1', port: 6379 },
  { host: 'node2', port: 6379 },
]);

const limiter = new RateLimiter({
  limit: 100, window: 60_000,
  client: cluster,
});
```

```typescript
// Redis Sentinel
const sentinel = new Redis({
  sentinels: [
    { host: 'sentinel1', port: 26379 },
    { host: 'sentinel2', port: 26379 },
  ],
  name: 'mymaster',
});

const limiter = new RateLimiter({
  limit: 100, window: 60_000,
  client: sentinel,
});
```

## Connection Lifecycle

nodejs-rate-limiter does **not** manage the Redis connection lifecycle. You are responsible for:

- Creating the Redis client
- Handling connection errors
- Disconnecting when done

```typescript
// Your responsibility
const redis = new Redis();

redis.on('error', (err) => {
  console.error('Redis error:', err);
});

// Pass to limiter
const limiter = new RateLimiter({ limit: 100, window: 60_000, client: redis });

// When shutting down
await limiter.close();
await redis.quit();
```

## Performance Considerations

- Each `consume()` call = 1 Redis round-trip
- Typical latency: 0.1–0.5ms on localhost, 1–5ms over network
- Throughput is network-bound, not CPU-bound
- Use Redis connection pooling for high-throughput scenarios
- Consider using the memory store for non-distributed use cases (10x+ faster)
