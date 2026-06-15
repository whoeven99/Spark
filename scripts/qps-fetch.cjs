// Quick fetch of QPS snapshots for a job from Cosmos
require("dotenv").config();
const { CosmosClient } = require("@azure/cosmos");

(async () => {
  const jobId = process.argv[2];
  if (!jobId) { console.error("usage: node qps-fetch.cjs <jobId>"); process.exit(1); }
  const client = new CosmosClient({
    endpoint: process.env.COSMOS_ENDPOINT,
    key: process.env.COSMOS_KEY,
  });
  const dbId = process.env.COSMOS_TRANSLATION_DATABASE_ID || "translation";
  const containerId = process.env.COSMOS_QPS_LOGS_CONTAINER || "translation_v4_qps_logs";
  const container = client.database(dbId).container(containerId);
  const { resources } = await container.items.query({
    query: "SELECT * FROM c WHERE c.jobId = @j ORDER BY c.timestamp ASC",
    parameters: [{ name: "@j", value: jobId }],
  }, { partitionKey: jobId }).fetchAll();
  console.log(JSON.stringify(resources, null, 2));
})().catch((e) => { console.error(e.message); process.exit(1); });
