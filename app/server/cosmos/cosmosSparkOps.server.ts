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
 * 可选：自动创建容器（仅 Agent Run 等；店铺画像勿用）。
 * 设 COSMOS_SPARK_OPS_AUTO_CREATE=false 可关闭。
 */
export async function ensureSparkOpsContainer(
  containerId: string,
  options?: { defaultTtl?: number },
): Promise<Container> {
  const autoCreate = process.env.COSMOS_SPARK_OPS_AUTO_CREATE?.trim().toLowerCase();
  if (autoCreate === "false" || autoCreate === "0") {
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

export async function getAgentRunsSparkOpsContainer(): Promise<Container> {
  return ensureSparkOpsContainer(SPARK_OPS_AGENT_RUNS_CONTAINER, {
    defaultTtl: AGENT_RUNS_DEFAULT_TTL_SECONDS,
  });
}

/** 店铺画像固定使用已存在的 agent_runs，忽略独立容器 env（防 RU 超限） */
export function getShopProfileSparkOpsContainer(): Container {
  const configured = process.env.COSMOS_SHOP_PROFILES_CONTAINER?.trim();
  if (
    configured &&
    configured !== SPARK_OPS_AGENT_RUNS_CONTAINER
  ) {
    console.warn(
      `[ShopProfile] COSMOS_SHOP_PROFILES_CONTAINER=${configured} is ignored; using existing container "${SPARK_OPS_AGENT_RUNS_CONTAINER}" (no auto-create).`,
    );
  }
  return getExistingSparkOpsContainer(SPARK_OPS_AGENT_RUNS_CONTAINER);
}
