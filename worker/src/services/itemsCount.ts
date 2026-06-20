/**
 * 汇总页统计：job 完成后按 module 计算「已翻译/总可翻译字段数」并写入 Redis，
 * 供 TSF 汇总页直接读取（避免每次刷新都现拉 Shopify）。
 *
 * 口径与 TSF `app/server/translateV4/itemsCount.server.ts` 完全一致：
 *   - total（分母）：shouldIncludeFieldV2 + isCover:true 判定的「应翻字段」（不受现有译文影响）。
 *   - translated（分子）：上述字段里已有「当前译文」（outdated !== true）的数量。
 * 二者共用同一套 translationFilter，保证 worker 写入值 == TSF 现算值。
 */
import { shouldIncludeFieldV2 } from "./translationFilter.js";

const TRANSLATABLE_RESOURCES_QUERY = `
query CountTranslatableResources(
  $resourceType: TranslatableResourceType!
  $first: Int!
  $locale: String!
  $after: String
) {
  translatableResources(resourceType: $resourceType, first: $first, after: $after) {
    edges {
      node {
        translations(locale: $locale) { key outdated }
        translatableContent { key value type }
      }
    }
    pageInfo { hasNextPage endCursor }
  }
}`;

const PAGE_SIZE = 250;

export type ModuleCount = { total: number; translated: number };

type Node = {
  translations?: Array<{ key: string; outdated?: boolean | null }> | null;
  translatableContent?: Array<{ key: string; value: string; type?: string | null }> | null;
};

function hasCurrentTranslation(
  translations: Node["translations"],
  key: string,
): boolean {
  return (translations ?? []).some((t) => t.key === key && t.outdated !== true);
}

/**
 * 计算某 module 在某目标语言下的 已翻译/总可翻译 字段数。
 * module 名即 Shopify TranslatableResourceType（identity）。
 * 注：非 id-based 模块直接 translatableResources 枚举即可；id-based（PRODUCT/COLLECTION/
 * PAGE/ARTICLE）此处亦用同一查询，与 TSF 现算口径保持一致。
 */
export async function computeModuleCount(
  shopDomain: string,
  accessToken: string,
  module: string,
  locale: string,
): Promise<ModuleCount> {
  const url = `https://${shopDomain}/admin/api/2024-01/graphql.json`;
  let total = 0;
  let translated = 0;
  let after: string | null = null;

  for (;;) {
    const resp = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Shopify-Access-Token": accessToken,
      },
      body: JSON.stringify({
        query: TRANSLATABLE_RESOURCES_QUERY,
        variables: { resourceType: module, first: PAGE_SIZE, locale, after },
      }),
    });
    if (!resp.ok) {
      throw new Error(`translatableResources ${module} HTTP ${resp.status}`);
    }
    const data: any = await resp.json();
    const conn = data?.data?.translatableResources;
    const edges: Array<{ node: Node }> = conn?.edges ?? [];

    for (const { node } of edges) {
      const translations = node.translations ?? [];
      for (const content of node.translatableContent ?? []) {
        const includable = shouldIncludeFieldV2(
          { key: content.key, value: content.value, type: content.type },
          undefined,
          { module, isCover: true, isHandle: false },
        );
        if (!includable) continue;
        total++;
        if (hasCurrentTranslation(translations, content.key)) translated++;
      }
    }

    if (!conn?.pageInfo?.hasNextPage) break;
    after = conn.pageInfo.endCursor ?? null;
    if (!after) break;
  }

  return { total, translated };
}
