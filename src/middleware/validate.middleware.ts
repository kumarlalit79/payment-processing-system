import { type Request, type Response, type NextFunction } from "express";
import z from "zod";

export const validate =
  (schema: z.Schema) =>
  (req: Request, res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      next(result.error);
      return;
    }
    req.body = result.data;
    next();
  };