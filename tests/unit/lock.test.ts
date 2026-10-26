import { DistributedLockManager } from '../../src/concurrency/distributedLock';
import { ConcurrencyLockError } from '../../src/domain/errors';

describe('DistributedLockManager (Concurrency & Mutual Exclusion)', () => {
  let lockManager: DistributedLockManager;

  beforeEach(() => {
    lockManager = new DistributedLockManager();
  });

  it('should acquire lock successfully and return a token', async () => {
    const token = await lockManager.acquire('slot:123', 5000);
    expect(token).toBeTruthy();
    expect(typeof token).toBe('string');
  });

  it('should reject concurrent acquisition on the same resource', async () => {
    const token1 = await lockManager.acquire('slot:123', 5000);
    expect(token1).toBeTruthy();

    const token2 = await lockManager.acquire('slot:123', 5000);
    expect(token2).toBeNull(); // Concurrency conflict prevented
  });

  it('should allow acquisition after lock is released with matching token', async () => {
    const token1 = await lockManager.acquire('slot:123', 5000);
    expect(token1).toBeTruthy();

    const released = await lockManager.release('slot:123', token1!);
    expect(released).toBe(true);

    const token2 = await lockManager.acquire('slot:123', 5000);
    expect(token2).toBeTruthy();
  });

  it('should not release lock if incorrect token is supplied', async () => {
    const token1 = await lockManager.acquire('slot:123', 5000);
    expect(token1).toBeTruthy();

    const released = await lockManager.release('slot:123', 'wrong-token');
    expect(released).toBe(false);

    // Lock must still be held
    const token2 = await lockManager.acquire('slot:123', 5000);
    expect(token2).toBeNull();
  });

  it('should execute inside withLock and release automatically', async () => {
    let executed = false;
    await lockManager.withLock('slot:123', 5000, async () => {
      executed = true;
    });

    expect(executed).toBe(true);

    // Resource should now be free
    const token = await lockManager.acquire('slot:123', 5000);
    expect(token).toBeTruthy();
  });
});
