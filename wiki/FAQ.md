# FAQ

## General

### What's the difference between sliding window and token bucket?

**Sliding window** enforces a strict count within a rolling time window. If you set 100 requests per minute, you'll never exceed 100 in any 60-second period.

**Token bucket** allows bursts. If a user has been idle, they accumulate tokens and can use them all at once. The average rate is maintained, but short-term spikes are allowed.

See [[Algorithms]] for detailed explanations.

### Which algorithm should I use?

- **API rate limiting** → Sliding Window (strict, predictable)
- **Login protection** → Sliding Window (no bursts allowed)
- **General traffic shaping** → Token Bucket (user-friendly)
- **File upload limits** → Token Bucket (allow burst uploads)

### Does it work without Redis?

Yes. The default mode is in-memory with zero dependencies. Redis is only needed for distributed (multi-server) rate limiting.

### Does it work with JavaScript (not TypeScript)?

Yes. The published package includes compiled JavaScript with TypeScript declaration files. Works with both CommonJS (`require`) and can be used in any Node.js project.

---

## Redis

### Do I need Redis?

Only if you need rate limiting across multiple servers or processes. For a single Node.js process, the in-memory store is faster and simpler.

### What Redis versions are supported?

Redis 6.0 or later. The Lua scripts use standard commands compatible with all modern Redis versions.

### Does it work with Redis Cluster?

Yes. Pass an ioredis Cluster client. See [[Redis & Distributed Mode]].

### What happens if Redis goes down?

The `consume()` call will throw an error. You should handle this in your application:

```typescript
try {
  const result = await limiter.consume(key);
  if (!result.allowed) return res.status(429).send();
} catch (err) {
  // Redis is down — fail open or fail closed
  console.error('Rate limiter error:', err);
  // Fail open: allow the request
  // Fail closed: return 503
}
```

### Can I use the same Redis instance for other things?

Yes. Use the `prefix` option to namespace rate limit keys:

```typescript
const limiter = new RateLimiter({
  limit: 100, window: 60_000,
  client: redis,
  prefix: 'rl:api:',
});
```

---

## Express

### Does it work with Express 5?

Yes. The middleware uses the standard `(req, res, next)` pattern which is compatible with Express 4.x and 5.x.

### Can I use it with Fastify / Koa / Hapi?

The middleware is Express/Connect-specific, but you can use the core `consume()` API with any framework:

```typescript
// Fastify example
fastify.addHook('onRequest', async (request, reply) => {
  const result = await limiter.consume(request.ip);
  if (!result.allowed) {
    reply.code(429).send({ error: 'Too Many Requests' });
  }
});
```

### How do I rate limit by API key instead of IP?

Use the `keyFn` option:

```typescript
app.use(limiter.middleware({
  keyFn: (req) => req.headers['x-api-key'] || req.ip,
}));
```

---

## Performance

### How fast is it?

In-memory mode: ~2M+ ops/sec with sub-microsecond latency. See [[Benchmarks]] for detailed numbers.

### Is it faster than express-rate-limit?

Yes, approximately 10x faster in raw throughput. See [[Benchmarks]] for the comparison.

### Why is the memory store so much faster than Redis?

The memory store operates entirely in-process with no I/O. Redis requires a network round-trip for each operation, which adds ~0.1–5ms of latency depending on your network.

### Does it leak memory?

No. For the memory store:
- **Sliding Window** — each key uses a fixed ~24 bytes (two counters + timestamp)
- **Token Bucket** — each key uses a fixed ~16 bytes (token count + timestamp)

Keys are stored in a `Map`. If you have millions of unique keys, consider using Redis or implementing periodic cleanup.

---

## Troubleshooting

### "Cannot find module 'ioredis'"

ioredis is an optional peer dependency. Install it only if you need Redis support:

```bash
npm install ioredis
```

### Rate limit seems inaccurate with sliding window

The sliding window counter uses a weighted approximation. It's accurate within ~1% of a true sliding window. This is by design — the tradeoff is O(1) performance instead of O(n).

### Rate limit resets when my server restarts

The in-memory store doesn't persist state. Use Redis if you need rate limits to survive restarts.
