/**
 * Comparison benchmark: nodejs-rate-limiter vs express-rate-limit
 *
 * Measures raw throughput of the rate limiting logic (no HTTP overhead).
 */
import { RateLimiter } from '../src';

interface CompareResult {
  name: string;
  opsPerSec: number;
  avgLatencyUs: number;
}

async function bench(
  name: string,
  fn: () => Promise<void>,
  durationMs = 5000,
): Promise<CompareResult> {
  const latencies: number[] = [];
  const start = performance.now();
  let ops = 0;

  while (performance.now() - start < durationMs) {
    const opStart = performance.now();
    await fn();
    latencies.push((performance.now() - opStart) * 1000);
    ops++;
  }

  const elapsed = performance.now() - start;

  return {
    name,
    opsPerSec: Math.round((ops / elapsed) * 1000),
    avgLatencyUs: Math.round(latencies.reduce((a, b) => a + b, 0) / latencies.length),
  };
}

function formatNumber(n: number): string {
  return n.toLocaleString('en-US');
}

async function main() {
  console.log('📊 Comparison Benchmark');
  console.log(`   Node.js ${process.version}`);
  console.log('   Running each test for 5 seconds...\n');

  const results: CompareResult[] = [];

  // --- nodejs-rate-limiter (sliding window) ---
  const rl = new RateLimiter({
    algorithm: 'sliding-window',
    limit: 1_000_000,
    window: 60_000,
  });
  results.push(await bench('nodejs-rate-limiter (sliding-window)', () => rl.consume('key')));

  // --- nodejs-rate-limiter (token bucket) ---
  const tb = new RateLimiter({
    algorithm: 'token-bucket',
    limit: 1_000_000,
    window: 60_000,
  });
  results.push(await bench('nodejs-rate-limiter (token-bucket)', () => tb.consume('key')));

  // --- express-rate-limit (for comparison) ---
  try {
    const { rateLimit } = await import('express-rate-limit');
    const expressLimiter = rateLimit({
      windowMs: 60_000,
      max: 1_000_000,
      standardHeaders: false,
      legacyHeaders: false,
    });

    // Simulate express req/res/next with enough properties for express-rate-limit
    const mockReq = {
      ip: '127.0.0.1',
      headers: {},
      app: { get: () => false },
      socket: { remoteAddress: '127.0.0.1' },
    } as any;

    const makeMockRes = () => {
      const res: any = {
        setHeader: () => res,
        set: () => res,
        status: () => res,
        json: () => res,
        send: () => res,
        end: () => res,
        headersSent: false,
      };
      return res;
    };

    results.push(
      await bench('express-rate-limit', () =>
        new Promise<void>((resolve) => {
          expressLimiter(mockReq, makeMockRes(), () => resolve());
        }),
      ),
    );
  } catch {
    console.log('⚠️  express-rate-limit not installed, skipping comparison.');
    console.log('   Install with: npm install express-rate-limit\n');
  }

  // Print comparison table
  console.log('\n' + '='.repeat(70));
  console.log('  COMPARISON RESULTS');
  console.log('='.repeat(70));
  console.log(
    `${'Library'.padEnd(45)} ${'ops/sec'.padStart(12)} ${'avg (μs)'.padStart(10)}`,
  );
  console.log('-'.repeat(70));

  for (const r of results) {
    console.log(
      `${r.name.padEnd(45)} ${formatNumber(r.opsPerSec).padStart(12)} ${formatNumber(r.avgLatencyUs).padStart(10)}`,
    );
  }
  console.log('='.repeat(70));

  if (results.length >= 3) {
    const ours = results[0].opsPerSec;
    const theirs = results[2].opsPerSec;
    const speedup = (ours / theirs).toFixed(1);
    console.log(`\n🏆 nodejs-rate-limiter is ~${speedup}x faster than express-rate-limit\n`);
  }
}

main().catch(console.error);
