import { Request, Response, NextFunction } from 'express';
import { config } from '../config/env';
import { RateLimitExceededError } from '../domain/errors';

interface RateLimitBucket {
  tokens: number;
  lastRefill: number;
}

export class SlidingWindowRateLimiter {
  private buckets = new Map<string, RateLimitBucket>();
  private windowMs: number;
  private maxRequests: number;

  constructor(windowMs = config.RATE_LIMIT_WINDOW_MS, maxRequests = config.RATE_LIMIT_MAX_REQUESTS) {
    this.windowMs = windowMs;
    this.maxRequests = maxRequests;

    // Periodic cleanup of stale buckets every 5 minutes
    const timer = setInterval(() => {
      const now = Date.now();
      for (const [key, bucket] of this.buckets.entries()) {
        if (now - bucket.lastRefill > this.windowMs * 2) {
          this.buckets.delete(key);
        }
      }
    }, 300000);

    if (timer.unref) {
      timer.unref();
    }
  }

  public getMiddleware() {
    return (req: Request, res: Response, next: NextFunction) => {
      // Key can be authenticated user ID or remote IP address
      const identifier = req.user?.userId || req.ip || req.socket.remoteAddress || 'unknown-client';
      const now = Date.now();

      let bucket = this.buckets.get(identifier);
      if (!bucket) {
        bucket = {
          tokens: this.maxRequests,
          lastRefill: now
        };
        this.buckets.set(identifier, bucket);
      } else {
        // Refill tokens proportionally to time elapsed
        const elapsed = now - bucket.lastRefill;
        if (elapsed > 0) {
          const refillAmount = (elapsed / this.windowMs) * this.maxRequests;
          bucket.tokens = Math.min(this.maxRequests, bucket.tokens + refillAmount);
          bucket.lastRefill = now;
        }
      }

      const resetTime = Math.ceil((bucket.lastRefill + this.windowMs) / 1000);
      res.setHeader('X-RateLimit-Limit', this.maxRequests);
      res.setHeader('X-RateLimit-Reset', resetTime);

      if (bucket.tokens >= 1) {
        bucket.tokens -= 1;
        res.setHeader('X-RateLimit-Remaining', Math.floor(bucket.tokens));
        return next();
      }

      res.setHeader('X-RateLimit-Remaining', 0);
      return next(new RateLimitExceededError(`Rate limit of ${this.maxRequests} requests per minute exceeded.`));
    };
  }
}

export const rateLimiter = new SlidingWindowRateLimiter();
export const rateLimitMiddleware = rateLimiter.getMiddleware();
