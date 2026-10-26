import { Request, Response, NextFunction } from 'express';
import { AppError } from '../domain/errors';
import { logger } from '../observability/logger';
import { config } from '../config/env';

export const errorHandlerMiddleware = (err: Error, req: Request, res: Response, next: NextFunction) => {
  const traceId = req.traceId || 'unknown';

  if (err instanceof AppError) {
    if (err.statusCode >= 500) {
      logger.error({ err, traceId, url: req.originalUrl, method: req.method }, 'Application operational server error');
    } else {
      logger.warn({ err: err.message, code: err.code, traceId, url: req.originalUrl }, 'Client request rejected');
    }

    return res.status(err.statusCode).json({
      success: false,
      error: {
        code: err.code,
        message: err.message,
        details: err.details,
        traceId
      }
    });
  }

  // Unhandled / programmer errors
  logger.error({ err, traceId, stack: err.stack, url: req.originalUrl, method: req.method }, 'Unhandled internal server error');

  return res.status(500).json({
    success: false,
    error: {
      code: 'INTERNAL_SERVER_ERROR',
      message: config.NODE_ENV === 'production' ? 'An unexpected internal server error occurred.' : err.message,
      traceId
    }
  });
};
