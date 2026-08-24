import { Router } from "express";
import {
  authMiddleware,
  listConfiguredAdminUsers,
} from "../middleware/auth.js";

export const authRouter = Router();

/** Public: which users can appear on the login picker (ids/labels only). */
authRouter.get("/users", (_req, res) => {
  res.json({
    users: listConfiguredAdminUsers().map(({ id, label }) => ({ id, label })),
  });
});

/** Returns role + identity of the current token — used after login. */
authRouter.get("/role", authMiddleware, (_req, res) => {
  res.json({
    role: res.locals.adminRole as string,
    userId: res.locals.adminUserId as string,
    label: res.locals.adminUserLabel as string,
  });
});
