/**
 * Express middleware example.
 *
 * Run: npx tsx examples/express-middleware.ts
 * Test: curl -s http://localhost:3000/api/data (repeat rapidly)
 */
import express from 'express';
import { RateLimiter } from '../src';

const app = express();

// Global rate limiter: 100 requests per 60 seconds
const globalLimiter = new RateLimiter({
  algorithm: 'sliding-window',
  limit: 100,
  window: 60_000,
});

// Strict limiter for auth endpoints: 5 requests per 60 seconds
const authLimiter = new RateLimiter({
  algorithm: 'token-bucket',
  limit: 5,
  window: 60_000,
});

// Apply global rate limit
app.use(globalLimiter.middleware());

// Strict rate limit on login
app.post(
  '/api/login',
  authLimiter.middleware({
    keyFn: (req) => `login:${req.ip}`,
    onLimited: (_req, res) => {
      res.status(429).json({
        error: 'Too many login attempts. Please try again later.',
      });
    },
  }),
  (_req, res) => {
    res.json({ message: 'Login endpoint' });
  },
);

app.get('/api/data', (_req, res) => {
  res.json({ data: 'Hello, world!' });
});

app.listen(3000, () => {
  console.log('Server running on http://localhost:3000');
  console.log('Try: curl http://localhost:3000/api/data');
});
