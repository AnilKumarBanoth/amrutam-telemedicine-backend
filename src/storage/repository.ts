import { config } from '../config/env';
import { IDatabaseRepository } from './database.interface';
import { memoryDatabaseAdapter } from './memory.adapter';
import { postgresDatabaseAdapter } from './postgres.adapter';
import { logger } from '../observability/logger';

// Determine repository instance
let repository: IDatabaseRepository;

if (config.DB_USE_MEMORY_FALLBACK) {
  logger.info('Storage engine: Initialized with High-Fidelity In-Memory Repository (Seed Data Active)');
  repository = memoryDatabaseAdapter;
} else {
  logger.info('Storage engine: Initialized with PostgreSQL Database Adapter');
  repository = postgresDatabaseAdapter;
}

export const db: IDatabaseRepository = repository;
