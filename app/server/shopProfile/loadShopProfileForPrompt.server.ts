import type { UserProfile } from "../ai/core/toolRegistry.server";
import { getShopProfileDoc } from "./cosmosShopProfileStore.server";
import { readShopProfileMarkdown } from "./shopProfileBlobStore.server";

const DEFAULT_MARKDOWN_MAX = 6000;

function markdownMaxChars(): number {
  const raw = process.env.SHOP_PROFILE_MARKDOWN_MAX_CHARS?.trim();
  if (!raw) return DEFAULT_MARKDOWN_MAX;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : DEFAULT_MARKDOWN_MAX;
}

function truncateMarkdown(text: string, max: number): string {
  if (text.length <= max) return text;
  return `${text.slice(0, max)}\n\n…（画像正文已截断）`;
}

/**
 * 读取 Cosmos/Blob 中的店铺画像，供 Agent system prompt 使用。
 */
export async function loadShopProfileForPrompt(
  shop: string | undefined,
): Promise<UserProfile | undefined> {
  const shopTrim = shop?.trim();
  if (!shopTrim) return undefined;

  const doc = await getShopProfileDoc(shopTrim);
  if (!doc) return undefined;

  let markdown = doc.profileMarkdownInline ?? "";
  if (doc.blob?.path) {
    const fromBlob = await readShopProfileMarkdown(shopTrim);
    if (fromBlob) markdown = fromBlob;
  }

  const max = markdownMaxChars();
  const shopProfileMarkdown = markdown ? truncateMarkdown(markdown, max) : "";

  return {
    promptSnippet: doc.promptSnippet,
    shopProfileMarkdown,
    facets: doc.facets,
    profileVersion: doc.version,
    profileUpdatedAt: doc.updatedAt,
  };
}
