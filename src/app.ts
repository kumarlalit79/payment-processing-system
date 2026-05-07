import express from "express";
import { rateLimiter } from "./middleware/rateLimit.middleware";
import { errorMiddleware } from "./middleware/error.middleware";
import paymentRoutes from "./modules/payment/payment.routes";
import webhookRoutes from "./modules/webhook/webhook.routes";
import { logger } from "./config/logger";

const app = express();

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use("/api/", rateLimiter);

app.use((req, res, next) => {
  logger.debug(`Incoming request`, {
    method: req.method,
    path: req.path,
    ip: req.ip,
  });
  next();
});

app.get("/health", (req, res) => {
  res.status(200).json({
    success: true,
    message: "Server is running",
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV,
  });
});

app.use("/api/payments", paymentRoutes);
app.use("/api/webhooks", webhookRoutes);

app.use((req, res) => {
  res.status(404).json({
    success: false,
    code: "NOT_FOUND",
    message: `Route ${req.method} ${req.path} not found`,
  });
});

app.use(errorMiddleware);

export default app;