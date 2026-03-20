import { RateLimiter } from '../src';

interface BenchmarkResult {
  name: string;
  opsPerSec: number;
  avgLatencyUs: number;
  p99LatencyUs: number;
  totalOps: number;
  durationMs: number;
}

async function bench(
  name: string,
  fn: () => Promise<void>,
  durationMs = 5000,
): Promise<BenchmarkResult> {
  const latencies: number[] = [];
  const start = performance.now();
  let ops = 0;

  while (performance.now() - start < durationMs) {
    const opStart = performance.now();
    await fn();
    latencies.push((performance.now() - opStart) * 1000); // μs
    ops++;
  }

  const elapsed = performance.now() - start;
  latencies.sort((a, b) => a - b);

  return {
    name,
    opsPerSec: Math.round((ops / elapsed) * 1000),
    avgLatencyUs: Math.round(latencies.reduce((a, b) => a + b, 0) / latencies.length),
    p99LatencyUs: Math.round(latencies[Math.floor(latencies.length * 0.99)]),
    totalOps: ops,
    durationMs: Math.round(elapsed),
  };
}

function formatNumber(n: number): string {
  return n.toLocaleString('en-US');
}

function printResults(results: BenchmarkResult[]) {
  console.log('\n' + '='.repeat(80));
  console.log('  BENCHMARK RESULTS');
  console.log('='.repeat(80));
  console.log(
    `${'Name'.padEnd(35)} ${'ops/sec'.padStart(12)} ${'avg (μs)'.padStart(10)} ${'p99 (μs)'.padStart(10)}`,
  );
  console.log('-'.repeat(80));

  for (const r of results) {
    console.log(
      `${r.name.padEnd(35)} ${formatNumber(r.opsPerSec).padStart(12)} ${formatNumber(r.avgLatencyUs).padStart(10)} ${formatNumber(r.p99LatencyUs).padStart(10)}`,
    );
  }
  console.log('='.repeat(80) + '\n');
}

async function main() {
  console.log('🚀 nodejs-rate-limiter benchmark');
  console.log(`   Node.js ${process.version}`);
  console.log(`   Running each test for 5 seconds...\n`);

  const results: BenchmarkResult[] = [];

  // --- Sliding Window (Memory) ---
  const swLimiter = new RateLimiter({
    algorithm: 'sliding-window',
    limit: 1_000_000, // High limit so we don't get blocked
    window: 60_000,
  });
  results.push(
    await bench('Sliding Window (memory)', () => swLimiter.consume('bench-key')),
  );

  // --- Token Bucket (Memory) ---
  const tbLimiter = new RateLimiter({
    algorithm: 'token-bucket',
    limit: 1_000_000,
    window: 60_000,
  });
  results.push(
    await bench('Token Bucket (memory)', () => tbLimiter.consume('bench-key')),
  );

  // --- Sliding Window (Memory) — multiple keys ---
  const swMultiKey = new RateLimiter({
    algorithm: 'sliding-window',
    limit: 1000,
    window: 60_000,
  });
  let keyCounter = 0;
  results.push(
    await bench('Sliding Window (multi-key)', () =>
      swMultiKey.consume(`user:${keyCounter++ % 10000}`),
    ),
  );

  // --- Token Bucket (Memory) — multiple keys ---
  const tbMultiKey = new RateLimiter({
    algorithm: 'token-bucket',
    limit: 1000,
    window: 60_000,
  });
  let keyCounter2 = 0;
  results.push(
    await bench('Token Bucket (multi-key)', () =>
      tbMultiKey.consume(`user:${keyCounter2++ % 10000}`),
    ),
  );

  // --- Concurrent access simulation ---
  const concurrentLimiter = new RateLimiter({
    algorithm: 'sliding-window',
    limit: 1_000_000,
    window: 60_000,
  });
  results.push(
    await bench('Sliding Window (10x concurrent)', async () => {
      await Promise.all(
        Array.from({ length: 10 }, (_, i) =>
          concurrentLimiter.consume(`concurrent:${i}`),
        ),
      );
    }),
  );

  printResults(results);
}

main().catch(console.error);
