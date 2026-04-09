# Express Middleware

node-rate-limiter-pro includes a built-in Express/Connect-compatible middleware factory.

## Basic Usage

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

app.get('/api/data', (req, res) => {
  res.json({ data: 'Hello!' });
});

app.listen(3000);
```

## Response Headers

The middleware automatically sets standard rate limit headers on every response:

| Header | Description | Example |
|---|---|---|
| `X-RateLimit-Limit` | Maximum requests allowed in the window | `100` |
| `X-RateLimit-Remaining` | Remaining requests in the current window | `87` |
| `X-RateLimit-Reset` | Unix timestamp (ms) when the window resets | `1704067200000` |
| `Retry-After` | Seconds until next request is allowed (429 only) | `30` |

## Custom Cost Function

By default, each request costs 1 token. Use `costFn` to assign variable costs:

```typescript
// Batch API: cost = number of items
app.use(limiter.middleware({
  costFn: (req) => req.body?.items?.length || 1,
}));

// File upload: cost = file size in MB
app.use('/upload', limiter.middleware({
  costFn: (req) => Math.ceil((req.headers['content-length'] || 1) / 1_000_000),
}));
```

## Custom Key Function

By default, the middleware uses `req.ip` as the rate limit key. You can customize this:

```typescript
// Rate limit by API key
app.use(limiter.middleware({
  keyFn: (req) => req.headers['x-api-key'] || req.ip,
}));

// Rate limit by user ID (after auth middleware)
app.use(limiter.middleware({
  keyFn: (req) => req.user?.id || req.ip,
}));

// Rate limit by endpoint + IP
app.use(limiter.middleware({
  keyFn: (req) => `${req.method}:${req.path}:${req.ip}`,
}));
```

## Custom Error Response

```typescript
app.use(limiter.middleware({
  onLimited: (req, res) => {
    res.status(429).json({
      error: 'Rate limit exceeded',
      message: 'Please slow down and try again later.',
      documentation: 'https://api.example.com/docs/rate-limits',
    });
  },
}));
```

## Per-Route Rate Limiting

Apply different limits to different routes:

```typescript
// General API: 100 req/min
const apiLimiter = new RateLimiter({
  algorithm: 'sliding-window',
  limit: 100,
  window: 60_000,
});

// Auth endpoints: 5 req/min (strict)
const authLimiter = new RateLimiter({
  algorithm: 'sliding-window',
  limit: 5,
  window: 60_000,
});

// Upload endpoints: 10 req/hour
const uploadLimiter = new RateLimiter({
  algorithm: 'token-bucket',
  limit: 10,
  window: 3_600_000,
});

app.use('/api', apiLimiter.middleware());
app.use('/api/auth', authLimiter.middleware({ keyFn: (req) => `auth:${req.ip}` }));
app.use('/api/upload', uploadLimiter.middleware({ keyFn: (req) => `upload:${req.ip}` }));
```

## With Redis (Distributed)

```typescript
import Redis from 'ioredis';

const redis = new Redis();

const limiter = new RateLimiter({
  algorithm: 'sliding-window',
  limit: 100,
  window: 60_000,
  client: redis,
  prefix: 'api:rl:',
});

// Works across multiple servers
app.use(limiter.middleware());
```

## Error Handling

If the rate limiter throws an error (e.g., Redis connection failure), the middleware automatically forwards it to Express's error handler via `next(err)`. You can implement "fail open" or "fail closed" strategies:

```typescript
app.use(limiter.middleware());

// Error handler
app.use((err, req, res, next) => {
  if (err.message.includes('Redis')) {
    // Fail open: allow the request through
    console.error('Rate limiter error:', err);
    return next();
  }
  res.status(500).json({ error: 'Internal Server Error' });
});
```

## Compatibility

The middleware works with any framework that uses the `(req, res, next)` pattern:

- Express 4.x / 5.x
- Connect
- Polka
- Restify (with minor adapter)
