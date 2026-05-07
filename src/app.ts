import express from "express";
import { rateLimiter } from "./middleware/rateLimit.middleware";
import { errorMiddleware } from "./middleware/error.middleware";
import paymentRoutes from "./modules/payment/payment.routes";
import webhookRoutes from "./modules/webhook/webhook.routes";
import { logger } from "./config/logger";

const app = express();

// ─── Core Middleware ─────────────────────────────────────────────────
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ─── Rate Limiting ───────────────────────────────────────────────────
app.use("/api/", rateLimiter);

// ─── Request Logger ──────────────────────────────────────────────────
app.use((req, res, next) => {
  logger.debug(`Incoming request`, {
    method: req.method,
    path: req.path,
    ip: req.ip,
  });
  next();
});

// ─── Health Check ────────────────────────────────────────────────────
app.get("/health", (req, res) => {
  res.status(200).json({
    success: true,
    message: "Server is running",
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV,
  });
});

// ─── Routes ──────────────────────────────────────────────────────────
app.use("/api/payments", paymentRoutes);
app.use("/api/webhooks", webhookRoutes);

// ─── 404 Handler ─────────────────────────────────────────────────────
app.use((req, res) => {
  res.status(404).json({
    success: false,
    code: "NOT_FOUND",
    message: `Route ${req.method} ${req.path} not found`,
  });
});

// ─── Global Error Handler ─────────────────────────────────────────────
app.use(errorMiddleware);

export default app;