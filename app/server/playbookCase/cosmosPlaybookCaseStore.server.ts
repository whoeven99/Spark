import type { PlaybookCaseDoc } from "./types.server";
import { getPlaybookCasesSparkOpsContainer } from "../cosmos/cosmosSparkOps.server";

export async function upsertPlaybookCaseDoc(doc: PlaybookCaseDoc): Promise<void> {
  const shop = doc.shop.trim();
  if (!shop) return;
  const container = getPlaybookCasesSparkOpsContainer();
  await container.items.upsert({ ...doc, shop });
}
