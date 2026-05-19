import { CosmosClient, type Container } from "@azure/cosmos";
import type { AgentRunDoc } from "./types.server";

const DEFAULT_DATABASE_ID = "spark_ops";
const DEFAULT_CONTAINER_ID = "agent_runs";
/** 90 天 */
const DEFAULT_TTL_SECONDS = 77_760_000;

let containerPromise: Promise<Container> | null = null;

function getRequiredEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`缺少环境变量 ${name}`);
  return value;
}

async function getAgentRunsContainer(): Promise<Container> {
  if (containerPromise) return containerPromise;
  containerPromise = (async () => {
    const endpoint = getRequiredEnv("COSMOS_ENDPOINT");
    const key = getRequiredEnv("COSMOS_KEY");
    const databaseId =
      process.env.COSMOS_OPS_DATABASE_ID?.trim() || DEFAULT_DATABASE_ID;
    const containerId =
      process.env.COSMOS_AGENT_RUNS_CONTAINER?.trim() || DEFAULT_CONTAINER_ID;
    const client = new CosmosClient({ endpoint, key });
    const { database } = await client.databases.createIfNotExists({
      id: databaseId,
    });
    const { container } = await database.containers.createIfNotExists({
      id: containerId,
      partitionKey: { paths: ["/shop"] },
      defaultTtl: DEFAULT_TTL_SECONDS,
    });
    return container;
  })();
  return containerPromise;
}

export async function upsertAgentRunDoc(doc: AgentRunDoc): Promise<void> {
  const shop = doc.shop.trim();
  if (!shop) return;
  const container = await getAgentRunsContainer();
  await container.items.upsert({ ...doc, shop });
}

/** 测试或运维：按 shop 删除该分区下全部 run（慎用 RU） */
export async function deleteAgentRunsForShop(shop: string): Promise<number> {
  const shopTrim = shop.trim();
  if (!shopTrim) return 0;
  const container = await getAgentRunsContainer();
  const query = container.items.query<AgentRunDoc>({
    query: "SELECT c.id FROM c WHERE c.shop = @shop",
    parameters: [{ name: "@shop", value: shopTrim }],
  });
  const { resources } = await query.fetchAll();
  let deleted = 0;
  for (const row of resources) {
    await container.item(row.id, shopTrim).delete();
    deleted += 1;
  }
  return deleted;
}
