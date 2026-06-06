import "server-only";

type Bucket = {
  timestamps: number[];
};

const buckets = new Map<string, Bucket>();

export type RateLimitConfig = {
  key: string;
  maxRequests: number;
  windowMs: number;
};

export type RateLimitResult =
  | { ok: true }
  | { ok: false; retryAfterSeconds: number };

function prune(bucket: Bucket, now: number, windowMs: number): void {
  const cutoff = now - windowMs;
  bucket.timestamps = bucket.timestamps.filter((stamp) => stamp > cutoff);
}

export function checkRateLimit(config: RateLimitConfig): RateLimitResult {
  const now = Date.now();
  let bucket = buckets.get(config.key);
  if (!bucket) {
    bucket = { timestamps: [] };
    buckets.set(config.key, bucket);
  }

  prune(bucket, now, config.windowMs);
  if (bucket.timestamps.length >= config.maxRequests) {
    const oldest = bucket.timestamps[0] ?? now;
    const retryAfterSeconds = Math.max(1, Math.ceil((oldest + config.windowMs - now) / 1000));
    return { ok: false, retryAfterSeconds };
  }

  bucket.timestamps.push(now);
  return { ok: true };
}

export function rateLimitKey(scope: string, identity: string): string {
  return `${scope}:${identity}`;
}

export function resetRateLimitsForTests(): void {
  buckets.clear();
}
