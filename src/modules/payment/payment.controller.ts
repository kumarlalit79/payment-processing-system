import { type Request, type Response } from "express";
import { v4 as uuidv4 } from "uuid";
import { paymentService } from "./payment.service";
import { asyncHandler } from "../../utils/asyncHandler";
import { logger } from "../../config/logger";

export const paymentController = {

  // POST /api/payments
  createPayment: asyncHandler(async (req: Request, res: Response) => {
    // Idempotency key — client bhejta hai header mein, nahi bheja toh generate karo
    const idempotencyKey =
      (req.headers["idempotency-key"] as string) ?? uuidv4();

    const { payment, isDuplicate } = await paymentService.createPayment(
      req.body,
      idempotencyKey
    );

    logger.info(`Payment create request handled`, {
      paymentId: payment.id,
      isDuplicate,
      idempotencyKey,
    });

    res.status(isDuplicate ? 200 : 201).json({
      success: true,
      isDuplicate,
      message: isDuplicate
        ? "Duplicate request — returning existing payment"
        : "Payment initiated successfully",
      data: payment,
    });
  }),

  // GET /api/payments/:id
  getPayment: asyncHandler(async (req: Request, res: Response) => {
    const  id  = req.params.id as string;

    const payment = await paymentService.getPayment(id);

    res.status(200).json({
      success: true,
      data: payment,
    });
  }),

  // GET /api/payments
  getAllPayments: asyncHandler(async (req: Request, res: Response) => {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 10;

    const result = await paymentService.getAllPayments(page, limit);

    res.status(200).json({
      success: true,
      data: result.payments,
      pagination: {
        page: result.page,
        limit: result.limit,
        total: result.total,
        totalPages: Math.ceil(result.total / result.limit),
      },
    });
  }),

  // GET /api/payments/:id/audit
  getAuditLogs: asyncHandler(async (req: Request, res: Response) => {
    const  id  = req.params.id as string;

    // Payment exists check
    await paymentService.getPayment(id);

    const { prisma } = await import("../../config/database");

    const logs = await prisma.auditLog.findMany({
      where: { paymentId: id },
      orderBy: { createdAt: "asc" },
    });

    res.status(200).json({
      success: true,
      data: logs,
    });
  }),
};