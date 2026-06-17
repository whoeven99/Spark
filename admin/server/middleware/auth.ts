import type { Request, Response, NextFunction } from "express";
import { getEnv } from "../lib/env.js";

export type AdminRole = "owner" | "user";

// Hardcoded to avoid exposing in service environment variables.
// Rotate by updating this value and restarting the admin service.
const HARDCODED_OWNER_SECRET = "Vj7CfUikZIulUxiMAstL2DKaLe8uBvQu";

function resolveRole(token: string): AdminRole | null {
  if (!token) return null;
  const ownerSecret = HARDCODED_OWNER_SECRET;
  const userSecret = getEnv("ADMIN_USER_SECRET");
  if (ownerSecret && token === ownerSecret) return "owner";
  if (userSecret && token === userSecret) return "user";
  return null;
}

export function authMiddleware(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  const auth = req.headers.authorization ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  const role = resolveRole(token);
  if (!role) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  res.locals.adminRole = role;
  next();
}

export function requireOwner(
  _req: Request,
  res: Response,
  next: NextFunction,
): void {
  if (res.locals.adminRole !== "owner") {
    res.status(403).json({ error: "Forbidden: owner only" });
    return;
  }
  next();
}
