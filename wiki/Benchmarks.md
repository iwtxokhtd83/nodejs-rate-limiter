# Benchmarks

Performance is a first-class concern for node-rate-limiter-pro. All benchmarks measure raw throughput of the rate limiting logic without HTTP overhead.

## Running Benchmarks

```bash
# Full benchmark suite
npm run benchmark

# Comparison with express-rate-limit
npm run benchmark:compare
```

## Results

Tested on Node.js v24, Windows, 5-second sustained test per scenario.

### Core Performance

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

### Key Takeaways

- **Single-key throughput:** Both algorithms achieve ~2M+ ops/sec
- **Multi-key throughput:** ~1.5M ops/sec across 10,000 unique keys
- **Sub-microsecond latency:** Average latency is under 1μs for single-key operations
- **p99 latency:** 1μs for single-key, 14μs for concurrent operations

### Comparison with express-rate-limit

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

## Why Is It Faster?

### O(1) Algorithms

- **Sliding Window** uses a weighted counter approach with two sub-windows. No timestamp arrays, no sorting, no filtering — just two counters and arithmetic.
- **Token Bucket** uses simple arithmetic to calculate token refill. No timers, no intervals.

### Zero Allocation Hot Path

Neither algorithm allocates objects or arrays on the hot path. The only allocation happens when a new key is seen for the first time.

### Minimal Abstraction

The core `consume()` path has minimal indirection:
1. `RateLimiter.consume()` → `Store.consume()` → `Algorithm.consume()`
2. No middleware wrapping, no event emission, no logging in the core path

### Atomic Redis Operations

For Redis mode, each `consume()` is a single Lua script execution:
- One network round-trip
- No multi-step transactions
- No distributed locks
- Redis executes the Lua script atomically

## Benchmark Methodology

- Each test runs for 5 seconds of sustained load
- Operations are sequential (not batched) to measure true per-operation latency
- Latency is measured with `performance.now()` (sub-millisecond precision)
- p99 latency is calculated from sorted latency samples
- The "multi-key" tests use 10,000 unique keys to simulate real-world cardinality
- The "concurrent" test fires 10 parallel `consume()` calls per iteration

## Your Own Benchmarks

Results vary by hardware. Run the benchmarks on your target environment:

```bash
git clone https://github.com/iwtxokhtd83/nodejs-rate-limiter.git
cd nodejs-rate-limiter
npm install
npm run benchmark
npm run benchmark:compare
```
