import { startBridgeServer } from "./bridge-server.mjs";
import { startDirectServer } from "./direct-server.mjs";

const mode = (process.env.RENDER_MCP_MODE || "bridge").trim().toLowerCase();

async function main() {
  if (mode === "direct") {
    await startDirectServer();
    return;
  }
  if (mode === "bridge" || mode === "hosted") {
    await startBridgeServer();
    return;
  }
  throw new Error(`Unknown RENDER_MCP_MODE=${mode}. Use bridge or direct.`);
}

main().catch((err) => {
  console.error("[render-mcp] fatal:", err);
  process.exit(1);
});
