import pino from 'pino';
import { config } from '../config/env';

export const logger = pino({
  level: config.LOG_LEVEL,
  redact: {
    paths: [
      'req.headers.authorization',
      'req.headers.cookie',
      'password',
      'password_hash',
      'mfa_secret',
      'token',
      'refresh_token',
      'clinical_notes_encrypted',
      'medications_encrypted'
    ],
    censor: '[REDACTED_SENSITIVE_PHI_OR_CREDENTIAL]'
  },
  base: {
    service: config.SERVICE_NAME,
    env: config.NODE_ENV
  },
  timestamp: pino.stdTimeFunctions.isoTime
});

export const createChildLogger = (context: Record<string, any>) => {
  return logger.child(context);
};
