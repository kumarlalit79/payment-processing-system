export type WebhookEventType =
  | "payment.success"
  | "payment.failed"
  | "payment.processing";

export interface IncomingWebhookPayload {
  eventType: WebhookEventType;
  paymentId: string;
  gatewayRef: string;
  status: "SUCCESS" | "FAILED" | "PROCESSING";
  message?: string;
  timestamp: string;
  metadata?: Record<string, any>;
}