import { CosmosClient, type Container } from "@azure/cosmos";
import { requireEnv, getEnv } from "./env.js";

let _client: CosmosClient | null = null;

function getClient(): CosmosClient {
  if (!_client) {
    _client = new CosmosClient({
      endpoint: requireEnv("COSMOS_ENDPOINT"),
      key: requireEnv("COSMOS_KEY"),
    });
  }
  return _client;
}

export function getTranslationJobsContainer(): Container {
  const db = getEnv("COSMOS_TRANSLATION_DATABASE_ID", "translation");
  const container = getEnv(
    "COSMOS_TRANSLATION_V4_JOBS_CONTAINER",
    "translation_v4_jobs",
  );
  return getClient().database(db).container(container);
}

export function getAgentRunsContainer(): Container {
  const db = getEnv("COSMOS_AGENT_RUNS_DATABASE_ID", "spark_ops");
  const container = getEnv("COSMOS_AGENT_RUNS_CONTAINER", "agent_runs");
  return getClient().database(db).container(container);
}

export function getShopAnalysisContainer(): Container {
  const db = getEnv("COSMOS_TRANSLATION_DATABASE_ID", "translation");
  const container = getEnv("COSMOS_SHOP_ANALYSIS_CONTAINER", "shop_analysis_jobs");
  return getClient().database(db).container(container);
}

export function isCosmosConfigured(): boolean {
  return Boolean(
    process.env.COSMOS_ENDPOINT?.trim() && process.env.COSMOS_KEY?.trim(),
  );
}
