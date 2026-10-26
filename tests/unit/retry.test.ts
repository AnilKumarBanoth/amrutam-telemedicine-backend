import { AsyncBackgroundQueue } from '../../src/queue/asyncQueue';

describe('Retry & Backoff Strategy with Full Jitter', () => {
  const queue = new AsyncBackgroundQueue();

  afterAll(() => {
    queue.stopWorker();
  });

  it('should calculate exponential backoff within bounds using full jitter', () => {
    for (let attempt = 1; attempt <= 5; attempt++) {
      const delay = queue.calculateBackoffWithJitter(attempt, 1000, 30000);
      const maxExpected = Math.min(30000, 1000 * Math.pow(2, attempt));

      expect(delay).toBeGreaterThanOrEqual(0);
      expect(delay).toBeLessThanOrEqual(maxExpected);
    }
  });

  it('should cap backoff delay at maxBackoffMs', () => {
    const delay = queue.calculateBackoffWithJitter(15, 1000, 30000);
    expect(delay).toBeLessThanOrEqual(30000);
  });
});
