import { type Request, type Response } from "express";
import { webhookService } from "./webhook.service";
import { asyncHandler } from "../../utils/asyncHandler";
import { ValidationError } from "../../utils/AppError";
import { logger } from "../../config/logger";

export const webhookController = {

  // POST /api/webhooks/payment
  handlePaymentWebhook: asyncHandler(async (req: Request, res: Response) => {
    const payload = req.body;

    // Basic validation
    if (!payload.paymentId || !payload.eventType || !payload.status) {
      throw new ValidationError("Missing required fields: paymentId, eventType, status");
    }

    // Timestamp nahi aaya toh current time
    if (!payload.timestamp) {
      payload.timestamp = new Date().toISOString();
    }

    logger.info(`Webhook received`, {
      paymentId: payload.paymentId,
      eventType: payload.eventType,
      status: payload.status,
    });

    const result = await webhookService.handleWebhook(payload);

    res.status(200).json({
      success: true,
      message: result.message,
      webhookStatus: result.status,
    });
  }),

  // GET /api/webhooks/payment/:paymentId/events
  getWebhookEvents: asyncHandler(async (req: Request, res: Response) => {
    const  paymentId  = req.params.paymentId as string;

    const events = await webhookService.getWebhookEvents(paymentId);

    res.status(200).json({
      success: true,
      data: events,
    });
  }),
};