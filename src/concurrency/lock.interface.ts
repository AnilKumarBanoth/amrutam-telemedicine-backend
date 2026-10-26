export interface ILockService {
  acquire(resourceKey: string, ttlMs?: number): Promise<string | null>;
  release(resourceKey: string, lockToken: string): Promise<boolean>;
  withLock<T>(resourceKey: string, ttlMs: number, fn: () => Promise<T>): Promise<T>;
}
