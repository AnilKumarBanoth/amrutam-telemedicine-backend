import { IDatabaseRepository } from '../storage/database.interface';
import { AuditHashChainService } from '../security/hashChain';
import { AuditLog } from '../types';

export class AuditService {
  constructor(
    private db: IDatabaseRepository,
    private hashChainService: AuditHashChainService
  ) {}

  public async getAuditLogs(limit = 100, offset = 0): Promise<AuditLog[]> {
    return this.db.getAuditLogs(limit, offset);
  }

  /**
   * Mathematically verifies that no audit log has been modified, injected, or deleted.
   */
  public async verifyAuditChainIntegrity(): Promise<{
    isValid: boolean;
    totalVerified: number;
    errorIndex?: number;
    errorLogId?: string;
    reason?: string;
  }> {
    const logs = await this.db.getAuditLogs(10000, 0);
    const verification = this.hashChainService.verifyChain(logs);

    return {
      ...verification,
      totalVerified: logs.length
    };
  }
}
