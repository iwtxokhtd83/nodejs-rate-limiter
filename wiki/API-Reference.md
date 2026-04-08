# API Reference

## `RateLimiter`

The main class. Creates a rate limiter with either an in-memory or Redis-backed store.

### Constructor

```typescript
new RateLimiter(options: RateLimiterOptions | RedisStoreOptions)
```

#### `RateLimiterOptions`

| Parameter | Type | Default | Description |
|---|---|---|---|
| `algorithm` | `'sliding-window' \| 'token-bucket'` | `'sliding-window'` | Rate limiting algorithm |
| `limit` | `number` | *required* | Maximum requests allowed per window |
| `window` | `number` | *required* | Time window in milliseconds |

#### `RedisStoreOptions`

Extends `RateLimiterOptions` with:

| Parameter | Type | Default | Description |
|---|---|---|---|
| `client` | `RedisLike` | *required* | ioredis client instance (or any object with `eval()` and `del()`) |
| `prefix` | `string` | `'rl:'` | Key prefix for Redis keys |

The store is automatically selected based on whether `client` is provided.

---

### `limiter.consume(key)`

```typescript
consume(key: string): Promise<RateLimitResult>
```

Attempt to consume one token/slot for the given key.

**Parameters:**
- `key` — A string identifying the rate limit subject (e.g., user ID, IP address)

**Returns:** `Promise<RateLimitResult>`

```typescript
interface RateLimitResult {
  /** Whether the request is allowed */
  allowed: boolean;

  /** Remaining tokens/requests in the current window */
  remaining: number;

  /** Total limit configured */
  limit: number;

  /** Unix timestamp (ms) when the current window resets */
  resetAt: number;

  /** Milliseconds until next request will be allowed. 0 if currently allowed */
  retryAfter: number;
}
```

**Example:**

```typescript
const result = await limiter.consume('user:123');

if (result.allowed) {
  // Process the request
  console.log(`${result.remaining} requests remaining`);
} else {
  // Reject the request
  console.log(`Try again in ${result.retryAfter}ms`);
}
```

---

### `limiter.reset(key)`

```typescript
reset(key: string): Promise<void>
```

Reset the rate limit state for a specific key. The next `consume()` call for this key will start fresh.

**Example:**

```typescript
// User upgraded their plan, reset their limits
await limiter.reset('user:123');
```

---

### `limiter.close()`

```typescript
close(): Promise<void>
```

Cleanup resources. For the memory store, this is a no-op. For Redis, this does **not** disconnect the client (you own the connection lifecycle).

---

### `limiter.middleware(options?)`

```typescript
middleware(options?: MiddlewareOptions): (req, res, next) => Promise<void>
```

Returns an Express/Connect-compatible middleware function.

#### `MiddlewareOptions`

| Parameter | Type | Default | Description |
|---|---|---|---|
| `keyFn` | `(req) => string` | `req.ip` | Function to extract the rate limit key from the request |
| `onLimited` | `(req, res) => void` | Built-in 429 JSON response | Custom handler when rate limit is exceeded |

**Example:**

```typescript
app.use(limiter.middleware({
  keyFn: (req) => req.headers['x-api-key'] || req.ip,
  onLimited: (req, res) => {
    res.status(429).json({ error: 'Too many requests' });
  },
}));
```

---

## `MemoryStore`

Low-level in-memory store. Use this if you need direct store access.

```typescript
import { MemoryStore } from 'node-rate-limiter-pro';

const store = new MemoryStore({
  algorithm: 'sliding-window',
  limit: 100,
  window: 60_000,
});

const result = await store.consume('key');
await store.reset('key');
await store.close();
```

---

## `RedisStore`

Low-level Redis store. Use this if you need direct store access.

```typescript
import { RedisStore } from 'node-rate-limiter-pro';
import Redis from 'ioredis';

const store = new RedisStore({
  algorithm: 'sliding-window',
  limit: 100,
  window: 60_000,
  client: new Redis(),
  prefix: 'rl:',
});

const result = await store.consume('key');
await store.reset('key');
await store.close();
```

---

## `Store` Interface

Both `MemoryStore` and `RedisStore` implement this interface. You can create custom stores.

```typescript
interface Store {
  consume(key: string): Promise<RateLimitResult>;
  reset(key: string): Promise<void>;
  close(): Promise<void>;
}
```

---

## Type Exports

All types are exported from the main entry point:

```typescript
import type {
  RateLimitResult,
  RateLimiterOptions,
  RedisStoreOptions,
  RedisLike,
  Store,
  Algorithm,
} from 'node-rate-limiter-pro';
```

### `RedisLike`

Minimal interface for Redis-compatible clients. You don't need to use ioredis specifically — any object matching this interface will work:

```typescript
interface RedisLike {
  eval(...args: any[]): Promise<any>;
  del(...keys: string[]): Promise<number>;
}
```
