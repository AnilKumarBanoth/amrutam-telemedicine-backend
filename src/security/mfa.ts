import speakeasy from 'speakeasy';
import QRCode from 'qrcode';

export interface MfaSetupResult {
  secret: string;
  otpauthUrl: string;
  qrCodeDataUrl: string;
}

export class MfaService {
  /**
   * Generates a new TOTP secret for a user and creates an Authenticator QR code
   */
  public async generateSecret(userEmail: string): Promise<MfaSetupResult> {
    const secret = speakeasy.generateSecret({
      length: 20,
      name: `Amrutam Telemedicine (${userEmail})`,
      issuer: 'Amrutam Telemedicine'
    });

    const otpauthUrl = secret.otpauth_url || '';
    const qrCodeDataUrl = await QRCode.toDataURL(otpauthUrl);

    return {
      secret: secret.base32,
      otpauthUrl,
      qrCodeDataUrl
    };
  }

  /**
   * Verifies a 6-digit TOTP token against the user's secret
   */
  public verifyToken(secret: string, token: string): boolean {
    return speakeasy.totp.verify({
      secret,
      encoding: 'base32',
      token,
      window: 1 // Allow 1 step (30s) drift tolerance
    });
  }
}

export const mfaService = new MfaService();
