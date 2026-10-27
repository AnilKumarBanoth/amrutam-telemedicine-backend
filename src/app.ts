import express, { Express } from 'express';
import helmet from 'helmet';
import cors from 'cors';
import path from 'path';
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
          scriptSrc: ["'self'", "'unsafe-inline'"],
          styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
          fontSrc: ["'self'", 'https://fonts.gstatic.com'],
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

  // 4. Static Files for Interactive Control Dashboard
  app.use(express.static(path.join(process.cwd(), 'public')));

  // 5. Observability: Distributed Tracing & Prometheus Duration Timer
  app.use(requestTracerMiddleware);

  // 6. Sliding Window Rate Limiting
  app.use(rateLimitMiddleware);

  // 7. Mount API routes
  app.use(apiRouter);

  // 8. Global Centralized Error Handler
  app.use(errorHandlerMiddleware);

  return app;
};
