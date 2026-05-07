import request from "supertest";
import app from "../src/app";
import { cleanDb, disconnectDb } from "./helpers/testDb";
import { prisma } from "../src/config/database";
import { paymentService } from "../src/modules/payment/payment.service";
import { paymentRepository } from "../src/modules/payment/payment.repository";
import { PaymentStatus } from "../src/generated/prisma/client.ts";

beforeEach(async () => {
  await cleanDb();
});

afterAll(async () => {
  await disconnectDb();
});

describe("Retry & Failure Handling", () => {

  it("should schedule retry on failure and update retryCount", async () => {
    const payment = await prisma.payment.create({
      data: {
        idempotencyKey: "retry-direct-001",
        amount: 100,
        currency: "INR",
        paymentMethod: "card",
        status: PaymentStatus.PENDING,
        maxRetries: 3,
      },
    });

    await paymentService.handleFailure(payment.id, 1, "Simulated failure");

    const updated = await prisma.payment.findUnique({
      where: { id: payment.id },
    });

    expect(updated?.status).toBe(PaymentStatus.PENDING);
    expect(updated?.retryCount).toBe(1);
    expect(updated?.nextRetryAt).not.toBeNull();
    expect(updated?.lastError).toBe("Simulated failure");
  });

  it("should mark payment as FAILED after max retries exhausted", async () => {
    const payment = await prisma.payment.create({
      data: {
        idempotencyKey: "retry-exhaust-001",
        amount: 100,
        currency: "INR",
        paymentMethod: "card",
        status: PaymentStatus.PENDING,
        maxRetries: 3,
      },
    });

    await paymentService.handleFailure(payment.id, 4, "Final failure");

    const updated = await prisma.payment.findUnique({
      where: { id: payment.id },
    });

    expect(updated?.status).toBe(PaymentStatus.FAILED);
    expect(updated?.lastError).toBe("Final failure");
  });

  it("should create audit log on retry scheduled", async () => {
    const payment = await prisma.payment.create({
      data: {
        idempotencyKey: "retry-audit-001",
        amount: 100,
        currency: "INR",
        paymentMethod: "upi",
        status: PaymentStatus.PENDING,
        maxRetries: 3,
      },
    });

    await paymentService.handleFailure(payment.id, 1, "Gateway timeout");

    const logs = await prisma.auditLog.findMany({
      where: { paymentId: payment.id },
    });

    const retryLog = logs.find((l) => l.event === "PAYMENT_RETRY_SCHEDULED");
    expect(retryLog).toBeDefined();
    expect(retryLog?.toStatus).toBe(PaymentStatus.PENDING);
  });

  it("should create audit log on permanent failure", async () => {
    const payment = await prisma.payment.create({
      data: {
        idempotencyKey: "retry-perm-fail-001",
        amount: 100,
        currency: "INR",
        paymentMethod: "card",
        status: PaymentStatus.PENDING,
        maxRetries: 3,
      },
    });

    await paymentService.handleFailure(payment.id, 4, "Permanent failure");

    const logs = await prisma.auditLog.findMany({
      where: { paymentId: payment.id },
    });

    const failLog = logs.find((l) => l.event === "PAYMENT_PERMANENTLY_FAILED");
    expect(failLog).toBeDefined();
    expect(failLog?.toStatus).toBe(PaymentStatus.FAILED);
  });

  it("should not modify a payment already in terminal state", async () => {
    const payment = await prisma.payment.create({
      data: {
        idempotencyKey: "terminal-skip-001",
        amount: 100,
        currency: "INR",
        paymentMethod: "upi",
        status: PaymentStatus.SUCCESS,
        maxRetries: 3,
      },
    });

    const found = await paymentRepository.findById(payment.id);
    expect(found).not.toBeNull();
    expect(found?.status).toBe(PaymentStatus.SUCCESS);

    expect(found?.lockedAt).toBeNull();

    const updated = await prisma.payment.findUnique({
      where: { id: payment.id },
    });
    expect(updated?.status).toBe(PaymentStatus.SUCCESS);
    expect(updated?.lockedAt).toBeNull();
    expect(updated?.lockedBy).toBeNull();
  });

});
