import request from "supertest";
import app from "../src/app";
import { cleanDb, disconnectDb } from "./helpers/testDb";

beforeEach(async () => {
  await cleanDb();
});

afterAll(async () => {
  await disconnectDb();
});

async function createTestPayment(key: string) {
  const res = await request(app)
    .post("/api/payments")
    .set("idempotency-key", key)
    .send({ amount: 500, currency: "INR", paymentMethod: "upi" });
  return res.body.data;
}

describe("Webhook API", () => {

  describe("POST /api/webhooks/payment", () => {

    it("should process a valid webhook", async () => {
      const payment = await createTestPayment("wh-001");

      const res = await request(app)
        .post("/api/webhooks/payment")
        .send({
          eventType: "payment.success",
          paymentId: payment.id,
          gatewayRef: "GW-001",
          status: "SUCCESS",
          timestamp: new Date().toISOString(),
        });

      expect(res.status).toBe(200);
      expect(res.body.webhookStatus).toBe("PROCESSED");
    });

    it("should detect duplicate webhook", async () => {
      const payment = await createTestPayment("wh-002");

      const payload = {
        eventType: "payment.success",
        paymentId: payment.id,
        gatewayRef: "GW-002",
        status: "SUCCESS",
        timestamp: new Date().toISOString(),
      };

      // First
      await request(app).post("/api/webhooks/payment").send(payload);

      // Duplicate
      const res = await request(app)
        .post("/api/webhooks/payment")
        .send(payload);

      expect(res.body.webhookStatus).toBe("DUPLICATE");
    });

    it("should detect conflicting webhook", async () => {
      const payment = await createTestPayment("wh-003");

      // First — SUCCESS
      await request(app)
        .post("/api/webhooks/payment")
        .send({
          eventType: "payment.success",
          paymentId: payment.id,
          gatewayRef: "GW-003",
          status: "SUCCESS",
          timestamp: new Date().toISOString(),
        });

      // Conflict — FAILED after SUCCESS
      const res = await request(app)
        .post("/api/webhooks/payment")
        .send({
          eventType: "payment.failed",
          paymentId: payment.id,
          gatewayRef: "GW-003-b",
          status: "FAILED",
          timestamp: new Date().toISOString(),
        });

      expect(res.body.webhookStatus).toBe("CONFLICTED");
    });

    it("should return 404 for non-existent payment", async () => {
      const res = await request(app)
        .post("/api/webhooks/payment")
        .send({
          eventType: "payment.success",
          paymentId: "00000000-0000-0000-0000-000000000000",
          gatewayRef: "GW-404",
          status: "SUCCESS",
          timestamp: new Date().toISOString(),
        });

      expect(res.status).toBe(404);
    });

    it("should return 400 for missing required fields", async () => {
      const res = await request(app)
        .post("/api/webhooks/payment")
        .send({ eventType: "payment.success" }); // missing paymentId, status

      expect(res.status).toBe(400);
    });

  });

  describe("GET /api/webhooks/payment/:paymentId/events", () => {

    it("should return webhook events for a payment", async () => {
      const payment = await createTestPayment("wh-events-001");

      await request(app)
        .post("/api/webhooks/payment")
        .send({
          eventType: "payment.success",
          paymentId: payment.id,
          gatewayRef: "GW-EVT-001",
          status: "SUCCESS",
          timestamp: new Date().toISOString(),
        });

      const res = await request(app)
        .get(`/api/webhooks/payment/${payment.id}/events`);

      expect(res.status).toBe(200);
      expect(res.body.data.length).toBeGreaterThan(0);
      expect(res.body.data[0].paymentId).toBe(payment.id);
    });

  });

});