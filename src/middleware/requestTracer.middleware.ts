import { Request, Response, NextFunction } from 'express';
import { tracer } from '../observability/tracer';
import { httpRequestCounter, httpRequestDuration } from '../observability/metrics';

// Extend Express Request interface
declare global {
  namespace Express {
    interface Request {
      traceId: string;
      spanId: string;
      startTime: [number, number];
    }
  }
}

export const requestTracerMiddleware = (req: Request, res: Response, next: NextFunction) => {
  const traceparent = req.header('traceparent');
  const context = tracer.parseTraceParent(traceparent);

  req.traceId = context.traceId;
  req.spanId = context.spanId;
  req.startTime = process.hrtime();

  // Set response tracing headers
  res.setHeader('X-Trace-Id', context.traceId);
  res.setHeader('X-Span-Id', context.spanId);
  res.setHeader('traceparent', tracer.formatTraceParent(context));

  // On response finish, record Prometheus metrics
  res.on('finish', () => {
    const diff = process.hrtime(req.startTime);
    const durationInSeconds = diff[0] + diff[1] / 1e9;

    const routePath = req.baseUrl + (req.route ? req.route.path : req.path);
    const statusCode = res.statusCode.toString();

    httpRequestCounter.inc({
      method: req.method,
      route: routePath,
      status_code: statusCode
    });

    httpRequestDuration.observe(
      {
        method: req.method,
        route: routePath,
        status_code: statusCode
      },
      durationInSeconds
    );
  });

  next();
};
