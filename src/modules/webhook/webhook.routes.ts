import { Router } from "express";
import { webhookController } from "./webhook.controller";

const router = Router();

// Gateway se aane wala async callback
router.post("/payment", webhookController.handlePaymentWebhook);

// Specific payment ke webhook events dekho
router.get("/payment/:paymentId/events", webhookController.getWebhookEvents);

export default router;