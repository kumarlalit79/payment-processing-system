import { WebhookEventStatus, PaymentStatus } from "../../generated/prisma/client.ts";
import { prisma } from "../../config/database";
import { paymentRepository } from "../payment/payment.repository";
import { type IncomingWebhookPayload } from "./webhook.types";
import { logger } from "../../config/logger";
import { NotFoundError } from "../../utils/AppError";

export const webhookService = {

  async handleWebhook(payload: IncomingWebhookPayload): Promise<{
    message: string;
    status: WebhookEventStatus;
  }> {
    const { eventType, paymentId, gatewayRef, status, message, timestamp } = payload;

    const payment = await paymentRepository.findById(paymentId);
    if (!payment) throw new NotFoundError(`Payment not found: ${paymentId}`);

    const existing = await prisma.webhookEvent.findFirst({
      where: {
        paymentId,
        eventType,
        status: WebhookEventStatus.PROCESSED,
        payload: {
          path: ["gatewayRef"],
          equals: gatewayRef,
        },
      },
    });

    if (existing) {
      logger.warn(`Duplicate webhook received — already processed`, {
        paymentId,
        eventType,
        existingId: existing.id,
      });

      await prisma.webhookEvent.create({
        data: {
          paymentId,
          eventType,
          payload: payload as any,
          status: WebhookEventStatus.DUPLICATE,
          processedAt: new Date(),
        },
      });

      return {
        message: "Duplicate webhook — already processed",
        status: WebhookEventStatus.DUPLICATE,
      };
    }

    const isConflict = this.isConflictingState(payment.status, status);

    if (isConflict) {
      logger.warn(`Conflicting webhook state`, {
        paymentId,
        currentStatus: payment.status,
        webhookStatus: status,
      });

      await prisma.webhookEvent.create({
        data: {
          paymentId,
          eventType,
          payload: payload as any,
          status: WebhookEventStatus.CONFLICTED,
          processedAt: new Date(),
        },
      });

      return {
        message: `Conflicting state — payment is ${payment.status}, webhook says ${status}`,
        status: WebhookEventStatus.CONFLICTED,
      };
    }

    const newStatus = this.mapWebhookStatusToPayment(status);

    await paymentRepository.updateStatus(paymentId, newStatus, {
      gatewayRef,
      gatewayResponse: { webhookTimestamp: timestamp, message },
      ...(newStatus === PaymentStatus.SUCCESS && { processedAt: new Date() }),
    });

    await prisma.webhookEvent.create({
      data: {
        paymentId,
        eventType,
        payload: payload as any,
        status: WebhookEventStatus.PROCESSED,
        processedAt: new Date(),
      },
    });

    await paymentRepository.createAuditLog({
      paymentId,
      event: "WEBHOOK_PROCESSED",
      fromStatus: payment.status,
      toStatus: newStatus,
      metadata: { eventType, gatewayRef, webhookTimestamp: timestamp },
    });

    logger.info(`Webhook processed successfully`, {
      paymentId,
      eventType,
      newStatus,
      gatewayRef,
    });

    return {
      message: "Webhook processed successfully",
      status: WebhookEventStatus.PROCESSED,
    };
  },


  mapWebhookStatusToPayment(status: "SUCCESS" | "FAILED" | "PROCESSING"): PaymentStatus {
    switch (status) {
      case "SUCCESS": return PaymentStatus.SUCCESS;
      case "FAILED": return PaymentStatus.FAILED;
      case "PROCESSING": return PaymentStatus.PROCESSING;
    }
  },

  isConflictingState(
    currentStatus: PaymentStatus,
    incomingStatus: "SUCCESS" | "FAILED" | "PROCESSING"
  ): boolean {
    if (currentStatus === PaymentStatus.SUCCESS && incomingStatus === "FAILED") return true;
    if (currentStatus === PaymentStatus.FAILED && incomingStatus === "SUCCESS") return true;
    return false;
  },

  async getWebhookEvents(paymentId: string) {
    return prisma.webhookEvent.findMany({
      where: { paymentId },
      orderBy: { createdAt: "asc" },
    });
  },
};
