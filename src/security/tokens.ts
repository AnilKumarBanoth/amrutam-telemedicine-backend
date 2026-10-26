import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { config } from '../config/env';
import { AuthenticatedUserPayload } from '../types';

export class TokenService {
  private jwtSecret: string;
  private jwtRefreshSecret: string;
  private saltRounds = 10;

  constructor() {
    this.jwtSecret = config.JWT_SECRET;
    this.jwtRefreshSecret = config.JWT_REFRESH_SECRET;
  }

  public async hashPassword(password: string): Promise<string> {
    return bcrypt.hash(password, this.saltRounds);
  }

  public async comparePassword(password: string, hash: string): Promise<boolean> {
    return bcrypt.compare(password, hash);
  }

  public generateAccessToken(payload: AuthenticatedUserPayload): string {
    return jwt.sign(payload, this.jwtSecret, {
      expiresIn: config.JWT_EXPIRES_IN as any,
      issuer: 'amrutam-telemedicine'
    });
  }

  public generateRefreshToken(payload: { userId: string }): string {
    return jwt.sign(payload, this.jwtRefreshSecret, {
      expiresIn: config.JWT_REFRESH_EXPIRES_IN as any,
      issuer: 'amrutam-telemedicine'
    });
  }

  public verifyAccessToken(token: string): AuthenticatedUserPayload {
    return jwt.verify(token, this.jwtSecret) as AuthenticatedUserPayload;
  }

  public verifyRefreshToken(token: string): { userId: string } {
    return jwt.verify(token, this.jwtRefreshSecret) as { userId: string };
  }
}

export const tokenService = new TokenService();
