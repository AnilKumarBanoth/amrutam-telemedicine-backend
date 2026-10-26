import { logger } from '../observability/logger';

export interface Job<T = any> {
  id: string;
  name: string;
  data: T;
  attempts: number;
  maxAttempts: number;
  nextRunAt: number;
  error?: string;
}

export type JobHandler<T = any> = (data: T) => Promise<void>;

export class AsyncBackgroundQueue {
  private queue: Job[] = [];
  private deadLetterQueue: Job[] = [];
  private handlers = new Map<string, JobHandler>();
  private isProcessing = false;
  private intervalTimer: NodeJS.Timeout | null = null;

  constructor() {
    this.startWorker();
  }

  public registerHandler<T>(name: string, handler: JobHandler<T>) {
    this.handlers.set(name, handler);
  }

  /**
   * Calculates exponential backoff with full jitter (recommended by AWS Architecture)
   * Formula: delay = Math.random() * Math.min(maxBackoff, baseBackoff * (2 ** attempt))
   */
  public calculateBackoffWithJitter(attempt: number, baseBackoffMs = 1000, maxBackoffMs = 30000): number {
    const exponentialDelay = Math.min(maxBackoffMs, baseBackoffMs * Math.pow(2, attempt));
    // Full jitter randomly distributes load across [0, exponentialDelay]
    return Math.floor(Math.random() * exponentialDelay);
  }

  public enqueue<T>(name: string, data: T, maxAttempts = 3): string {
    const jobId = `job_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
    const job: Job<T> = {
      id: jobId,
      name,
      data,
      attempts: 0,
      maxAttempts,
      nextRunAt: Date.now()
    };
    this.queue.push(job);
    logger.debug({ jobId, name }, 'Enqueued background job');
    return jobId;
  }

  private startWorker() {
    if (this.intervalTimer) return;
    this.intervalTimer = setInterval(() => this.processNextBatch(), 200);
    if (this.intervalTimer.unref) {
      this.intervalTimer.unref();
    }
  }

  public stopWorker() {
    if (this.intervalTimer) {
      clearInterval(this.intervalTimer);
      this.intervalTimer = null;
    }
  }

  private async processNextBatch() {
    if (this.isProcessing || this.queue.length === 0) return;
    this.isProcessing = true;

    try {
      const now = Date.now();
      const readyJobIndex = this.queue.findIndex(j => j.nextRunAt <= now);
      if (readyJobIndex === -1) {
        this.isProcessing = false;
        return;
      }

      const [job] = this.queue.splice(readyJobIndex, 1);
      const handler = this.handlers.get(job.name);

      if (!handler) {
        logger.error({ jobName: job.name }, 'No registered handler for job. Routing to DLQ.');
        this.deadLetterQueue.push(job);
        this.isProcessing = false;
        return;
      }

      try {
        job.attempts++;
        await handler(job.data);
        logger.info({ jobId: job.id, jobName: job.name, attempts: job.attempts }, 'Background job completed successfully');
      } catch (err: any) {
        logger.warn({ jobId: job.id, jobName: job.name, attempt: job.attempts, error: err.message }, 'Background job failed');
        if (job.attempts < job.maxAttempts) {
          const delay = this.calculateBackoffWithJitter(job.attempts);
          job.nextRunAt = Date.now() + delay;
          job.error = err.message;
          this.queue.push(job);
          logger.info({ jobId: job.id, delayMs: delay }, 'Scheduled job retry with exponential backoff and jitter');
        } else {
          job.error = `Exceeded max attempts (${job.maxAttempts}): ${err.message}`;
          this.deadLetterQueue.push(job);
          logger.error({ jobId: job.id, jobName: job.name }, 'Job exceeded max retry attempts. Moved to Dead Letter Queue (DLQ).');
        }
      }
    } finally {
      this.isProcessing = false;
    }
  }

  public getQueueStats() {
    return {
      pending: this.queue.length,
      deadLetter: this.deadLetterQueue.length
    };
  }
}

export const asyncQueue = new AsyncBackgroundQueue();
