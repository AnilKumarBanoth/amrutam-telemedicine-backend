import crypto from 'crypto';
import { config } from '../config/env';

export interface EncryptedData {
  ciphertext: string; // Hex or Base64 encoded
  iv: string;         // Hex encoded initialization vector (12 or 16 bytes)
  tag: string;        // Hex encoded authentication tag (16 bytes)
  keyVersion: string; // Identifier for key rotation support
}

export class FieldEncryptionService {
  private masterKey: Buffer;
  private algorithm = 'aes-256-gcm';
  private ivLength = 12; // 96-bit IV recommended for GCM
  private keyVersion: string;

  constructor(masterKeyHex?: string, keyVersion?: string) {
    const rawKey = masterKeyHex || config.ENCRYPTION_MASTER_KEY;
    // Derive exactly 32 bytes using SHA-256 to guarantee 256-bit key size
    this.masterKey = crypto.createHash('sha256').update(rawKey).digest();
    this.keyVersion = keyVersion || config.ENCRYPTION_KEY_VERSION;
  }

  /**
   * Encrypts plaintext string or JSON object using AES-256-GCM
   */
  public encrypt(plaintext: string | object): string {
    const textToEncrypt = typeof plaintext === 'string' ? plaintext : JSON.stringify(plaintext);
    const iv = crypto.randomBytes(this.ivLength);
    const cipher = crypto.createCipheriv(this.algorithm, this.masterKey, iv) as crypto.CipherGCM;

    let ciphertext = cipher.update(textToEncrypt, 'utf8', 'hex');
    ciphertext += cipher.final('hex');

    const tag = cipher.getAuthTag();

    const payload: EncryptedData = {
      ciphertext,
      iv: iv.toString('hex'),
      tag: tag.toString('hex'),
      keyVersion: this.keyVersion
    };

    // Serialize as base64 envelope
    return Buffer.from(JSON.stringify(payload)).toString('base64');
  }

  /**
   * Decrypts AES-256-GCM envelope and verifies authentication tag
   */
  public decrypt<T = any>(encryptedEnvelopeBase64: string): T {
    try {
      const jsonStr = Buffer.from(encryptedEnvelopeBase64, 'base64').toString('utf8');
      const payload: EncryptedData = JSON.parse(jsonStr);

      const iv = Buffer.from(payload.iv, 'hex');
      const tag = Buffer.from(payload.tag, 'hex');
      const decipher = crypto.createDecipheriv(this.algorithm, this.masterKey, iv) as crypto.DecipherGCM;
      
      decipher.setAuthTag(tag);

      let decrypted = decipher.update(payload.ciphertext, 'hex', 'utf8');
      decrypted += decipher.final('utf8');

      try {
        return JSON.parse(decrypted) as T;
      } catch {
        return decrypted as unknown as T;
      }
    } catch (err: any) {
      throw new Error(`Decryption failed or data integrity compromised (AES-GCM AuthTag mismatch): ${err.message}`);
    }
  }

  /**
   * Signs a payload using HMAC-SHA256 for digital signatures (e.g. Prescriptions)
   */
  public signPrescription(payload: string | object): string {
    const content = typeof payload === 'string' ? payload : JSON.stringify(payload);
    return crypto
      .createHmac('sha256', config.PRESCRIPTION_SIGNING_KEY)
      .update(content)
      .digest('hex');
  }

  /**
   * Verifies an HMAC-SHA256 signature
   */
  public verifySignature(payload: string | object, signature: string): boolean {
    const expected = this.signPrescription(payload);
    return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
  }
}

export const encryptionService = new FieldEncryptionService();
