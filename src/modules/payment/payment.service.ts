import { v4 as uuidv4 } from "uuid";
import { PaymentStatus } from "../../generated/prisma/client";
import { paymentRepository } from "./payment.repository";
import { type CreatePaymentDTO, type PaymentResponse, type RetryJobPayload } from "./payment.types";
import { processWithTimeout } from "../gateway/gateway.simulator";
import { gatewayCircuitBreaker } from "../../utils/circuitBreaker";
import { checkIdempotency } from "../../utils/idempotency";
import { paymentRetryQueue } from "../../config/queue";
import { logger } from "../../config/logger";
import { AppError, ConflictError, NotFoundError } from "../../utils/AppError";
import { env } from "../../config/env";

export const paymentService = {

  
  async createPayment(
    dto: CreatePaymentDTO,
    idempotencyKey: string
  ): Promise<{ payment: PaymentResponse; isDuplicate: boolean }> {

    
    const { isDuplicate, existingPayment } = await checkIdempotency(idempotencyKey);

    if (isDuplicate && existingPayment) {
      logger.info(`Duplicate request — returning existing payment`, {
        idempotencyKey,
        paymentId: existingPayment.id,
      });

      return {
        payment: existingPayment as unknown as PaymentResponse,
        isDuplicate: true,
      };
    }

    
    const payment = await paymentRepository.create({
      idempotencyKey,
      amount: dto.amount,
      currency: dto.currency,
      paymentMethod: dto.paymentMethod,
      description: dto.description,
      metadata: dto.metadata,
    });

    logger.info(`Payment created`, {
      paymentId: payment.id,
      amount: payment.amount,
      currency: payment.currency,
    });

    
    await paymentRepository.createAuditLog({
      paymentId: payment.id,
      event: "PAYMENT_CREATED",
      toStatus: PaymentStatus.PENDING,
    });

    if (env.NODE_ENV !== "test") {
      this.processPayment(payment.id).catch((err) => {
        logger.error(`Background processing failed`, {
          paymentId: payment.id,
          error: err.message,
        });
      });
    }

    return { payment: this.formatPayment(payment), isDuplicate: false };
  },

  async processPayment(paymentId: string, attempt: number = 1): Promise<void> {
    const preCheck = await paymentRepository.findById(paymentId);
    if (!preCheck) {
      logger.warn(`Payment not found`, { paymentId });
      return;
    }
    if (
      preCheck.status === PaymentStatus.SUCCESS ||
      preCheck.status === PaymentStatus.FAILED
    ) {
      logger.info(`Payment already in terminal state — skipping`, {
        paymentId,
        status: preCheck.status,
      });
      return;
    }

    const lockId = uuidv4();

    const payment = await paymentRepository.findByIdWithLock(paymentId, lockId);

    if (!payment) {
      logger.warn(`Could not acquire lock — payment already being processed`, {
        paymentId,
      });
      return;
    }

    if (payment.status !== PaymentStatus.PENDING) {
      logger.warn(`Payment not in PENDING state — skipping`, {
        paymentId,
        status: payment.status,
      });
      await paymentRepository.releaseLock(paymentId);
      return;
    }

    try {
      await paymentRepository.updateStatus(paymentId, PaymentStatus.PROCESSING);
    } catch (err: any) {
      logger.warn(`Payment no longer exists — skipping processing`, { paymentId });
      return;
    }

    await paymentRepository.createAuditLog({
      paymentId,
      event: "PAYMENT_PROCESSING_STARTED",
      fromStatus: PaymentStatus.PENDING,
      toStatus: PaymentStatus.PROCESSING,
      metadata: { attempt },
    });

    logger.info(`Payment processing started`, { paymentId, attempt });

    try {
      const gatewayResponse = await gatewayCircuitBreaker.execute(() =>
        processWithTimeout({
          paymentId,
          amount: Number(payment.amount),
          currency: payment.currency,
          paymentMethod: payment.paymentMethod,
        })
      );

      
      if (gatewayResponse.status === "SUCCESS") {
        try {
          await paymentRepository.updateStatus(paymentId, PaymentStatus.SUCCESS, {
            gatewayRef: gatewayResponse.gatewayRef,
            gatewayResponse: gatewayResponse.raw ?? {},
            processedAt: gatewayResponse.processedAt,
          });

          await paymentRepository.createAuditLog({
            paymentId,
            event: "PAYMENT_SUCCESS",
            fromStatus: PaymentStatus.PROCESSING,
            toStatus: PaymentStatus.SUCCESS,
            metadata: { gatewayRef: gatewayResponse.gatewayRef, attempt },
          });
        } catch (err: any) {
          logger.warn(`Could not update payment after gateway success`, { paymentId });
        }

        logger.info(`Payment succeeded`, {
          paymentId,
          gatewayRef: gatewayResponse.gatewayRef,
        });

      } else {
        
        try {
          await this.handleFailure(paymentId, attempt, gatewayResponse.message);
        } catch (err: any) {
          logger.warn(`Could not handle failure`, { paymentId });
        }
      }

    } catch (error: any) {
      logger.error(`Gateway error during processing`, {
        paymentId,
        attempt,
        error: error.message,
      });

      try {
        await this.handleFailure(paymentId, attempt, error.message);
      } catch (err: any) {
        logger.warn(`Could not schedule retry — payment likely cleaned up`, { paymentId });
      }
    }
  },

  
  async handleFailure(
    paymentId: string,
    attempt: number,
    reason: string
  ): Promise<void> {
    const maxRetries = env.MAX_RETRIES;

    if (attempt <= maxRetries) {
      const delayMs = Math.pow(2, attempt) * 1000;
      const nextRetryAt = new Date(Date.now() + delayMs);

      await paymentRepository.updateStatus(paymentId, PaymentStatus.PENDING, {
        retryCount: attempt,
        nextRetryAt,
        lastError: reason,
      });

      await paymentRepository.createAuditLog({
        paymentId,
        event: "PAYMENT_RETRY_SCHEDULED",
        fromStatus: PaymentStatus.PROCESSING,
        toStatus: PaymentStatus.PENDING,
        metadata: { attempt, nextRetryAt, reason, delayMs },
      });

      logger.warn(`Payment failed — retry scheduled`, {
        paymentId,
        attempt,
        nextRetryAt,
        delayMs,
        reason,
      });

      const jobPayload: RetryJobPayload = { paymentId, attempt: attempt + 1 };

      await paymentRetryQueue.add(
        `retry-${paymentId}-attempt-${attempt + 1}`,
        jobPayload,
        { delay: delayMs }
      );

    } else {
      
      await paymentRepository.updateStatus(paymentId, PaymentStatus.FAILED, {
        lastError: reason,
        retryCount: attempt,
      });

      await paymentRepository.createAuditLog({
        paymentId,
        event: "PAYMENT_PERMANENTLY_FAILED",
        fromStatus: PaymentStatus.PROCESSING,
        toStatus: PaymentStatus.FAILED,
        metadata: { totalAttempts: attempt, finalReason: reason },
      });

      logger.error(`Payment permanently failed`, {
        paymentId,
        totalAttempts: attempt,
        reason,
      });
    }
  },

 
  async getPayment(id: string): Promise<PaymentResponse> {
    const payment = await paymentRepository.findById(id);

    if (!payment) throw new NotFoundError(`Payment not found: ${id}`);

    return this.formatPayment(payment);
  },

  
  async getAllPayments(page: number = 1, limit: number = 10) {
    const result = await paymentRepository.findAll(page, limit);

    return {
      ...result,
      payments: result.payments.map(this.formatPayment),
    };
  },

  
  formatPayment(payment: any): PaymentResponse {
    return {
      id: payment.id,
      idempotencyKey: payment.idempotencyKey,
      amount: Number(payment.amount),
      currency: payment.currency,
      status: payment.status,
      paymentMethod: payment.paymentMethod,
      description: payment.description,
      gatewayRef: payment.gatewayRef,
      retryCount: payment.retryCount,
      createdAt: payment.createdAt,
      updatedAt: payment.updatedAt,
      processedAt: payment.processedAt,
    };
  },
};
