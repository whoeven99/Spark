import { randomUUID } from "node:crypto";
import { ensureRuntimeEnv } from "../app/config/runtimeEnv.server.ts";
import { recordAgentRun, isAgentRunLogEnabled } from "../app/server/agentRunLog/recordAgentRun.server.ts";
import { getExistingSparkOpsContainer, SPARK_OPS_AGENT_RUNS_CONTAINER } from "../app/server/cosmos/cosmosSparkOps.server.ts";

ensureRuntimeEnv();

const testShop = process.argv[2]?.trim() || "probe-test.myshopify.com";

console.log("AGENT_RUN_LOG_ENABLED:", isAgentRunLogEnabled());
console.log("test shop:", testShop);

const runId = randomUUID();
await recordAgentRun({
  runId,
  shop: testShop,
  appName: "chat",
  feature: "chat_stream",
  status: "success",
  startedAt: new Date().toISOString(),
  durationMs: 42,
  inputSummary: { lastHuman: "probe upsert test" },
  reflection: {
    summary: "probe",
    generatedAt: new Date().toISOString(),
  },
});

const container = getExistingSparkOpsContainer(SPARK_OPS_AGENT_RUNS_CONTAINER);
const { resource } = await container.item(runId, testShop).read();
console.log("read back:", resource ? "OK" : "MISSING");
if (resource) {
  console.log(JSON.stringify({ id: resource.id, shop: resource.shop, feature: resource.feature }, null, 2));
}
