import { loadEnv } from "./lib/env.js";
loadEnv();

import express from "express";
import cors from "cors";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { authMiddleware } from "./middleware/auth.js";
import { authRouter } from "./routes/auth.js";
import { overviewRouter } from "./routes/overview.js";
import { shopsRouter } from "./routes/shops.js";
import { translationsRouter } from "./routes/translations.js";
import { usageRouter } from "./routes/usage.js";
import { capabilitiesRouter } from "./routes/capabilities.js";
import { subscriptionsRouter } from "./routes/subscriptions.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT ?? 3099);
const IS_PROD = process.env.NODE_ENV === "production";

const app = express();
app.use(express.json());
app.use(
  cors({
    origin: IS_PROD ? false : "http://localhost:5174",
    credentials: true,
  }),
);

// Health check — no auth needed
app.get("/health", (_req, res) => res.json({ ok: true }));

// Role discovery — any authenticated user
app.use("/api/auth", authRouter);

// All authenticated users can access all routes
app.use("/api/overview", authMiddleware, overviewRouter);
app.use("/api/shops", authMiddleware, shopsRouter);
app.use("/api/translations", authMiddleware, translationsRouter);
app.use("/api/usage", authMiddleware, usageRouter);
app.use("/api/capabilities", authMiddleware, capabilitiesRouter);
app.use("/api/subscriptions", authMiddleware, subscriptionsRouter);

// Serve built frontend in production
if (IS_PROD) {
  const publicDir = path.resolve(__dirname, "../public");
  app.use(express.static(publicDir));
  app.get("*", (_req, res) => {
    res.sendFile(path.join(publicDir, "index.html"));
  });
}

app.listen(PORT, () => {
  console.info(`[admin] Server running on port ${PORT} (${IS_PROD ? "production" : "development"})`);
});
