import type { Store, RateLimitResult, RedisStoreOptions, RedisLike } from '../types';

// Sliding window Lua script — atomic operation
const SLIDING_WINDOW_SCRIPT = `
local key = KEYS[1]
local now = tonumber(ARGV[1])
local window = tonumber(ARGV[2])
local limit = tonumber(ARGV[3])

local windowStart = now - window
redis.call('ZREMRANGEBYSCORE', key, '-inf', windowStart)

local count = redis.call('ZCARD', key)

if count < limit then
  local seq = redis.call('INCR', key .. ':seq')
  redis.call('ZADD', key, now, now .. '-' .. seq)
  redis.call('PEXPIRE', key, window)
  redis.call('PEXPIRE', key .. ':seq', window)
  return {1, limit - count - 1, 0}
end

local oldest = redis.call('ZRANGE', key, 0, 0, 'WITHSCORES')
local retryAfter = 0
if #oldest >= 2 then
  retryAfter = tonumber(oldest[2]) + window - now
end

return {0, 0, retryAfter}
`;

// Token bucket Lua script — atomic operation
const TOKEN_BUCKET_SCRIPT = `
local key = KEYS[1]
local now = tonumber(ARGV[1])
local maxTokens = tonumber(ARGV[2])
local refillInterval = tonumber(ARGV[3])

local data = redis.call('HMGET', key, 'tokens', 'lastRefill')
local tokens = tonumber(data[1])
local lastRefill = tonumber(data[2])

if tokens == nil then
  tokens = maxTokens
  lastRefill = now
end

local elapsed = now - lastRefill
local tokensToAdd = (elapsed / refillInterval) * maxTokens
tokens = math.min(maxTokens, tokens + tokensToAdd)
lastRefill = now

if tokens >= 1 then
  tokens = tokens - 1
  redis.call('HMSET', key, 'tokens', tokens, 'lastRefill', lastRefill)
  redis.call('PEXPIRE', key, refillInterval)
  return {1, math.floor(tokens), 0}
end

local retryAfter = math.ceil(((1 - tokens) / maxTokens) * refillInterval)
redis.call('HMSET', key, 'tokens', tokens, 'lastRefill', lastRefill)
redis.call('PEXPIRE', key, refillInterval)
return {0, 0, retryAfter}
`;

export class RedisStore implements Store {
  private client: RedisLike;
  private limit: number;
  private window: number;
  private prefix: string;
  private algorithm: 'token-bucket' | 'sliding-window';

  constructor(options: RedisStoreOptions) {
    this.client = options.client;
    this.limit = options.limit;
    this.window = options.window;
    this.prefix = options.prefix ?? 'rl:';
    this.algorithm = options.algorithm ?? 'sliding-window';
  }

  async consume(key: string): Promise<RateLimitResult> {
    const fullKey = this.prefix + key;
    const now = Date.now();

    let result: number[];

    if (this.algorithm === 'sliding-window') {
      result = await this.client.eval(
        SLIDING_WINDOW_SCRIPT,
        1,
        fullKey,
        now,
        this.window,
        this.limit,
      );
    } else {
      result = await this.client.eval(
        TOKEN_BUCKET_SCRIPT,
        1,
        fullKey,
        now,
        this.limit,
        this.window,
      );
    }

    const [allowed, remaining, retryAfter] = result;

    return {
      allowed: allowed === 1,
      remaining,
      limit: this.limit,
      resetAt: now + this.window,
      retryAfter: Math.max(0, retryAfter),
    };
  }

  async reset(key: string): Promise<void> {
    await this.client.del(this.prefix + key);
  }

  async close(): Promise<void> {
    // Don't disconnect — the user owns the client lifecycle
  }
}
