import { IDatabaseRepository } from '../storage/database.interface';
import { TokenService } from '../security/tokens';
import { MfaService } from '../security/mfa';
import { ConflictError, NotFoundError, UnauthorizedError, ValidationError } from '../domain/errors';
import { User, AuthenticatedUserPayload } from '../types';
import { UserRole, AUDIT_ACTIONS } from '../config/constants';
import { logger } from '../observability/logger';

export class AuthService {
  constructor(
    private db: IDatabaseRepository,
    private tokenService: TokenService,
    private mfaService: MfaService
  ) {}

  public async register(params: {
    email: string;
    password: string;
    role: UserRole;
    firstName: string;
    lastName: string;
    phoneNumber?: string;
    // Doctor specific fields if registering as DOCTOR
    registrationNumber?: string;
    specialization?: string;
    consultationFee?: number;
    experienceYears?: number;
  }) {
    const existing = await this.db.getUserByEmail(params.email);
    if (existing) {
      throw new ConflictError(`User with email '${params.email}' already exists.`);
    }

    const passwordHash = await this.tokenService.hashPassword(params.password);
    const user = await this.db.createUser({
      email: params.email,
      password_hash: passwordHash,
      role: params.role,
      is_active: true,
      mfa_enabled: false
    });

    const profile = await this.db.createProfile({
      user_id: user.id,
      first_name: params.firstName,
      last_name: params.lastName,
      phone_number: params.phoneNumber
    });

    let doctorRecord = null;
    if (params.role === 'DOCTOR') {
      if (!params.registrationNumber || !params.specialization) {
        throw new ValidationError('Doctor registration requires registrationNumber and specialization.');
      }
      doctorRecord = await this.db.createDoctor({
        user_id: user.id,
        registration_number: params.registrationNumber,
        specialization: params.specialization,
        consultation_fee: params.consultationFee || 500,
        experience_years: params.experienceYears || 1,
        languages: ['English', 'Hindi']
      });
    }

    // Audit log
    await this.db.createAuditLog({
      actor_id: user.id,
      actor_role: user.role,
      action: AUDIT_ACTIONS.USER_REGISTER,
      resource: 'User',
      resource_id: user.id,
      details: { email: user.email, role: user.role }
    });

    const tokenPayload: AuthenticatedUserPayload = {
      userId: user.id,
      email: user.email,
      role: user.role
    };

    const accessToken = this.tokenService.generateAccessToken(tokenPayload);
    const refreshToken = this.tokenService.generateRefreshToken({ userId: user.id });

    return {
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
        firstName: profile.first_name,
        lastName: profile.last_name,
        doctor: doctorRecord
      },
      tokens: { accessToken, refreshToken }
    };
  }

  public async login(email: string, password: string, mfaToken?: string) {
    const user = await this.db.getUserByEmail(email);
    if (!user || !user.is_active) {
      throw new UnauthorizedError('Invalid email or password.');
    }

    const isMatch = await this.tokenService.comparePassword(password, user.password_hash);
    if (!isMatch) {
      throw new UnauthorizedError('Invalid email or password.');
    }

    // Check MFA
    if (user.mfa_enabled) {
      if (!mfaToken) {
        return {
          requiresMfa: true,
          userId: user.id,
          message: 'MFA token required to complete authentication.'
        };
      }

      if (!user.mfa_secret || !this.mfaService.verifyToken(user.mfa_secret, mfaToken)) {
        throw new UnauthorizedError('Invalid MFA token.');
      }
    }

    await this.db.updateUser(user.id, { last_login_at: new Date() });

    await this.db.createAuditLog({
      actor_id: user.id,
      actor_role: user.role,
      action: AUDIT_ACTIONS.USER_LOGIN,
      resource: 'User',
      resource_id: user.id,
      details: { email: user.email, mfaUsed: user.mfa_enabled }
    });

    const tokenPayload: AuthenticatedUserPayload = {
      userId: user.id,
      email: user.email,
      role: user.role,
      mfaVerified: user.mfa_enabled
    };

    const accessToken = this.tokenService.generateAccessToken(tokenPayload);
    const refreshToken = this.tokenService.generateRefreshToken({ userId: user.id });
    const profile = await this.db.getProfileByUserId(user.id);

    return {
      requiresMfa: false,
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
        firstName: profile?.first_name || '',
        lastName: profile?.last_name || '',
        mfaEnabled: user.mfa_enabled
      },
      tokens: { accessToken, refreshToken }
    };
  }

  public async setupMfa(userId: string) {
    const user = await this.db.getUserById(userId);
    if (!user) throw new NotFoundError('User', userId);

    const mfa = await this.mfaService.generateSecret(user.email);
    await this.db.updateUser(userId, { mfa_secret: mfa.secret });

    return {
      secret: mfa.secret,
      qrCodeDataUrl: mfa.qrCodeDataUrl,
      otpauthUrl: mfa.otpauthUrl
    };
  }

  public async verifyAndEnableMfa(userId: string, token: string) {
    const user = await this.db.getUserById(userId);
    if (!user || !user.mfa_secret) {
      throw new ValidationError('MFA setup has not been initiated.');
    }

    const isValid = this.mfaService.verifyToken(user.mfa_secret, token);
    if (!isValid) {
      throw new ValidationError('Invalid verification code.');
    }

    await this.db.updateUser(userId, { mfa_enabled: true });

    await this.db.createAuditLog({
      actor_id: userId,
      actor_role: user.role,
      action: AUDIT_ACTIONS.MFA_ENABLE,
      resource: 'User',
      resource_id: userId
    });

    return { success: true, message: 'MFA successfully enabled.' };
  }

  public async refreshToken(refreshToken: string) {
    try {
      const decoded = this.tokenService.verifyRefreshToken(refreshToken);
      const user = await this.db.getUserById(decoded.userId);
      if (!user || !user.is_active) {
        throw new UnauthorizedError('User account inactive or deleted.');
      }

      const tokenPayload: AuthenticatedUserPayload = {
        userId: user.id,
        email: user.email,
        role: user.role,
        mfaVerified: user.mfa_enabled
      };

      const newAccessToken = this.tokenService.generateAccessToken(tokenPayload);
      const newRefreshToken = this.tokenService.generateRefreshToken({ userId: user.id });

      return {
        accessToken: newAccessToken,
        refreshToken: newRefreshToken
      };
    } catch (err: any) {
      throw new UnauthorizedError(`Invalid refresh token: ${err.message}`);
    }
  }
}
