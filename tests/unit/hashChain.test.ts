import { AuditHashChainService, GENESIS_HASH } from '../../src/security/hashChain';
import { AuditLog } from '../../src/types';

describe('AuditHashChainService (Cryptographic Audit Trail)', () => {
  const hashChainService = new AuditHashChainService();

  it('should compute valid deterministic block hashes and verify intact chain', () => {
    const logs: AuditLog[] = [];
    let prevHash = GENESIS_HASH;

    for (let i = 0; i < 5; i++) {
      const now = new Date(Date.now() + i * 1000);
      const id = `log_${i}`;
      const blockHash = hashChainService.computeBlockHash({
        previousHash: prevHash,
        id,
        actorId: 'u123',
        action: 'USER_LOGIN',
        resource: 'User',
        resourceId: 'u123',
        createdAt: now,
        details: { step: i }
      });

      logs.push({
        id,
        actor_id: 'u123',
        actor_role: 'PATIENT',
        action: 'USER_LOGIN',
        resource: 'User',
        resource_id: 'u123',
        previous_hash: prevHash,
        block_hash: blockHash,
        created_at: now,
        details: { step: i }
      });

      prevHash = blockHash;
    }

    const verification = hashChainService.verifyChain(logs);
    expect(verification.isValid).toBe(true);
  });

  it('should detect when an audit log in the chain has been modified (tampering)', () => {
    const logs: AuditLog[] = [];
    let prevHash = GENESIS_HASH;

    for (let i = 0; i < 3; i++) {
      const now = new Date(Date.now() + i * 1000);
      const id = `log_${i}`;
      const blockHash = hashChainService.computeBlockHash({
        previousHash: prevHash,
        id,
        actorId: 'u123',
        action: 'USER_LOGIN',
        resource: 'User',
        createdAt: now
      });

      logs.push({
        id,
        actor_id: 'u123',
        action: 'USER_LOGIN',
        resource: 'User',
        previous_hash: prevHash,
        block_hash: blockHash,
        created_at: now
      });

      prevHash = blockHash;
    }

    // Tamper with record at index 1
    logs[1].action = 'UNAUTHORIZED_ADMIN_ESCALATION';

    const verification = hashChainService.verifyChain(logs);
    expect(verification.isValid).toBe(false);
    expect(verification.errorIndex).toBe(1);
    expect(verification.reason).toContain('Block hash mismatch');
  });
});
