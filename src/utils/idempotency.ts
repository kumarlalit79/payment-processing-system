import { prisma } from "../config/database";
import { PaymentStatus } from "../generated/prisma/client.ts";

export interface IdempotencyResult {
  isDuplicate: boolean;
  existingPayment?: {
    id: string;
    status: PaymentStatus;
    amount: any;
    currency: string;
    createdAt: Date;
  };
}

export async function checkIdempotency(
  idempotencyKey: string
): Promise<IdempotencyResult> {
  const existing = await prisma.payment.findUnique({
    where: { idempotencyKey },
    select: {
      id: true,
      status: true,
      amount: true,
      currency: true,
      createdAt: true,
    },
  });

  if (!existing) return { isDuplicate: false };

  return {
    isDuplicate: true,
    existingPayment: existing,
  };
}