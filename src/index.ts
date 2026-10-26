import { createApp } from './app';
import { config } from './config/env';
import { logger } from './observability/logger';
import { asyncQueue } from './queue/asyncQueue';

const app = createApp();

const server = app.listen(config.PORT, config.HOST, () => {
  logger.info(
    {
      port: config.PORT,
      host: config.HOST,
      nodeEnv: config.NODE_ENV,
      pid: process.pid
    },
    `🚀 Amrutam Telemedicine Backend Server running on http://${config.HOST}:${config.PORT}`
  );
  logger.info(`📊 Prometheus Metrics available at http://${config.HOST}:${config.PORT}/metrics`);
  logger.info(`❤️  Health check live endpoint at http://${config.HOST}:${config.PORT}/health/live`);
});

// Graceful shutdown handler
const shutdown = (signal: string) => {
  logger.info({ signal }, 'Graceful shutdown initiated. Refusing new requests...');
  
  // Stop queue processor
  asyncQueue.stopWorker();

  server.close((err) => {
    if (err) {
      logger.error({ err }, 'Error during HTTP server shutdown');
      process.exit(1);
    }
    logger.info('HTTP server closed successfully. Cleanup completed. Exiting process.');
    process.exit(0);
  });

  // Force close after 10 seconds if hanging
  setTimeout(() => {
    logger.error('Graceful shutdown timeout exceeded. Forcing process exit.');
    process.exit(1);
  }, 10000);
};

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
