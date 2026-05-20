import { ensureRuntimeEnv } from "../app/config/runtimeEnv.server.ts";
import {
  ensureAgentRunsSparkOpsContainer,
  getAgentRunsSparkOpsContainer,
  isCosmosSparkOpsConfigured,
  isCosmosThroughputLimitError,
  SPARK_OPS_AGENT_RUNS_CONTAINER,
} from "../app/server/cosmos/cosmosSparkOps.server.ts";

ensureRuntimeEnv();

async function main() {
  console.log("COSMOS configured:", isCosmosSparkOpsConfigured());
  console.log("Database:", process.env.COSMOS_OPS_DATABASE_ID?.trim() || "spark_ops");
  console.log("Container:", SPARK_OPS_AGENT_RUNS_CONTAINER);
  console.log("AGENT_RUN_LOG_ENABLED:", process.env.AGENT_RUN_LOG_ENABLED ?? "(default true)");

  console.log("\nUsing getAgentRunsSparkOpsContainer (existing only, app hot path)...");
  let container = getAgentRunsSparkOpsContainer();
  if (process.env.COSMOS_SPARK_OPS_AUTO_CREATE?.trim().toLowerCase() === "true") {
    try {
      console.log("COSMOS_SPARK_OPS_AUTO_CREATE=true — also trying ensureAgentRunsSparkOpsContainer...");
      container = await ensureAgentRunsSparkOpsContainer();
      console.log("ensure path: OK");
    } catch (error) {
      console.log(
        "ensure path: FAILED",
        isCosmosThroughputLimitError(error) ? "(RU limit)" : "",
      );
      console.log("  ", error?.message?.slice(0, 120) ?? error);
      container = getAgentRunsSparkOpsContainer();
    }
  }
  const { resources: all } = await container.items
    .query({
      query:
        "SELECT TOP 20 c.id, c.shop, c.feature, c.startedAt, c.docType FROM c ORDER BY c.startedAt DESC",
    })
    .fetchAll();
  console.log("\nTop 20 docs (any shop):", all.length);
  for (const row of all) {
    console.log(
      `  id=${row.id} shop=${row.shop} feature=${row.feature ?? "-"} docType=${row.docType ?? "-"}`,
    );
  }

  const shopArg = process.argv[2]?.trim();
  if (shopArg) {
    const { resources: byShop } = await container.items
      .query({
        query:
          "SELECT c.id, c.shop, c.feature, c.startedAt FROM c WHERE c.shop = @shop ORDER BY c.startedAt DESC",
        parameters: [{ name: "@shop", value: shopArg }],
      })
      .fetchAll();
    console.log(`\nPartition shop=${shopArg}:`, byShop.length);
    for (const row of byShop.slice(0, 10)) {
      console.log(`  id=${row.id} feature=${row.feature}`);
    }
  }
}

main().catch((e) => {
  console.error("probe failed:", e?.message || e);
  process.exit(1);
});
