import { Request, Response, NextFunction } from 'express';
import { tokenService } from '../security/tokens';
import { UnauthorizedError } from '../domain/errors';
import { AuthenticatedUserPayload } from '../types';

declare global {
  namespace Express {
    interface Request {
      user?: AuthenticatedUserPayload;
    }
  }
}

export const authenticateJwt = (req: Request, res: Response, next: NextFunction) => {
  const authHeader = req.header('Authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return next(new UnauthorizedError('Missing or malformed Authorization header. Expected Bearer token.'));
  }

  const token = authHeader.substring(7);
  try {
    const payload = tokenService.verifyAccessToken(token);
    req.user = payload;
    next();
  } catch (err: any) {
    return next(new UnauthorizedError(`Invalid or expired token: ${err.message}`));
  }
};

export const optionalAuthenticateJwt = (req: Request, res: Response, next: NextFunction) => {
  const authHeader = req.header('Authorization');
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.substring(7);
    try {
      req.user = tokenService.verifyAccessToken(token);
    } catch {
      // Ignore optional auth failure
    }
  }
  next();
};
