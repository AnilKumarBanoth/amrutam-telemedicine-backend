export class AppError extends Error {
  public readonly statusCode: number;
  public readonly code: string;
  public readonly isOperational: boolean;
  public readonly details?: any;

  constructor(message: string, statusCode = 500, code = 'INTERNAL_SERVER_ERROR', details?: any) {
    super(message);
    this.name = this.constructor.name;
    this.statusCode = statusCode;
    this.code = code;
    this.isOperational = true;
    this.details = details;
    Error.captureStackTrace(this, this.constructor);
  }
}

export class NotFoundError extends AppError {
  constructor(resource: string, identifier?: string) {
    super(
      identifier ? `${resource} with ID '${identifier}' was not found.` : `${resource} was not found.`,
      404,
      'NOT_FOUND'
    );
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = 'Authentication required.') {
    super(message, 401, 'UNAUTHORIZED');
  }
}

export class ForbiddenError extends AppError {
  constructor(message = 'Access forbidden for this role or resource.') {
    super(message, 403, 'FORBIDDEN');
  }
}

export class ConflictError extends AppError {
  constructor(message: string, details?: any) {
    super(message, 409, 'CONFLICT', details);
  }
}

export class ValidationError extends AppError {
  constructor(message: string, details?: any) {
    super(message, 422, 'VALIDATION_ERROR', details);
  }
}

export class ConcurrencyLockError extends AppError {
  constructor(message = 'Resource is currently locked by another operation. Please retry.') {
    super(message, 409, 'CONCURRENCY_LOCK_ERROR');
  }
}

export class IdempotencyConflictError extends AppError {
  constructor(message = 'A request with this idempotency key is already in progress.') {
    super(message, 409, 'IDEMPOTENCY_CONFLICT');
  }
}

export class RateLimitExceededError extends AppError {
  constructor(message = 'Too many requests. Please slow down and try again later.') {
    super(message, 429, 'RATE_LIMIT_EXCEEDED');
  }
}
