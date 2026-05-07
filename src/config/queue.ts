import { Queue, Worker, QueueEvents } from "bullmq";
import IORedis from "ioredis";
import { env } from "./env";
import { logger } from "./logger";

export const redisConnection = new IORedis(env.REDIS_URL, {
  maxRetriesPerRequest: null, 
});

redisConnection.on("connect", () => logger.info("Redis connected"));
redisConnection.on("error", (err) => logger.error("Redis error", { err }));

export const paymentRetryQueue = new Queue("payment-retry", {
  connection: redisConnection,
  defaultJobOptions: {
    attempts: 1,        
    removeOnComplete: 100,
    removeOnFail: 500,
  },
});

export { Queue, Worker, QueueEvents };