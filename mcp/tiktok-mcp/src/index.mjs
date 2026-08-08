import "./load-env.mjs";
import { startServer } from "./server.mjs";

startServer().catch((err) => {
  console.error("[tiktok-mcp] fatal:", err);
  process.exit(1);
});
