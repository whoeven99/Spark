// Fetch the per-job QPS log document from Cosmos (one doc per jobId).
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
  const { resource } = await container.item(jobId, jobId).read();
  if (!resource) {
    console.error(`no QPS log found for job ${jobId}`);
    process.exit(1);
  }
  console.log(JSON.stringify(resource, null, 2));
})().catch((e) => { console.error(e.message); process.exit(1); });
