# Algorithms

node-rate-limiter-pro ships with two rate limiting algorithms. Both run in O(1) time and space per key.

## Sliding Window Counter

### How It Works

The sliding window counter divides time into fixed sub-windows and uses a weighted average to estimate the request count in the current sliding window.

```
Time ──────────────────────────────────────────►

     ┌──────────────┐┌──────────────┐
     │  Previous     ││  Current     │
     │  Window       ││  Window      │
     │  count: 80    ││  count: 30   │
     └──────────────┘└──────────────┘
                          ▲
                          │ now (40% into current window)
                          │
     Weighted estimate = 80 × 0.6 + 30 = 78
     Limit = 100 → Allowed (22 remaining)
```

The weight of the previous window decreases linearly as time progresses through the current window. This provides a smooth approximation of a true sliding window without storing individual timestamps.

### Configuration

```typescript
const limiter = new RateLimiter({
  algorithm: 'sliding-window',
  limit: 100,       // max requests per window
  window: 60_000,   // window size: 60 seconds
});
```

### Characteristics

- **No burst allowance** at window boundaries (unlike fixed window counters)
- **O(1) time and space** per key — only stores two counters and a timestamp
- **Weighted approximation** — not exact, but highly accurate in practice
- **Smooth rate enforcement** — requests are evenly distributed

### Best For

- API rate limiting
- Login attempt protection
- Fair usage enforcement
- Any scenario where you want strict, predictable limits

---

## Token Bucket

### How It Works

Each key has a "bucket" that holds tokens. Tokens are consumed on each request and refill gradually over time.

```
Bucket capacity: 5 tokens
Refill rate: 5 tokens per 10 seconds (1 token every 2s)

Time 0s:  [●●●●●] 5 tokens — Request → allowed (4 left)
Time 0s:  [●●●●○] 4 tokens — Request → allowed (3 left)
Time 0s:  [●●●○○] 3 tokens — Request → allowed (2 left)
Time 2s:  [●●●○○] 3 tokens — 1 token refilled
Time 2s:  [●●●○○] 3 tokens — Request → allowed (2 left)
```

### Configuration

```typescript
const limiter = new RateLimiter({
  algorithm: 'token-bucket',
  limit: 100,       // bucket capacity (max tokens)
  window: 60_000,   // full refill interval: 60 seconds
});
```

### Characteristics

- **Allows bursts** — a full bucket can handle `limit` requests instantly
- **Smooth refill** — tokens regenerate continuously, not in chunks
- **O(1) time and space** — only stores token count and last refill time
- **Forgiving** — idle periods build up tokens for future bursts

### Best For

- Traffic shaping
- Allowing occasional bursts while maintaining average rate
- Smoothing bursty workloads
- User-facing APIs where occasional spikes are acceptable

---

## Algorithm Comparison

| Aspect | Sliding Window | Token Bucket |
|---|---|---|
| Burst behavior | Blocks bursts | Allows bursts up to capacity |
| Accuracy | Weighted approximation | Exact |
| Fairness | Very fair | Favors bursty clients |
| Complexity | O(1) | O(1) |
| Memory per key | 24 bytes | 16 bytes |
| Redis round-trips | 1 (Lua script) | 1 (Lua script) |

## Choosing the Right Algorithm

**Use Sliding Window when:**
- You need strict, predictable rate limits
- Fairness across clients is important
- You're protecting against abuse (login brute force, scraping)

**Use Token Bucket when:**
- You want to allow occasional traffic spikes
- User experience matters (don't penalize idle users)
- You're shaping traffic rather than enforcing hard limits
