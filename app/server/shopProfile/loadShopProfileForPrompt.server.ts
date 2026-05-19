import type { UserProfile } from "../ai/core/toolRegistry.server";
import { getShopProfileDoc } from "./cosmosShopProfileStore.server";
import {
  isShopProfileBlobConfigured,
  readShopProfileMarkdown,
} from "./shopProfileBlobStore.server";

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

/** 从 profile.md 首段提炼一句摘要（Cosmos 不可用时的兜底） */
function snippetFromMarkdown(markdown: string): string {
  const line = markdown
    .split("\n")
    .map((l) => l.trim())
    .find((l) => l && !l.startsWith("#") && !l.startsWith(">"));
  if (line) return line.slice(0, 800);
  return "店铺画像见下方 Markdown（仅 Blob 存储）。";
}

async function loadFromBlobOnly(shop: string): Promise<UserProfile | undefined> {
  if (!isShopProfileBlobConfigured()) return undefined;
  const markdown = await readShopProfileMarkdown(shop);
  if (!markdown?.trim()) return undefined;
  const max = markdownMaxChars();
  return {
    promptSnippet: snippetFromMarkdown(markdown),
    shopProfileMarkdown: truncateMarkdown(markdown, max),
    profileSource: "blob_only",
  };
}

/**
 * 读取 Cosmos/Blob 中的店铺画像，供 Agent system prompt 使用。
 */
export async function loadShopProfileForPrompt(
  shop: string | undefined,
): Promise<UserProfile | undefined> {
  const shopTrim = shop?.trim();
  if (!shopTrim) return undefined;

  const doc = await getShopProfileDoc(shopTrim).catch((error) => {
    console.error("[ShopProfile] getShopProfileDoc failed:", error);
    return null;
  });

  if (!doc) {
    return loadFromBlobOnly(shopTrim);
  }

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
