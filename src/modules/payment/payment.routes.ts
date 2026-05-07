import { Router } from "express";
import { paymentController } from "./payment.controller";
import { validate } from "../../middleware/validate.middleware";
import { createPaymentSchema } from "./payment.validator";

const router = Router();

router.post(
  "/",
  validate(createPaymentSchema),
  paymentController.createPayment
);

router.get("/", paymentController.getAllPayments);

router.get("/:id", paymentController.getPayment);

router.get("/:id/audit", paymentController.getAuditLogs);

export default router;