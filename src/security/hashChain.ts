import crypto from 'crypto';
import { AuditLog } from '../types';

export const GENESIS_HASH = '0000000000000000000000000000000000000000000000000000000000000000';

export class AuditHashChainService {
  /**
   * Computes the deterministic SHA-256 block hash for an audit record
   */
  public computeBlockHash(record: {
    previousHash: string;
    id: string;
    actorId?: string;
    action: string;
    resource: string;
    resourceId?: string;
    createdAt: Date | string;
    details?: any;
  }): string {
    const timeStr = record.createdAt instanceof Date ? record.createdAt.toISOString() : String(record.createdAt);
    const detailsStr = record.details ? JSON.stringify(record.details, Object.keys(record.details).sort()) : '';

    const payload = [
      record.previousHash,
      record.id,
      record.actorId || 'SYSTEM',
      record.action,
      record.resource,
      record.resourceId || '',
      timeStr,
      detailsStr
    ].join('|');

    return crypto.createHash('sha256').update(payload).digest('hex');
  }

  /**
   * Verifies the cryptographic integrity of an ordered sequence of audit logs.
   * Returns isValid: true, or points out the exact index and id of any tampered record.
   */
  public verifyChain(logs: AuditLog[]): { isValid: boolean; errorIndex?: number; errorLogId?: string; reason?: string } {
    if (!logs || logs.length === 0) {
      return { isValid: true };
    }

    let expectedPrevHash = GENESIS_HASH;

    for (let i = 0; i < logs.length; i++) {
      const log = logs[i];

      // Check if previous_hash matches the previous block's hash
      if (log.previous_hash !== expectedPrevHash) {
        return {
          isValid: false,
          errorIndex: i,
          errorLogId: log.id,
          reason: `Previous hash mismatch at index ${i}. Expected: ${expectedPrevHash}, Found: ${log.previous_hash}`
        };
      }

      // Recompute block hash
      const computedHash = this.computeBlockHash({
        previousHash: log.previous_hash,
        id: log.id,
        actorId: log.actor_id,
        action: log.action,
        resource: log.resource,
        resourceId: log.resource_id,
        createdAt: log.created_at,
        details: log.details
      });

      if (computedHash !== log.block_hash) {
        return {
          isValid: false,
          errorIndex: i,
          errorLogId: log.id,
          reason: `Block hash mismatch at index ${i}. Content was tampered! Expected: ${computedHash}, Stored: ${log.block_hash}`
        };
      }

      expectedPrevHash = log.block_hash;
    }

    return { isValid: true };
  }
}

export const auditHashChainService = new AuditHashChainService();
