import crypto from 'crypto';

export interface TraceContext {
  traceId: string;
  spanId: string;
  sampled: boolean;
}

export class DistributedTracer {
  /**
   * Generates a 16-byte (32 hex char) trace ID
   */
  public generateTraceId(): string {
    return crypto.randomBytes(16).toString('hex');
  }

  /**
   * Generates an 8-byte (16 hex char) span ID
   */
  public generateSpanId(): string {
    return crypto.randomBytes(8).toString('hex');
  }

  /**
   * Parses W3C traceparent header: 00-{traceId}-{spanId}-{flags}
   */
  public parseTraceParent(header?: string): TraceContext {
    if (header) {
      const parts = header.trim().split('-');
      if (parts.length === 4 && parts[0] === '00' && parts[1].length === 32 && parts[2].length === 16) {
        return {
          traceId: parts[1],
          spanId: parts[2],
          sampled: parts[3] === '01'
        };
      }
    }

    return {
      traceId: this.generateTraceId(),
      spanId: this.generateSpanId(),
      sampled: true
    };
  }

  /**
   * Formats trace context as W3C traceparent header
   */
  public formatTraceParent(context: TraceContext): string {
    const flags = context.sampled ? '01' : '00';
    return `00-${context.traceId}-${context.spanId}-${flags}`;
  }
}

export const tracer = new DistributedTracer();
