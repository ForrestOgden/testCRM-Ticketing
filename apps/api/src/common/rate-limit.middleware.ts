import type { NextFunction, Request, Response } from "express";

interface Bucket { count: number; resetAt: number }
const buckets = new Map<string, Bucket>();
let lastSweep = Date.now();

export function rateLimitMiddleware(req: Request, res: Response, next: NextFunction) {
  const now = Date.now();
  const windowMs = Math.max(1000, Number(process.env.RATE_LIMIT_WINDOW_MS ?? 60000));
  const limit = Math.max(1, Number(process.env.RATE_LIMIT_REQUESTS ?? 240));
  const key = req.ip || req.socket.remoteAddress || "unknown";

  if (now - lastSweep > windowMs) {
    for (const [bucketKey, bucket] of buckets) if (bucket.resetAt <= now) buckets.delete(bucketKey);
    lastSweep = now;
  }

  const current = buckets.get(key);
  const bucket = !current || current.resetAt <= now ? { count: 0, resetAt: now + windowMs } : current;
  bucket.count += 1;
  buckets.set(key, bucket);

  res.setHeader("RateLimit-Limit", limit);
  res.setHeader("RateLimit-Remaining", Math.max(0, limit - bucket.count));
  res.setHeader("RateLimit-Reset", Math.ceil(bucket.resetAt / 1000));

  if (bucket.count > limit) {
    res.setHeader("Retry-After", Math.max(1, Math.ceil((bucket.resetAt - now) / 1000)));
    res.status(429).json({ statusCode: 429, message: "Too many requests" });
    return;
  }
  next();
}
