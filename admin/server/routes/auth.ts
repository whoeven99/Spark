import { Router } from "express";
import { authMiddleware } from "../middleware/auth.js";

export const authRouter = Router();

// Returns the role of the current token — used by the frontend after login
authRouter.get("/role", authMiddleware, (_req, res) => {
  res.json({ role: res.locals.adminRole as string });
});
