import { Router } from "express";
import { webhookController } from "./webhook.controller";

const router = Router();


router.post("/payment", webhookController.handlePaymentWebhook);

router.get("/payment/:paymentId/events", webhookController.getWebhookEvents);

export default router;