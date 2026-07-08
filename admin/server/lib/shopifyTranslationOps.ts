const SHOPIFY_API_VERSION = "2024-10";
export const TRANSLATIONS_REGISTER_BATCH_SIZE = 50;
const SHOPIFY_MAX_INPUT_ARRAY_SIZE = 250;
const MAX_RETRIES = 3;

export const RESOURCE_TYPES = [
  "PRODUCT",
  "PRODUCT_OPTION",
  "PRODUCT_OPTION_VALUE",
  "COLLECTION",
  "ONLINE_STORE_THEME",
  "ONLINE_STORE_THEME_APP_EMBED",
  "ONLINE_STORE_THEME_JSON_TEMPLATE",
  "ONLINE_STORE_THEME_SECTION_GROUP",
  "ONLINE_STORE_THEME_SETTINGS_CATEGORY",
  "ONLINE_STORE_THEME_SETTINGS_DATA_SECTIONS",
  "ONLINE_STORE_THEME_LOCALE_CONTENT",
  "PACKING_SLIP_TEMPLATE",
  "SHOP_POLICY",
  "EMAIL_TEMPLATE",
  "MENU",
  "LINK",
  "DELIVERY_METHOD_DEFINITION",
  "FILTER",
  "METAFIELD",
  "METAOBJECT",
  "PAYMENT_GATEWAY",
  "SELLING_PLAN",
  "SELLING_PLAN_GROUP",
  "SHOP",
  "ARTICLE",
  "BLOG",
  "PAGE",
] as const;

export type ResourceType = (typeof RESOURCE_TYPES)[number];

export type TranslationRow = {
  moduleType: string;
  resourceId: string;
  key: string;
  source_text: string | null;
  source_code: string | null;
  target_text: string | null;
  target_code: string | null;
  digest: string | null;
  type: string | null;
  outdated: boolean | null;
};

type GraphqlResponse<T> = {
  data?: T;
  errors?: { message: string }[];
};

type TranslatableNode = {
  resourceId: string;
  translations: {
    locale: string;
    value: string;
    key: string;
    outdated: boolean;
  }[];
  translatableContent: {
    type: string;
    locale: string;
    key: string;
    value: string;
    digest: string;
  }[];
};

const GET_TRANSLATABLE_RESOURCES = `
  query GetTranslatableResources($resourceType: TranslatableResourceType!, $first: Int!, $after: String, $locale: String!) {
    translatableResources(resourceType: $resourceType, first: $first, after: $after) {
      nodes {
        resourceId
        translations(locale: $locale) {
          locale
          value
          key
          outdated
        }
        translatableContent {
          type
          locale
          key
          value
          digest
        }
      }
      pageInfo {
        endCursor
        hasNextPage
      }
    }
  }
`;

const TRANSLATIONS_REGISTER_MUTATION = `
  mutation translationsRegister($resourceId: ID!, $translations: [TranslationInput!]!) {
    translationsRegister(resourceId: $resourceId, translations: $translations) {
      translations {
        locale
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

const TRANSLATIONS_REMOVE_MUTATION = `
  mutation translationsRemove($resourceId: ID!, $translationKeys: [String!]!, $locales: [String!]!) {
    translationsRemove(resourceId: $resourceId, translationKeys: $translationKeys, locales: $locales) {
      userErrors {
        message
        field
      }
      translations {
        key
        value
      }
    }
  }
`;

export class ShopifyTranslationOps {
  private readonly baseUrl: string;
  private readonly headers: Record<string, string>;

  constructor(
    private readonly shopName: string,
    accessToken: string,
  ) {
    this.baseUrl = `https://${shopName}/admin/api/${SHOPIFY_API_VERSION}/graphql.json`;
    this.headers = {
      "X-Shopify-Access-Token": accessToken,
      "Content-Type": "application/json",
    };
  }

  private async graphql<T>(
    query: string,
    variables: Record<string, unknown>,
    attempt = 0,
  ): Promise<GraphqlResponse<T>> {
    const response = await fetch(this.baseUrl, {
      method: "POST",
      headers: this.headers,
      body: JSON.stringify({ query, variables }),
    });

    if (!response.ok) {
      const text = await response.text();
      if (attempt < MAX_RETRIES - 1) {
        return this.graphql(query, variables, attempt + 1);
      }
      throw new Error(`Shopify HTTP ${response.status}: ${text.slice(0, 200)}`);
    }

    return (await response.json()) as GraphqlResponse<T>;
  }

  async getModuleData(
    moduleType: ResourceType,
    targetLocale: string,
    first = 250,
    cursor: string | null = null,
  ): Promise<TranslationRow[] | { error: string }> {
    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      try {
        const data = await this.graphql<{
          translatableResources: {
            nodes: TranslatableNode[];
            pageInfo: { endCursor: string | null; hasNextPage: boolean };
          };
        }>(GET_TRANSLATABLE_RESOURCES, {
          resourceType: moduleType,
          first,
          locale: targetLocale,
          after: cursor,
        });

        if (data.errors?.length) {
          return { error: data.errors[0]?.message ?? "GraphQL error" };
        }

        const resources = data.data?.translatableResources;
        if (!resources) {
          return { error: "返回数据格式错误" };
        }

        const result: TranslationRow[] = [];
        for (const node of resources.nodes) {
          if (!node.translatableContent?.length) continue;
          for (const content of node.translatableContent) {
            const targetTranslation = node.translations?.find(
              (t) => t.locale === targetLocale && t.key === content.key,
            );
            result.push({
              moduleType,
              resourceId: node.resourceId,
              key: content.key,
              source_text: content.value ?? null,
              source_code: content.locale ?? null,
              target_text: targetTranslation?.value ?? null,
              target_code: targetLocale,
              digest: content.digest ?? null,
              type: content.type ?? null,
              outdated: targetTranslation?.outdated ?? null,
            });
          }
        }

        if (resources.pageInfo.hasNextPage) {
          const next = await this.getModuleData(
            moduleType,
            targetLocale,
            first,
            resources.pageInfo.endCursor,
          );
          if (Array.isArray(next)) {
            result.push(...next);
          }
        }

        return result;
      } catch (e) {
        if (attempt === MAX_RETRIES - 1) {
          return { error: e instanceof Error ? e.message : String(e) };
        }
      }
    }
    return { error: "请求失败" };
  }

  async registerTranslation(
    resourceId: string,
    locale: string,
    key: string,
    value: string,
    translatableContentDigest: string,
  ) {
    return this.registerTranslationsBatch(resourceId, locale, [
      { key, value, translatableContentDigest },
    ]);
  }

  async registerTranslationsBatch(
    resourceId: string,
    locale: string,
    items: { key: string; value: string; translatableContentDigest: string }[],
  ): Promise<Record<string, unknown>> {
    if (!items.length) {
      return { error: "translations batch is empty" };
    }
    if (items.length > SHOPIFY_MAX_INPUT_ARRAY_SIZE) {
      return {
        error: `batch size ${items.length} exceeds Shopify max ${SHOPIFY_MAX_INPUT_ARRAY_SIZE}`,
      };
    }
    if (items.length > TRANSLATIONS_REGISTER_BATCH_SIZE) {
      return {
        error: `batch size ${items.length} exceeds limit ${TRANSLATIONS_REGISTER_BATCH_SIZE}`,
      };
    }

    const translations = items.map((item) => ({
      locale,
      key: item.key,
      value: item.value,
      translatableContentDigest: item.translatableContentDigest,
    }));

    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      try {
        const data = await this.graphql<{
          translationsRegister: {
            userErrors: { field: string[]; message: string }[];
          };
        }>(TRANSLATIONS_REGISTER_MUTATION, { resourceId, translations });

        if (data.errors?.length) {
          const msg = data.errors[0]?.message ?? "GraphQL error";
          if (attempt < MAX_RETRIES - 1) continue;
          return { error: `GraphQL error: ${msg}`, details: data };
        }

        const reg = data.data?.translationsRegister;
        if (reg?.userErrors?.length) {
          const msg = reg.userErrors
            .map((e) => `${e.field?.join(".") ?? "N/A"}: ${e.message}`)
            .join("; ");
          return { error: `GraphQL user errors: ${msg}`, details: data };
        }

        return { success: true, details: data };
      } catch (e) {
        if (attempt === MAX_RETRIES - 1) {
          return { error: e instanceof Error ? e.message : String(e) };
        }
      }
    }

    return { error: `Failed after ${MAX_RETRIES} attempts` };
  }

  async deleteTranslation(
    resourceId: string,
    locale: string,
    translationKey: string,
  ): Promise<{ success?: boolean; error?: string; details?: unknown }> {
    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      try {
        const data = await this.graphql<{
          translationsRemove: {
            userErrors: { field: string[]; message: string }[];
          };
        }>(TRANSLATIONS_REMOVE_MUTATION, {
          resourceId,
          locales: [locale],
          translationKeys: [translationKey],
        });

        if (data.errors?.length) {
          const msg = data.errors[0]?.message ?? "GraphQL error";
          if (attempt < MAX_RETRIES - 1) continue;
          return { error: `GraphQL error: ${msg}`, details: data, success: false };
        }

        const removed = data.data?.translationsRemove;
        if (removed?.userErrors?.length) {
          const msg = removed.userErrors
            .map((e) => `${e.field?.join(".") ?? "N/A"}: ${e.message}`)
            .join("; ");
          return { error: `GraphQL user errors: ${msg}`, details: data, success: false };
        }

        return { success: true, details: data };
      } catch (e) {
        if (attempt === MAX_RETRIES - 1) {
          return {
            error: e instanceof Error ? e.message : String(e),
            success: false,
          };
        }
      }
    }

    return { error: `Deletion failed after ${MAX_RETRIES} attempts`, success: false };
  }
}
