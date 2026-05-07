import { v4 as uuidv4 } from "uuid";
import { env } from "../../config/env";
import { logger } from "../../config/logger";
import { type GatewayRequest, type GatewayResponse, type GatewayStatus } from "./gateway.types";

// Probability config — real world jaisa behavior
const GATEWAY_SCENARIOS = {
  SUCCESS: 0.65,   // 65% success
  FAILED: 0.20,    // 20% failure
  TIMEOUT: 0.10,   // 10% timeout
  DELAY: 0.05,     // 5% slow response (but success)
} as const;

function getRandomScenario(): "SUCCESS" | "FAILED" | "TIMEOUT" | "DELAY" {
  const rand = Math.random();

  if (rand < GATEWAY_SCENARIOS.SUCCESS) return "SUCCESS";
  if (rand < GATEWAY_SCENARIOS.SUCCESS + GATEWAY_SCENARIOS.FAILED) return "FAILED";
  if (rand < GATEWAY_SCENARIOS.SUCCESS + GATEWAY_SCENARIOS.FAILED + GATEWAY_SCENARIOS.TIMEOUT)
    return "TIMEOUT";
  return "DELAY";
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function processPaymentViaGateway(
  request: GatewayRequest
): Promise<GatewayResponse> {
  const scenario = getRandomScenario();

  logger.debug(`Gateway scenario selected`, {
    paymentId: request.paymentId,
    scenario,
  });

  // Simulate network delay (always)
  await sleep(Math.random() * 500 + 200); // 200ms - 700ms

  switch (scenario) {
    case "TIMEOUT": {
      // Simulate timeout — wait longer than our timeout threshold
      await sleep(env.GATEWAY_TIMEOUT_MS + 1000);
      // This line won't be reached if caller has timeout — but just in case
      throw new Error("Gateway timeout");
    }

    case "FAILED": {
      const failReasons = [
        "Insufficient funds",
        "Card declined",
        "Bank rejected transaction",
        "Invalid account",
        "Daily limit exceeded",
      ];
      const reason = failReasons[Math.floor(Math.random() * failReasons.length)];

      logger.warn(`Gateway returned failure`, {
        paymentId: request.paymentId,
        reason,
      });

      return {
        status: "FAILED",
        gatewayRef: uuidv4(),
        message: reason ?? "Unknown failure reason",
        processedAt: new Date(),
        raw: { errorCode: "GATEWAY_DECLINED", reason },
      };
    }

    case "DELAY": {
      // Slow but successful
      await sleep(3000);
      logger.warn(`Gateway slow response`, { paymentId: request.paymentId });

      return {
        status: "SUCCESS",
        gatewayRef: uuidv4(),
        message: "Payment processed (slow)",
        processedAt: new Date(),
        raw: { note: "delayed_response" },
      };
    }

    case "SUCCESS":
    default: {
      return {
        status: "SUCCESS",
        gatewayRef: uuidv4(),
        message: "Payment processed successfully",
        processedAt: new Date(),
        raw: { authCode: uuidv4().slice(0, 8).toUpperCase() },
      };
    }
  }
}

// Timeout wrapper — gateway ko max X ms dete hain
export async function processWithTimeout(
  request: GatewayRequest
): Promise<GatewayResponse> {
  const timeoutPromise = new Promise<never>((_, reject) =>
    setTimeout(
      () => reject(new Error("Gateway timeout")),
      env.GATEWAY_TIMEOUT_MS
    )
  );

  return Promise.race([processPaymentViaGateway(request), timeoutPromise]);
}