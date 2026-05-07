import { type Request, type Response } from "express";
import { webhookService } from "./webhook.service";
import { asyncHandler } from "../../utils/asyncHandler";
import { ValidationError } from "../../utils/AppError";
import { logger } from "../../config/logger";

export const webhookController = {

  
  handlePaymentWebhook: asyncHandler(async (req: Request, res: Response) => {
    const payload = req.body;

    
    if (!payload.paymentId || !payload.eventType || !payload.status) {
      throw new ValidationError("Missing required fields: paymentId, eventType, status");
    }

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

  
  getWebhookEvents: asyncHandler(async (req: Request, res: Response) => {
    const  paymentId  = req.params.paymentId as string;

    const events = await webhookService.getWebhookEvents(paymentId);

    res.status(200).json({
      success: true,
      data: events,
    });
  }),
};