import type { AgentRunDoc } from "./types.server";
import { getAgentRunsSparkOpsContainer } from "../cosmos/cosmosSparkOps.server";

export async function upsertAgentRunDoc(doc: AgentRunDoc): Promise<void> {
  const shop = doc.shop.trim();
  if (!shop) return;
  const container = await getAgentRunsSparkOpsContainer();
  await container.items.upsert({ ...doc, shop });
}

/** 测试或运维：按 shop 删除该分区下全部 run（不含店铺画像 id=profile） */
export async function deleteAgentRunsForShop(shop: string): Promise<number> {
  const shopTrim = shop.trim();
  if (!shopTrim) return 0;
  const container = await getAgentRunsSparkOpsContainer();
  const query = container.items.query<{ id: string }>({
    query:
      "SELECT c.id FROM c WHERE c.shop = @shop AND c.id != @profileId AND (NOT IS_DEFINED(c.docType) OR c.docType != @profileDocType)",
    parameters: [
      { name: "@shop", value: shopTrim },
      { name: "@profileId", value: "profile" },
      { name: "@profileDocType", value: "shop_profile" },
    ],
  });
  const { resources } = await query.fetchAll();
  let deleted = 0;
  for (const row of resources) {
    await container.item(row.id, shopTrim).delete();
    deleted += 1;
  }
  return deleted;
}
