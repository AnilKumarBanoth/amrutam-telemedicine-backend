import express, { Express } from 'express';
import helmet from 'helmet';
import cors from 'cors';
import { apiRouter } from './routes/api.router';
import { requestTracerMiddleware } from './middleware/requestTracer.middleware';
import { rateLimitMiddleware } from './middleware/rateLimiter.middleware';
import { errorHandlerMiddleware } from './middleware/errorHandler.middleware';

export const createApp = (): Express => {
  const app = express();

  // 1. Security Headers (OWASP Top 10 hardening)
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          imgSrc: ["'self'", 'data:', 'https:']
        }
      },
      hsts: {
        maxAge: 31536000,
        includeSubDomains: true,
        preload: true
      }
    })
  );

  // 2. Cross-Origin Resource Sharing
  app.use(
    cors({
      origin: '*',
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'Idempotency-Key', 'traceparent', 'X-Requested-With']
    })
  );

  // 3. Body Parsers with payload limits
  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: true, limit: '1mb' }));

  // 4. Observability: Distributed Tracing & Prometheus Duration Timer
  app.use(requestTracerMiddleware);

  // 5. Sliding Window Rate Limiting
  app.use(rateLimitMiddleware);

  // 6. Mount API routes
  app.use(apiRouter);

  // 7. Global Centralized Error Handler
  app.use(errorHandlerMiddleware);

  return app;
};
