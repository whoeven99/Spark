import type { ShopifyAdminGraphqlClient } from "../ai/skills/shopifyInfo/tool";
import {
  type ShopLocaleGraphqlRow,
  type ShopLocalesPayload,
  SHOP_LOCALES_FALLBACK,
} from "../../lib/generateDescriptionLocales";
import { logDetailedError } from "./generateDescriptionLog.server";

const LOG_PREFIX = "[GenerateDescription][ShopLocales]";

const SHOP_LOCALES_QUERY = `#graphql
  query GenerateDescriptionShopLocales {
    shopLocales {
      locale
      name
      primary
      published
    }
  }
`;

type ShopLocalesQueryResponse = {
  data?: { shopLocales?: ShopLocaleGraphqlRow[] | null };
  errors?: Array<{ message?: string }>;
};

function isValidRow(row: unknown): row is ShopLocaleGraphqlRow {
  if (!row || typeof row !== "object") return false;
  const r = row as Record<string, unknown>;
  return (
    typeof r.locale === "string" &&
    r.locale.trim().length > 0 &&
    typeof r.name === "string" &&
    typeof r.primary === "boolean" &&
    typeof r.published === "boolean"
  );
}

/**
 * 将 GraphQL 返回的 `shopLocales` 转为下拉选项；空或非法时回退到 {@link SHOP_LOCALES_FALLBACK}。
 * 导出供单测覆盖排序与主语言解析，无需 mock `fetch`。
 */
export function buildShopLocalesPayloadFromGraphqlRows(
  rows: unknown,
): ShopLocalesPayload {
  if (!Array.isArray(rows)) {
    return { ...SHOP_LOCALES_FALLBACK, isFallback: true };
  }
  const cleaned = rows.filter(isValidRow).map((r) => ({
    locale: r.locale.trim(),
    name: r.name.trim() || r.locale.trim(),
    primary: r.primary,
    published: r.published,
  }));
  if (cleaned.length === 0) {
    return { ...SHOP_LOCALES_FALLBACK, isFallback: true };
  }

  const byLocale = new Map<string, ShopLocaleGraphqlRow>();
  for (const r of cleaned) {
    byLocale.set(r.locale, r);
  }
  const unique = [...byLocale.values()].sort((a, b) => {
    if (a.primary !== b.primary) return a.primary ? -1 : 1;
    return a.locale.localeCompare(b.locale);
  });

  const primary = unique.find((r) => r.primary) ?? unique[0];
  const defaultTargetLanguage = primary?.locale ?? SHOP_LOCALES_FALLBACK.defaultTargetLanguage;

  const localeOptions = unique.map((r) => ({
    value: r.locale,
    label: `${r.name} (${r.locale})`,
  }));

  return {
    defaultTargetLanguage,
    localeOptions,
    isFallback: false,
  };
}

/**
 * 调用 Admin GraphQL `shopLocales`；失败或缺权限时返回静态 {@link SHOP_LOCALES_FALLBACK} 并打日志，
 * 保证 UI 始终可选语言。
 */
export async function fetchShopLocalesPayload(
  admin: ShopifyAdminGraphqlClient,
  logContext: string,
): Promise<ShopLocalesPayload> {
  console.info(`${LOG_PREFIX} fetch start ${logContext}`);
  try {
    const response = await admin.graphql(SHOP_LOCALES_QUERY);
    const payload = (await response.json()) as ShopLocalesQueryResponse;

    if (!response.ok) {
      console.info(
        `${LOG_PREFIX} HTTP 非成功 ${logContext} status=${response.status}`,
      );
      return { ...SHOP_LOCALES_FALLBACK, isFallback: true };
    }

    const gqlErrors = payload.errors?.map((e) => e.message).filter(Boolean);
    if (gqlErrors?.length) {
      console.info(
        `${LOG_PREFIX} GraphQL errors ${logContext}: ${gqlErrors.join("；")}`,
      );
      return { ...SHOP_LOCALES_FALLBACK, isFallback: true };
    }

    const raw = payload.data?.shopLocales;
    const built = buildShopLocalesPayloadFromGraphqlRows(raw);
    if (built.isFallback) {
      console.info(
        `${LOG_PREFIX} empty or invalid shopLocales array ${logContext}, using fallback list`,
      );
    } else {
      console.info(
        `${LOG_PREFIX} ok ${logContext} default=${built.defaultTargetLanguage} count=${built.localeOptions.length}`,
      );
    }
    return built;
  } catch (e) {
    logDetailedError(`${LOG_PREFIX} ${logContext}`, "shopLocales fetch failed", e);
    return { ...SHOP_LOCALES_FALLBACK, isFallback: true };
  }
}
