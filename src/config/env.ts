import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config();

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().default(3000),
  HOST: z.string().default('0.0.0.0'),
  
  JWT_SECRET: z.string().min(16).default('amrutam-telemedicine-system-default-jwt-secret-min-32-chars!'),
  JWT_EXPIRES_IN: z.string().default('1h'),
  JWT_REFRESH_SECRET: z.string().min(16).default('amrutam-telemedicine-system-default-jwt-refresh-secret-32-chars!'),
  JWT_REFRESH_EXPIRES_IN: z.string().default('7d'),
  
  ENCRYPTION_MASTER_KEY: z.string().default('0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef'),
  ENCRYPTION_KEY_VERSION: z.string().default('v1'),
  PRESCRIPTION_SIGNING_KEY: z.string().default('amrutam-digital-prescription-signing-key-production-grade'),
  
  DB_HOST: z.string().default('localhost'),
  DB_PORT: z.coerce.number().default(5432),
  DB_USER: z.string().default('amrutam_user'),
  DB_PASSWORD: z.string().default('amrutam_secure_password'),
  DB_NAME: z.string().default('amrutam_telemedicine'),
  DB_POOL_MIN: z.coerce.number().default(2),
  DB_POOL_MAX: z.coerce.number().default(20),
  DB_USE_MEMORY_FALLBACK: z.string().transform((v) => v === 'true').default('true'),

  REDIS_HOST: z.string().default('localhost'),
  REDIS_PORT: z.coerce.number().default(6379),
  REDIS_PASSWORD: z.string().optional(),
  REDIS_USE_MEMORY_FALLBACK: z.string().transform((v) => v === 'true').default('true'),

  RATE_LIMIT_WINDOW_MS: z.coerce.number().default(60000),
  RATE_LIMIT_MAX_REQUESTS: z.coerce.number().default(100),

  LOG_LEVEL: z.string().default('info'),
  SERVICE_NAME: z.string().default('amrutam-telemedicine-backend')
});

export type Env = z.infer<typeof envSchema>;

export const config: Env = envSchema.parse(process.env);
