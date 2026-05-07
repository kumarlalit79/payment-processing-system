import { Worker, Job } from "bullmq";
import { redisConnection } from "../config/queue";
import { paymentService } from "../modules/payment/payment.service";
import { paymentRepository } from "../modules/payment/payment.repository";
import { PaymentStatus } from "../generated/prisma/client.ts";
import { logger } from "../config/logger";
import { type RetryJobPayload } from "../modules/payment/payment.types";

export function startRetryWorker() {
  const worker = new Worker<RetryJobPayload>(
    "payment-retry",
    async (job: Job<RetryJobPayload>) => {
      const { paymentId, attempt } = job.data;

      logger.info(`Retry worker picked up job`, {
        jobId: job.id,
        paymentId,
        attempt,
      });

      const payment = await paymentRepository.findById(paymentId);

      if (!payment) {
        logger.warn(`Retry job — payment not found`, { paymentId });
        return; 
      }

      if (
        payment.status === PaymentStatus.SUCCESS ||
        payment.status === PaymentStatus.FAILED
      ) {
        logger.info(`Retry job skipped — payment already in terminal state`, {
          paymentId,
          status: payment.status,
        });
        return;
      }

      if (payment.nextRetryAt && payment.nextRetryAt > new Date()) {
        logger.warn(`Retry job too early — rescheduling`, {
          paymentId,
          nextRetryAt: payment.nextRetryAt,
        });
        
        return;
      }

      logger.info(`Retrying payment`, { paymentId, attempt });

      await paymentService.processPayment(paymentId, attempt);
    },
    {
      connection: redisConnection,
      concurrency: 5, 
    }
  );


  worker.on("completed", (job) => {
    logger.info(`Retry job completed`, {
      jobId: job.id,
      paymentId: job.data.paymentId,
      attempt: job.data.attempt,
    });
  });

  worker.on("failed", (job, err) => {
    logger.error(`Retry job failed`, {
      jobId: job?.id,
      paymentId: job?.data.paymentId,
      attempt: job?.data.attempt,
      error: err.message,
    });
  });

  worker.on("error", (err) => {
    logger.error(`Retry worker error`, { error: err.message });
  });

  logger.info(`Retry worker started`);

  return worker;
}