import type { Request, Response, NextFunction } from "express";
import { getEnv } from "../lib/env.js";

export type AdminRole = "owner" | "user";
export type AdminUserId = "yewen" | "allen" | "zhuangze";

export type AdminUserDef = {
  id: AdminUserId;
  label: string;
  role: AdminRole;
  envKey: string;
};

/** Fixed internal roster — secrets come from env, never hardcode passwords here. */
export const ADMIN_USERS: readonly AdminUserDef[] = [
  { id: "yewen", label: "Yewen", role: "owner", envKey: "ADMIN_SECRET_YEWEN" },
  { id: "allen", label: "Allen", role: "owner", envKey: "ADMIN_SECRET_ALLEN" },
  {
    id: "zhuangze",
    label: "Zhuangze",
    role: "user",
    envKey: "ADMIN_SECRET_ZHUANGZE",
  },
] as const;

export type ResolvedAdminAuth = {
  userId: AdminUserId;
  role: AdminRole;
  label: string;
};

export function resolveAdminAuth(token: string): ResolvedAdminAuth | null {
  if (!token) return null;
  for (const user of ADMIN_USERS) {
    const secret = getEnv(user.envKey);
    if (secret && token === secret) {
      return { userId: user.id, role: user.role, label: user.label };
    }
  }
  return null;
}

export function listConfiguredAdminUsers(): Array<{
  id: AdminUserId;
  label: string;
  configured: boolean;
}> {
  return ADMIN_USERS.map((user) => ({
    id: user.id,
    label: user.label,
    configured: Boolean(getEnv(user.envKey)),
  }));
}

export function authMiddleware(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  const auth = req.headers.authorization ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  const resolved = resolveAdminAuth(token);
  if (!resolved) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  res.locals.adminRole = resolved.role;
  res.locals.adminUserId = resolved.userId;
  res.locals.adminUserLabel = resolved.label;
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
