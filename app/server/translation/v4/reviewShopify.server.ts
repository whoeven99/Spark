/**
 * App 侧 Shopify 译文对账 / 改写助手。
 *
 * 与 worker 的 verifyWorker 对账逻辑一致（worker/src/services/shopifyFetch.ts），
 * 区别是这里用当前登录用户的 admin GraphQL 客户端（authenticate.admin），
 * 面向人工查阅写回详情、并允许行内改写后重新写回 Shopify。
 */
import type { ShopifyAdminGraphqlClient } from "../../ai/skills/shopifyInfo/shopifyInfo.tool";

const TRANSLATABLE_RESOURCE_BY_ID_QUERY = `#graphql
  query ReviewTranslatableResource($resourceId: ID!, $locale: String!) {
    translatableResource(resourceId: $resourceId) {
      resourceId
      translatableContent {
        key
        digest
      }
      translations(locale: $locale) {
        key
        value
        outdated
      }
    }
  }
`;

const TRANSLATIONS_REGISTER_MUTATION = `#graphql
  mutation ReviewRegisterTranslations($resourceId: ID!, $translations: [TranslationInput!]!) {
    translationsRegister(resourceId: $resourceId, translations: $translations) {
      translations {
        key
        value
      }
      userErrors {
        field
        message
      }
    }
  }
`;

export type StoredTranslation = {
  key: string;
  value: string;
  outdated: boolean;
};

export type ResourceShopifyState = {
  /** 线上实际译文，按 key 取。 */
  translations: Map<string, StoredTranslation>;
  /** 当前最新内容指纹，按 key 取——改写时必须用最新 digest。 */
  digestByKey: Map<string, string>;
};

/** 字段对账状态，对齐 verifyWorker 的判定。 */
export type ReviewFieldStatus = "ok" | "mismatch" | "missing" | "outdated";

/** 归一化后比较期望写回值与线上读回值，与 worker translationValuesMatch 一致。 */
export function translationValuesMatch(expected: string, actual: string): boolean {
  return expected.trim() === actual.trim();
}

/** 读取单个资源在目标语言下的线上译文与最新内容指纹。 */
export async function fetchResourceShopifyState(
  admin: ShopifyAdminGraphqlClient,
  resourceId: string,
  locale: string,
): Promise<ResourceShopifyState> {
  const response = await admin.graphql(TRANSLATABLE_RESOURCE_BY_ID_QUERY, {
    variables: { resourceId, locale },
  });
  const payload = (await response.json()) as {
    data?: {
      translatableResource?: {
        translatableContent?: Array<{ key: string; digest: string | null }> | null;
        translations?: Array<{ key: string; value: string | null; outdated?: boolean | null }> | null;
      } | null;
    };
    errors?: Array<{ message?: string }>;
  };

  if (payload.errors?.length) {
    throw new Error(payload.errors.map((e) => e.message ?? "").join("; ") || "Shopify GraphQL error");
  }

  const resource = payload.data?.translatableResource;
  const translations = new Map<string, StoredTranslation>();
  for (const row of resource?.translations ?? []) {
    translations.set(row.key, {
      key: row.key,
      value: row.value ?? "",
      outdated: Boolean(row.outdated),
    });
  }

  const digestByKey = new Map<string, string>();
  for (const c of resource?.translatableContent ?? []) {
    if (c.digest) digestByKey.set(c.key, c.digest);
  }

  return { translations, digestByKey };
}

/** 判定单个字段的对账状态。 */
export function resolveFieldStatus(
  expectedValue: string,
  stored: StoredTranslation | undefined,
): ReviewFieldStatus {
  if (!stored) return "missing";
  if (stored.outdated) return "outdated";
  if (!translationValuesMatch(expectedValue, stored.value)) return "mismatch";
  return "ok";
}

export type RewriteResult = {
  success: boolean;
  userErrors: Array<{ field?: string | null; message: string }>;
};

/**
 * 人工改写后重新写回单个字段。
 * 调用方需先用 fetchResourceShopifyState 取到该 key 的最新 digest。
 */
export async function rewriteTranslation(
  admin: ShopifyAdminGraphqlClient,
  resourceId: string,
  locale: string,
  key: string,
  value: string,
  digest: string,
): Promise<RewriteResult> {
  const response = await admin.graphql(TRANSLATIONS_REGISTER_MUTATION, {
    variables: {
      resourceId,
      translations: [
        { locale, key, value, translatableContentDigest: digest },
      ],
    },
  });
  const payload = (await response.json()) as {
    data?: {
      translationsRegister?: {
        translations?: Array<{ key: string; value: string }> | null;
        userErrors?: Array<{ field?: string | null; message: string }> | null;
      } | null;
    };
    errors?: Array<{ message?: string }>;
  };

  if (payload.errors?.length) {
    return {
      success: false,
      userErrors: payload.errors.map((e) => ({ message: e.message ?? "Shopify GraphQL error" })),
    };
  }

  const result = payload.data?.translationsRegister;
  const userErrors = result?.userErrors ?? [];
  const registered = (result?.translations ?? []).some((t) => t.key === key);
  return {
    success: userErrors.length === 0 && registered,
    userErrors:
      userErrors.length > 0
        ? userErrors
        : registered
          ? []
          : [{ field: "translations", message: `translationsRegister 未返回 key=${key}` }],
  };
}
