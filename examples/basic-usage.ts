import { RateLimiter } from '../src';

async function main() {
  // Sliding window: 10 requests per 1 second
  const limiter = new RateLimiter({
    algorithm: 'sliding-window',
    limit: 10,
    window: 1000,
  });

  console.log('--- Sliding Window Demo ---');
  for (let i = 0; i < 12; i++) {
    const result = await limiter.consume('user:1');
    console.log(
      `Request ${i + 1}: ${result.allowed ? '✅ Allowed' : '❌ Blocked'} | Remaining: ${result.remaining}`,
    );
  }

  // Token bucket: 5 tokens, refills over 2 seconds
  const bucketLimiter = new RateLimiter({
    algorithm: 'token-bucket',
    limit: 5,
    window: 2000,
  });

  console.log('\n--- Token Bucket Demo ---');
  for (let i = 0; i < 7; i++) {
    const result = await bucketLimiter.consume('user:2');
    console.log(
      `Request ${i + 1}: ${result.allowed ? '✅ Allowed' : '❌ Blocked'} | Remaining: ${result.remaining} | Retry after: ${result.retryAfter}ms`,
    );
  }
}

main();
