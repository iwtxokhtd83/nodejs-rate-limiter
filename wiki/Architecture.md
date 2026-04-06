# Architecture

## Overview

nodejs-rate-limiter follows a clean layered architecture that separates the public API, storage backends, and rate limiting algorithms.

```
┌─────────────────────────────────────────────────┐
│                RateLimiter (API)                 │
│    .consume()   .reset()   .middleware()         │
└────────────────────┬────────────────────────────┘
                     │
            ┌────────┴────────┐
            │                 │
     ┌──────▼──────┐   ┌─────▼───────┐
     │ MemoryStore │   │  RedisStore  │
     │             │   │  (Lua scripts│
     │  In-process │   │  atomic ops) │
     └──────┬──────┘   └─────┬───────┘
            │                │
     ┌──────┴──────┐   ┌────┴────────┐
     │  Algorithm  │   │  Algorithm  │
     │             │   │  (in Lua)   │
     │• TokenBucket│   │• TokenBucket│
     │• SlidingWin │   │• SlidingWin │
     └─────────────┘   └─────────────┘
```

## Layer Responsibilities

### RateLimiter (Public API)

`src/index.ts`

- Entry point for all user interactions
- Automatically selects the appropriate store based on options
- Provides the Express middleware factory
- Re-exports all types

### Stores

`src/stores/memory-store.ts` and `src/stores/redis-store.ts`

Stores implement the `Store` interface:

```typescript
interface Store {
  consume(key: string): Promise<RateLimitResult>;
  reset(key: string): Promise<void>;
  close(): Promise<void>;
}
```

- **MemoryStore** — delegates to in-process algorithm instances
- **RedisStore** — executes Lua scripts on the Redis server

### Algorithms

`src/algorithms/sliding-window.ts` and `src/algorithms/token-bucket.ts`

Pure algorithm implementations used by the MemoryStore. Each algorithm:

- Maintains its own state per key (using a `Map`)
- Exposes `consume(key)` and `reset(key)` methods
- Has no external dependencies

For Redis, the algorithms are reimplemented as Lua scripts inside `RedisStore` to ensure atomicity.

## Design Decisions

### Why Lua Scripts for Redis?

Redis Lua scripts execute atomically — the entire script runs without interruption. This eliminates race conditions that would occur with multi-step operations:

```
❌ Without Lua (race condition possible):
  Client A: GET count → 99
  Client B: GET count → 99
  Client A: SET count 100 → allowed
  Client B: SET count 100 → allowed (should be blocked!)

✅ With Lua (atomic):
  Client A: EVAL script → 100, allowed
  Client B: EVAL script → 101, blocked
```

### Why Not Manage Redis Connections?

The library does not create or destroy Redis connections. Reasons:

1. **Connection pooling** — users may want to share a connection pool across services
2. **Configuration** — TLS, auth, sentinel, cluster configs vary widely
3. **Lifecycle** — the application knows when to connect and disconnect
4. **Testing** — users can pass mock Redis clients

### Why Weighted Counter for Sliding Window?

The classic sliding window stores every timestamp, which is O(n) in space and time. The weighted counter approach:

- Uses O(1) space (two counters + one timestamp per key)
- Uses O(1) time (simple arithmetic)
- Provides accuracy within ~1% of the true sliding window
- Scales to millions of keys without memory pressure

### Why Async API for Memory Store?

Even though the memory store is synchronous internally, the public API is async (`Promise`-based). This ensures:

- **Consistent API** — switching between memory and Redis requires no code changes
- **Future-proof** — new stores (e.g., SQLite, DynamoDB) can be added without API changes
- **Middleware compatibility** — Express middleware expects async handlers

## File Structure

```
src/
├── index.ts                    # Public API, RateLimiter class
├── types.ts                    # TypeScript interfaces and types
├── algorithms/
│   ├── sliding-window.ts       # Sliding window counter algorithm
│   └── token-bucket.ts         # Token bucket algorithm
└── stores/
    ├── memory-store.ts         # In-memory store (wraps algorithms)
    └── redis-store.ts          # Redis store (Lua scripts)
```

## Extending

### Custom Store

Implement the `Store` interface to add a new backend:

```typescript
import type { Store, RateLimitResult } from 'nodejs-rate-limiter';

class DynamoDBStore implements Store {
  async consume(key: string): Promise<RateLimitResult> {
    // Your implementation
  }

  async reset(key: string): Promise<void> {
    // Your implementation
  }

  async close(): Promise<void> {
    // Your implementation
  }
}
```
