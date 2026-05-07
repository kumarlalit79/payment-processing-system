import { PaymentStatus } from "../../generated/prisma/client.ts";

export interface CreatePaymentDTO {
  amount: number;
  currency: string;
  paymentMethod: string;
  description?: string;
  metadata?: Record<string, any>;
}

export interface PaymentResponse {
  id: string;
  idempotencyKey: string;
  amount: number;
  currency: string;
  status: PaymentStatus;
  paymentMethod: string;
  description?: string | null;
  gatewayRef?: string | null;
  retryCount: number;
  createdAt: Date;
  updatedAt: Date;
  processedAt?: Date | null;
}

export interface RetryJobPayload {
  paymentId: string;
  attempt: number;
}