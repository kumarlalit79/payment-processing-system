import { PaymentStatus, Prisma } from "../../generated/prisma/client.ts";
import { prisma } from "../../config/database";
import { logger } from "../../config/logger";

export const paymentRepository = {

  async create(data: {
    idempotencyKey: string;
    amount: number;
    currency: string;
    paymentMethod: string;
    description?: string;
    metadata?: Record<string, any>;
  }) {
    return prisma.payment.create({
      data: {
        ...data,
        amount: new Prisma.Decimal(data.amount),
        status: PaymentStatus.PENDING,
      },
    });
  },

  async findById(id: string) {
    return prisma.payment.findUnique({ where: { id } });
  },

  async findByIdempotencyKey(key: string) {
    return prisma.payment.findUnique({ where: { idempotencyKey: key } });
  },

 
  async findByIdWithLock(id: string, lockedBy: string) {
    
    const payment = await prisma.payment.findUnique({ where: { id } });

    if (!payment) return null;

    
    if (
      payment.lockedAt &&
      payment.lockedBy !== lockedBy &&
      Date.now() - payment.lockedAt.getTime() < 30000 
    ) {
      logger.warn(`Payment already locked`, {
        paymentId: id,
        lockedBy: payment.lockedBy,
      });
      return null;
    }

    
    return prisma.payment.update({
      where: { id },
      data: {
        lockedAt: new Date(),
        lockedBy,
      },
    });
  },

  async releaseLock(id: string) {
    return prisma.payment.update({
      where: { id },
      data: {
        lockedAt: null,
        lockedBy: null,
      },
    });
  },

  async updateStatus(
    id: string,
    status: PaymentStatus,
    extra?: Partial<{
      gatewayRef: string;
      gatewayResponse: Record<string, any>;
      lastError: string;
      retryCount: number;
      nextRetryAt: Date;
      processedAt: Date;
    }>
  ) {
    return prisma.payment.update({
      where: { id },
      data: {
        status,
        ...extra,
        lockedAt: null,
        lockedBy: null,
      },
    });
  },

  async createAuditLog(data: {
    paymentId: string;
    event: string;
    fromStatus?: string;
    toStatus?: string;
    metadata?: Record<string, any>;
  }) {
    return prisma.auditLog.create({ data });
  },

  async findAll(page: number = 1, limit: number = 10) {
    const skip = (page - 1) * limit;
    const [payments, total] = await Promise.all([
      prisma.payment.findMany({
        skip,
        take: limit,
        orderBy: { createdAt: "desc" },
      }),
      prisma.payment.count(),
    ]);

    return { payments, total, page, limit };
  },
};