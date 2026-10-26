import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import { db } from '../storage/repository';
import { idempotencyHitsCounter } from '../observability/metrics';
import { IdempotencyConflictError, ValidationError } from '../domain/errors';
import { logger } from '../observability/logger';

// In-memory set for tracking active in-flight idempotency keys
const inFlightKeys = new Set<string>();

export const idempotencyMiddleware = async (req: Request, res: Response, next: NextFunction) => {
  // Only enforce for mutating requests
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
    return next();
  }

  const idempotencyKey = req.header('Idempotency-Key');
  if (!idempotencyKey) {
    // If not supplied, proceed without idempotency caching
    return next();
  }

  // Generate SHA-256 hash of the request payload to prevent payload tampering under same key
  const bodyString = JSON.stringify(req.body || {});
  const requestHash = crypto.createHash('sha256').update(`${req.method}:${req.originalUrl}:${bodyString}`).digest('hex');

  // Check if currently executing concurrently
  if (inFlightKeys.has(idempotencyKey)) {
    return next(new IdempotencyConflictError('A request with this Idempotency-Key is currently in-flight.'));
  }

  try {
    // Check if key already exists in persistence
    const existing = await db.getIdempotencyRecord(idempotencyKey);
    if (existing) {
      // Validate request hash
      if (existing.request_hash !== requestHash) {
        return next(
          new ValidationError(
            'Idempotency key reused with mismatched request payload or target endpoint.',
            { key: idempotencyKey }
          )
        );
      }

      // Cache hit: replay response
      idempotencyHitsCounter.inc();
      logger.info({ idempotencyKey }, 'Serving idempotent cached response');
      res.setHeader('X-Cache', 'HIT-IDEMPOTENCY');
      return res.status(existing.response_code).json(existing.response_body);
    }

    // Mark as in-flight
    inFlightKeys.add(idempotencyKey);

    // Intercept response
    const originalJson = res.json.bind(res);
    const originalSend = res.send.bind(res);

    let responseCaptured = false;

    res.json = (body: any): Response => {
      if (!responseCaptured) {
        responseCaptured = true;
        inFlightKeys.delete(idempotencyKey);

        // Only cache successful or intentional client responses (status < 500)
        if (res.statusCode < 500) {
          const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours TTL
          db.saveIdempotencyRecord({
            key: idempotencyKey,
            user_id: req.user?.userId,
            request_hash: requestHash,
            response_code: res.statusCode,
            response_body: body,
            expires_at: expiresAt,
            created_at: new Date()
          }).catch(err => {
            logger.error({ err, idempotencyKey }, 'Failed to save idempotency cache record');
          });
        }
      }
      return originalJson(body);
    };

    res.on('finish', () => {
      inFlightKeys.delete(idempotencyKey);
    });

    res.on('close', () => {
      inFlightKeys.delete(idempotencyKey);
    });

    next();
  } catch (err) {
    inFlightKeys.delete(idempotencyKey);
    next(err);
  }
};
