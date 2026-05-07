export type GatewayStatus = "SUCCESS" | "FAILED" | "TIMEOUT";

export interface GatewayRequest {
  paymentId: string;
  amount: number;
  currency: string;
  paymentMethod: string;
}

export interface GatewayResponse {
  status: GatewayStatus;
  gatewayRef: string;
  message: string;
  processedAt: Date;
  raw?: Record<string, any>;
}