import request from "supertest";
import app from "../src/app";
import { cleanDb, disconnectDb } from "./helpers/testDb";
import { prisma } from "../src/config/database";

beforeEach(async () => {
  await cleanDb();
});

afterAll(async () => {
  await disconnectDb();
});

describe("Payment API", () => {


  describe("POST /api/payments", () => {

    it("should create a payment successfully", async () => {
      const res = await request(app)
        .post("/api/payments")
        .set("idempotency-key", "test-001")
        .send({
          amount: 500,
          currency: "INR",
          paymentMethod: "upi",
          description: "Test payment",
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.isDuplicate).toBe(false);
      expect(res.body.data.id).toBeDefined();
      expect(res.body.data.status).toBe("PENDING");
      expect(res.body.data.amount).toBe(500);
      expect(res.body.data.currency).toBe("INR");
    });

    it("should return duplicate for same idempotency key", async () => {
      const payload = {
        amount: 500,
        currency: "INR",
        paymentMethod: "upi",
      };

      
      await request(app)
        .post("/api/payments")
        .set("idempotency-key", "duplicate-key-001")
        .send(payload);

      
      const res = await request(app)
        .post("/api/payments")
        .set("idempotency-key", "duplicate-key-001")
        .send(payload);

      expect(res.status).toBe(200);
      expect(res.body.isDuplicate).toBe(true);
      expect(res.body.message).toContain("Duplicate");
    });

    it("should fail validation for negative amount", async () => {
      const res = await request(app)
        .post("/api/payments")
        .set("idempotency-key", "val-001")
        .send({
          amount: -100,
          currency: "INR",
          paymentMethod: "upi",
        });

      expect(res.status).toBe(400);
      expect(res.body.code).toBe("VALIDATION_ERROR");
      expect(res.body.errors.amount).toBeDefined();
    });

    it("should fail validation for invalid currency", async () => {
      const res = await request(app)
        .post("/api/payments")
        .set("idempotency-key", "val-002")
        .send({
          amount: 100,
          currency: "IN", 
          paymentMethod: "upi",
        });

      expect(res.status).toBe(400);
      expect(res.body.errors.currency).toBeDefined();
    });

    it("should fail validation for invalid payment method", async () => {
      const res = await request(app)
        .post("/api/payments")
        .set("idempotency-key", "val-003")
        .send({
          amount: 100,
          currency: "INR",
          paymentMethod: "crypto", 
        });

      expect(res.status).toBe(400);
      expect(res.body.errors.paymentMethod).toBeDefined();
    });

    it("should auto-generate idempotency key if not provided", async () => {
      const res = await request(app)
        .post("/api/payments")
        .send({
          amount: 200,
          currency: "INR",
          paymentMethod: "card",
        });

      expect(res.status).toBe(201);
      expect(res.body.data.idempotencyKey).toBeDefined();
    });

  });

  

  describe("GET /api/payments/:id", () => {

    it("should return payment by id", async () => {
      const create = await request(app)
        .post("/api/payments")
        .set("idempotency-key", "get-001")
        .send({ amount: 300, currency: "INR", paymentMethod: "card" });

      const id = create.body.data.id;

      const res = await request(app).get(`/api/payments/${id}`);

      expect(res.status).toBe(200);
      expect(res.body.data.id).toBe(id);
    });

    it("should return 404 for non-existent payment", async () => {
      const res = await request(app)
        .get("/api/payments/00000000-0000-0000-0000-000000000000");

      expect(res.status).toBe(404);
      expect(res.body.code).toBe("NOT_FOUND");
    });

  });

  

  describe("GET /api/payments", () => {

    it("should return paginated payments", async () => {
      
      for (let i = 0; i < 3; i++) {
        await request(app)
          .post("/api/payments")
          .set("idempotency-key", `page-test-${i}`)
          .send({ amount: 100 * (i + 1), currency: "INR", paymentMethod: "upi" });
      }

      const res = await request(app).get("/api/payments?page=1&limit=10");

      expect(res.status).toBe(200);
      expect(res.body.data.length).toBe(3);
      expect(res.body.pagination.total).toBe(3);
      expect(res.body.pagination.page).toBe(1);
    });

    it("should respect limit param", async () => {
      for (let i = 0; i < 5; i++) {
        await request(app)
          .post("/api/payments")
          .set("idempotency-key", `limit-test-${i}`)
          .send({ amount: 100, currency: "INR", paymentMethod: "card" });
      }

      const res = await request(app).get("/api/payments?page=1&limit=2");

      expect(res.body.data.length).toBe(2);
      expect(res.body.pagination.totalPages).toBe(3);
    });

  });

  

  describe("GET /api/payments/:id/audit", () => {

    it("should return audit logs for a payment", async () => {
      const create = await request(app)
        .post("/api/payments")
        .set("idempotency-key", "audit-001")
        .send({ amount: 500, currency: "INR", paymentMethod: "upi" });

      const id = create.body.data.id;

      
      await new Promise((r) => setTimeout(r, 1000));

      const res = await request(app).get(`/api/payments/${id}/audit`);

      expect(res.status).toBe(200);
      expect(res.body.data.length).toBeGreaterThan(0);

      const events = res.body.data.map((l: any) => l.event);
      expect(events).toContain("PAYMENT_CREATED");
    });

  });

});