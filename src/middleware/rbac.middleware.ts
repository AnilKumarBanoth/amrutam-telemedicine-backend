import { Request, Response, NextFunction } from 'express';
import { UserRole } from '../config/constants';
import { ForbiddenError, UnauthorizedError } from '../domain/errors';

/**
 * Authorizes access if the user has one of the allowed roles
 */
export const requireRoles = (...allowedRoles: UserRole[]) => {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      return next(new UnauthorizedError('Authentication required'));
    }

    if (!allowedRoles.includes(req.user.role)) {
      return next(
        new ForbiddenError(
          `Access forbidden. Role '${req.user.role}' is not authorized. Required: ${allowedRoles.join(', ')}`
        )
      );
    }

    next();
  };
};

/**
 * Attribute-Based Access Control (ABAC): Verifies that user is accessing their own resource or is an ADMIN
 */
export const requireSelfOrAdmin = (getParamUserId: (req: Request) => string) => {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      return next(new UnauthorizedError('Authentication required'));
    }

    const targetUserId = getParamUserId(req);

    if (req.user.role === 'ADMIN' || req.user.userId === targetUserId) {
      return next();
    }

    return next(new ForbiddenError('You can only view or modify your own profile and clinical records.'));
  };
};
