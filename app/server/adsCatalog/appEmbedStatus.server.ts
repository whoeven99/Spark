import type { ShopifyAdminGraphqlClient } from "../ai/skills/shopifyInfo/shopifyInfo.tool";
import { GOOGLE_REMARKETING_APP_EMBED_HANDLE } from "../../lib/googleRemarketing";
import { META_PIXEL_APP_EMBED_HANDLE } from "../../lib/metaPixelEvents";

/**
 * Theme GraphQL `files` 返回的 `settings_data.json` 常带 Shopify 自动注入的
 * 块注释头，且主题 JSON 允许尾逗号；标准 JSON.parse 会失败。
 * 先剥离注释再做轻量尾逗号清理，再解析。
 */
export function parseThemeSettingsJson(raw: string): unknown | null {
  const withoutComments = raw.replace(/\/\*[\s\S]*?\*\//g, "").trim();
  const withoutTrailingCommas = withoutComments.replace(/,(\s*[}\]])/g, "$1");
  try {
    return JSON.parse(withoutTrailingCommas) as unknown;
  } catch {
    return null;
  }
}

/**
 * 在主题 `config/settings_data.json` 中查找指定 App Embed block 是否已启用。
 *
 * App Embed block 以 `shopify://apps/<app>/blocks/<handle>/<uuid>` 形式出现在
 * `current.blocks`（也可能出现在具名 preset 下）。启用判定：存在 type 命中 handle
 * 且 `disabled !== true` 的块。为兼容 `current` 为字符串（引用具名 preset）等形态，
 * 这里递归扫描整个 JSON。
 */
export function parseAppEmbedEnabled(
  settingsJson: string,
  handle: string,
): boolean {
  const parsed = parseThemeSettingsJson(settingsJson);
  if (parsed === null) return false;
  const needle = `/blocks/${handle}`;
  let enabled = false;

  const visit = (node: unknown): void => {
    if (enabled || node === null || typeof node !== "object") return;
    if (Array.isArray(node)) {
      for (const item of node) visit(item);
      return;
    }
    const record = node as Record<string, unknown>;
    const type = record.type;
    if (
      typeof type === "string" &&
      type.includes(needle) &&
      record.disabled !== true
    ) {
      enabled = true;
      return;
    }
    for (const value of Object.values(record)) visit(value);
  };

  visit(parsed);
  return enabled;
}

type ThemeFileBody = { content?: string } | null | undefined;

async function readMainThemeSettings(
  admin: ShopifyAdminGraphqlClient,
): Promise<string | null> {
  const themesResponse = await admin.graphql(`#graphql
    query SparkMainThemeId {
      themes(first: 1, roles: [MAIN]) {
        nodes { id }
      }
    }
  `);
  const themesJson = (await themesResponse.json()) as {
    data?: { themes?: { nodes?: Array<{ id?: string }> } };
  };
  const themeId = themesJson.data?.themes?.nodes?.[0]?.id;
  if (!themeId) return null;

  const filesResponse = await admin.graphql(
    `#graphql
      query SparkThemeSettingsFile($id: ID!, $filenames: [String!]!) {
        theme(id: $id) {
          files(filenames: $filenames, first: 1) {
            nodes {
              body {
                ... on OnlineStoreThemeFileBodyText { content }
              }
            }
          }
        }
      }
    `,
    { variables: { id: themeId, filenames: ["config/settings_data.json"] } },
  );
  const filesJson = (await filesResponse.json()) as {
    data?: {
      theme?: { files?: { nodes?: Array<{ body?: ThemeFileBody }> } };
    };
  };
  const content = filesJson.data?.theme?.files?.nodes?.[0]?.body?.content;
  return typeof content === "string" ? content : null;
}

export interface AppEmbedStatus {
  enabled: boolean;
  checkedAt: string;
  /** 无法读取主题（缺 read_themes scope、无主题或接口失败）时为 true，需引导手动确认。 */
  unavailable?: boolean;
}

async function readAppEmbedStatus(
  admin: ShopifyAdminGraphqlClient,
  handle: string,
): Promise<AppEmbedStatus> {
  const checkedAt = new Date().toISOString();
  try {
    const settings = await readMainThemeSettings(admin);
    if (!settings) return { enabled: false, checkedAt, unavailable: true };
    return {
      enabled: parseAppEmbedEnabled(settings, handle),
      checkedAt,
    };
  } catch {
    // 缺少 read_themes 授权或接口异常时，降级为不可用，让 UI 提示手动确认。
    return { enabled: false, checkedAt, unavailable: true };
  }
}

/** 检测 Spark Google Remarketing App Embed 是否已在当前主题启用。 */
export async function getGoogleAppEmbedStatus(
  admin: ShopifyAdminGraphqlClient,
): Promise<AppEmbedStatus> {
  return readAppEmbedStatus(admin, GOOGLE_REMARKETING_APP_EMBED_HANDLE);
}

/** 检测 Spark Meta Pixel App Embed 是否已在当前主题启用。 */
export async function getMetaAppEmbedStatus(
  admin: ShopifyAdminGraphqlClient,
): Promise<AppEmbedStatus> {
  return readAppEmbedStatus(admin, META_PIXEL_APP_EMBED_HANDLE);
}
