import type { Request, Response, NextFunction } from "express";
import { requireEnv } from "../lib/env.js";

export function authMiddleware(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  const secret = requireEnv("ADMIN_SECRET");
  const auth = req.headers.authorization ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";

  if (!token || token !== secret) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  next();
}
