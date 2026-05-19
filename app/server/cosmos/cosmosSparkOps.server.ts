import { CosmosClient, type Container } from "@azure/cosmos";

const DEFAULT_DATABASE_ID = "spark_ops";

const containerPromises = new Map<string, Promise<Container>>();

function getRequiredEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`缺少环境变量 ${name}`);
  return value;
}

export function isCosmosSparkOpsConfigured(): boolean {
  return Boolean(
    process.env.COSMOS_ENDPOINT?.trim() && process.env.COSMOS_KEY?.trim(),
  );
}

/**
 * 获取 spark_ops 库下的容器。同一 containerId 只 createIfNotExists 一次，避免重复占 RU。
 * @param defaultTtl 容器级 TTL（秒）；画像等长驻文档应在 item 上设 ttl: -1
 */
export async function getSparkOpsContainer(
  containerId: string,
  options?: { defaultTtl?: number },
): Promise<Container> {
  const cacheKey = `${containerId}:${options?.defaultTtl ?? "none"}`;
  const existing = containerPromises.get(cacheKey);
  if (existing) return existing;

  const promise = (async () => {
    const endpoint = getRequiredEnv("COSMOS_ENDPOINT");
    const key = getRequiredEnv("COSMOS_KEY");
    const databaseId =
      process.env.COSMOS_OPS_DATABASE_ID?.trim() || DEFAULT_DATABASE_ID;
    const client = new CosmosClient({ endpoint, key });
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

  containerPromises.set(cacheKey, promise);
  return promise;
}

/** 运维/Agent 运行摘要容器（与店铺画像默认共用，避免多容器占满账户 RU 配额） */
export const SPARK_OPS_AGENT_RUNS_CONTAINER =
  process.env.COSMOS_AGENT_RUNS_CONTAINER?.trim() || "agent_runs";

/** 90 天 */
export const AGENT_RUNS_DEFAULT_TTL_SECONDS = 77_760_000;

export async function getAgentRunsSparkOpsContainer(): Promise<Container> {
  return getSparkOpsContainer(SPARK_OPS_AGENT_RUNS_CONTAINER, {
    defaultTtl: AGENT_RUNS_DEFAULT_TTL_SECONDS,
  });
}

/**
 * 店铺画像默认写入 agent_runs 容器（partition /shop，id profile）。
 * 若已手动创建独立容器，可设 COSMOS_SHOP_PROFILES_CONTAINER（须与库级共享吞吐量，勿超账户 RU 上限）。
 */
export function resolveShopProfileContainerId(): string {
  return (
    process.env.COSMOS_SHOP_PROFILES_CONTAINER?.trim() ||
    SPARK_OPS_AGENT_RUNS_CONTAINER
  );
}

export async function getShopProfileSparkOpsContainer(): Promise<Container> {
  const containerId = resolveShopProfileContainerId();
  if (containerId === SPARK_OPS_AGENT_RUNS_CONTAINER) {
    return getAgentRunsSparkOpsContainer();
  }
  return getSparkOpsContainer(containerId);
}
