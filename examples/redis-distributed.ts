/**
 * Redis-backed distributed rate limiter example.
 *
 * Requires a running Redis instance.
 * Run: npx tsx examples/redis-distributed.ts
 */
import Redis from 'ioredis';
import { RateLimiter } from '../src';

async function main() {
  const redis = new Redis(); // localhost:6379

  const limiter = new RateLimiter({
    algorithm: 'sliding-window',
    limit: 10,
    window: 5000,
    client: redis,
    prefix: 'myapp:rl:',
  });

  console.log('--- Redis Distributed Rate Limiter ---');
  console.log('Limit: 10 requests per 5 seconds\n');

  for (let i = 0; i < 12; i++) {
    const result = await limiter.consume('api:user:42');
    console.log(
      `Request ${i + 1}: ${result.allowed ? '✅ Allowed' : '❌ Blocked'} | Remaining: ${result.remaining}`,
    );
  }

  // Cleanup
  await limiter.reset('api:user:42');
  await redis.quit();
  console.log('\nDone. Redis connection closed.');
}

main().catch(console.error);
