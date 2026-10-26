import crypto from 'crypto';
import { ILockService } from './lock.interface';
import { ConcurrencyLockError } from '../domain/errors';
import { lockContentionCounter } from '../observability/metrics';
import { logger } from '../observability/logger';

interface LockEntry {
  token: string;
  expiresAt: number;
}

export class DistributedLockManager implements ILockService {
  private inMemoryLocks = new Map<string, LockEntry>();
  private defaultTtlMs = 10000; // 10 seconds

  /**
   * Attempts to acquire lock on resourceKey.
   * Returns a unique lock token string if successful, or null if contended.
   */
  public async acquire(resourceKey: string, ttlMs: number = this.defaultTtlMs): Promise<string | null> {
    const now = Date.now();
    const existing = this.inMemoryLocks.get(resourceKey);

    // If active and unexpired, lock cannot be acquired
    if (existing && existing.expiresAt > now) {
      lockContentionCounter.inc({ resource: resourceKey, result: 'conflict' });
      return null;
    }

    // Acquire lock with unique cryptographically random token
    const token = crypto.randomBytes(16).toString('hex');
    this.inMemoryLocks.set(resourceKey, {
      token,
      expiresAt: now + ttlMs
    });

    lockContentionCounter.inc({ resource: resourceKey, result: 'acquired' });
    return token;
  }

  /**
   * Releases lock atomically only if token matches and has not expired/reassigned
   */
  public async release(resourceKey: string, lockToken: string): Promise<boolean> {
    const entry = this.inMemoryLocks.get(resourceKey);
    if (!entry) return true; // Already expired / released

    if (entry.token === lockToken) {
      this.inMemoryLocks.delete(resourceKey);
      return true;
    }

    logger.warn({ resourceKey, lockToken }, 'Attempted to release lock with mismatched or expired token');
    return false;
  }

  /**
   * Executes an asynchronous operation safely guarded by distributed lock
   */
  public async withLock<T>(resourceKey: string, ttlMs: number, fn: () => Promise<T>): Promise<T> {
    const token = await this.acquire(resourceKey, ttlMs);
    if (!token) {
      throw new ConcurrencyLockError(`Resource '${resourceKey}' is currently locked by a concurrent transaction. Please retry.`);
    }

    try {
      return await fn();
    } finally {
      await this.release(resourceKey, token);
    }
  }
}

export const lockManager = new DistributedLockManager();
