import { z } from "zod";

export const createPaymentSchema = z.object({
  amount: z
    .number({ message: "Amount is required" })
    .positive("Amount must be positive")
    .multipleOf(0.01, "Amount can have max 2 decimal places"),

  currency: z
    .string()
    .length(3, "Currency must be 3 letter code (e.g. INR, USD)")
    .toUpperCase()
    .default("INR"),

  paymentMethod: z.enum(["card", "upi", "netbanking", "wallet"], {
    message: "Payment method is required",
  }),

  description: z.string().max(255).optional(),

  metadata: z.record(z.string(), z.any()).optional(),
});

export const paymentIdSchema = z.object({
  id: z.string().uuid("Invalid payment ID"),
});

export type CreatePaymentInput = z.infer<typeof createPaymentSchema>;