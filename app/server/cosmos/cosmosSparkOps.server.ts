import { CosmosClient, type Container } from "@azure/cosmos";

const DEFAULT_DATABASE_ID = "spark_ops";

let cosmosClient: CosmosClient | null = null;
/** 仅 agent run 等可选自动建容器时使用 */
let ensureContainerPromises = new Map<string, Promise<Container>>();

function getRequiredEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`缺少环境变量 ${name}`);
  return value;
}

function getCosmosClient(): CosmosClient {
  if (!cosmosClient) {
    cosmosClient = new CosmosClient({
      endpoint: getRequiredEnv("COSMOS_ENDPOINT"),
      key: getRequiredEnv("COSMOS_KEY"),
    });
  }
  return cosmosClient;
}

function sparkOpsDatabaseId(): string {
  return process.env.COSMOS_OPS_DATABASE_ID?.trim() || DEFAULT_DATABASE_ID;
}

export function isCosmosSparkOpsConfigured(): boolean {
  return Boolean(
    process.env.COSMOS_ENDPOINT?.trim() && process.env.COSMOS_KEY?.trim(),
  );
}

/**
 * 连接已存在的容器，绝不调用 createIfNotExists（避免超出账户 RU 配额）。
 * 容器须已在 Azure Portal 创建（如 agent_runs）。
 */
export function getExistingSparkOpsContainer(containerId: string): Container {
  return getCosmosClient()
    .database(sparkOpsDatabaseId())
    .container(containerId);
}

export function isCosmosThroughputLimitError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const e = error as { code?: number; substatus?: number; message?: string; body?: { message?: string } };
  const msg = `${e.message ?? ""} ${e.body?.message ?? ""}`;
  if (msg.includes("total throughput limit") || msg.includes("cosmos-tp-limit")) {
    return true;
  }
  return e.code === 400 && e.substatus === 1028;
}

/**
 * 可选：自动创建库/容器（仅运维脚本或显式开启时使用）。
 * 默认**不**创建；须设 `COSMOS_SPARK_OPS_AUTO_CREATE=true` 才会 createIfNotExists。
 */
export async function ensureSparkOpsContainer(
  containerId: string,
  options?: { defaultTtl?: number },
): Promise<Container> {
  const autoCreate = process.env.COSMOS_SPARK_OPS_AUTO_CREATE?.trim().toLowerCase();
  if (autoCreate !== "true" && autoCreate !== "1") {
    return getExistingSparkOpsContainer(containerId);
  }

  const cacheKey = `${containerId}:${options?.defaultTtl ?? "none"}`;
  const existing = ensureContainerPromises.get(cacheKey);
  if (existing) return existing;

  const promise = (async () => {
    const client = getCosmosClient();
    const databaseId = sparkOpsDatabaseId();
    const { database } = await client.databases.createIfNotExists({
      id: databaseId,
    });
    const { container } = await database.containers.createIfNotExists({
      id: containerId,
      partitionKey: { paths: ["/shop"] },
      ...(options?.defaultTtl != null
        ? { defaultTtl: options.defaultTtl }
        : {}),
    });
    return container;
  })();

  ensureContainerPromises.set(cacheKey, promise);
  return promise;
}

export const SPARK_OPS_AGENT_RUNS_CONTAINER =
  process.env.COSMOS_AGENT_RUNS_CONTAINER?.trim() || "agent_runs";

export const AGENT_RUNS_DEFAULT_TTL_SECONDS = 77_760_000;

/**
 * Agent Run 读写容器：仅连接 Portal 已创建的 `agent_runs`，绝不 createIfNotExists。
 * 自动建容器请用 `ensureAgentRunsSparkOpsContainer()`（运维脚本）。
 */
export function getAgentRunsSparkOpsContainer(): Container {
  return getExistingSparkOpsContainer(SPARK_OPS_AGENT_RUNS_CONTAINER);
}

/** 运维/本地探测：显式开启 `COSMOS_SPARK_OPS_AUTO_CREATE=true` 时尝试建库建容器 */
export async function ensureAgentRunsSparkOpsContainer(): Promise<Container> {
  return ensureSparkOpsContainer(SPARK_OPS_AGENT_RUNS_CONTAINER, {
    defaultTtl: AGENT_RUNS_DEFAULT_TTL_SECONDS,
  });
}
