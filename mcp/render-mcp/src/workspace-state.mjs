import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const STATE_DIR = process.env.RENDER_MCP_STATE_DIR?.trim()
  || path.join(os.homedir(), ".config", "render-mcp");
const STATE_FILE = path.join(STATE_DIR, "workspace.json");

function ensureDir() {
  fs.mkdirSync(STATE_DIR, { recursive: true });
}

export function getSelectedWorkspace() {
  try {
    const raw = fs.readFileSync(STATE_FILE, "utf8");
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function setSelectedWorkspace(owner) {
  ensureDir();
  const payload = {
    ownerID: owner.id ?? owner.ownerID ?? owner.ownerId,
    name: owner.name ?? owner.owner?.name ?? owner.id,
    type: owner.type ?? owner.owner?.type,
    updatedAt: new Date().toISOString(),
  };
  fs.writeFileSync(STATE_FILE, JSON.stringify(payload, null, 2));
  return payload;
}

export function requireSelectedWorkspace() {
  const ws = getSelectedWorkspace();
  if (!ws?.ownerID) {
    throw new Error(
      "尚未选择 workspace。请先调用 select_workspace（ownerID 来自 list_workspaces）。",
    );
  }
  return ws;
}

export async function resolveOwnerId(apiKey, explicitOwnerId) {
  if (explicitOwnerId) return explicitOwnerId;
  const ws = getSelectedWorkspace();
  if (ws?.ownerID) return ws.ownerID;
  const owners = await import("./render-api.mjs").then((m) => m.listOwners(apiKey));
  if (owners.length === 1) {
    const o = owners[0].owner ?? owners[0];
    setSelectedWorkspace({ id: o.id, name: o.name, type: o.type });
    return o.id;
  }
  throw new Error(
    "有多个 workspace，请先 list_workspaces + select_workspace，或传 ownerId 参数。",
  );
}
