import "dotenv/config";
import app from "./app";
import { env } from "./config/env";
import { prisma } from "./config/database";
import { redisConnection } from "./config/queue";
import { startRetryWorker } from "./workers/retry.worker";
import { logger } from "./config/logger";

const server = app.listen(env.PORT, async () => {
  logger.info(`Server started`, {
    port: env.PORT,
    environment: env.NODE_ENV,
  });

  try {
    await prisma.$connect();
    logger.info(`Database connected`);
  } catch (err: any) {
    logger.error(`Database connection failed`, { error: err.message });
    process.exit(1);
  }

  startRetryWorker();
});

async function shutdown(signal: string) {
  logger.info(`${signal} received — shutting down gracefully`);

  server.close(async () => {
    logger.info(`HTTP server closed`);

    await prisma.$disconnect();
    logger.info(`Database disconnected`);

    await redisConnection.quit();
    logger.info(`Redis disconnected`);

    process.exit(0);
  });

  setTimeout(() => {
    logger.error(`Forced shutdown after timeout`);
    process.exit(1);
  }, 10000);
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));

process.on("unhandledRejection", (reason) => {
  logger.error(`Unhandled rejection`, { reason });
});

process.on("uncaughtException", (err) => {
  logger.error(`Uncaught exception`, { error: err.message, stack: err.stack });
  process.exit(1);
});