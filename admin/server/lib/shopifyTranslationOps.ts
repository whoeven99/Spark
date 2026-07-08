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

export const METAFIELD_RESOURCE_MODULES = {
  PRODUCT: { label: "Product", rootField: "products" },
  COLLECTION: { label: "Collection", rootField: "collections" },
  PAGE: { label: "Page", rootField: "pages" },
  BLOG: { label: "Blog", rootField: "blogs" },
  ARTICLE: { label: "Article", rootField: "articles" },
} as const;

export type MetafieldModuleKey = keyof typeof METAFIELD_RESOURCE_MODULES;

export type AltImageRow = {
  product_id: string;
  product_title: string;
  product_status: string;
  image_id: string | null;
  image_url: string | null;
  image_altText: string | null;
  target_text?: string;
  target?: string;
};

export type AltStreamChunk =
  | { type: "progress"; count: number }
  | { type: "done"; data: AltImageRow[]; count: number }
  | { type: "error"; error: string };

export type MetafieldRow = {
  resource_type: string;
  resource_id: string;
  metafield_id: string;
  namespace: string;
  key: string;
  type: string;
  value: string;
  translation_locale: string;
  translation_value: string;
  translation_outdated: boolean | null;
  resource_module?: string;
};

export type MetafieldNamespaceSummaryRow = {
  resource_module: string;
  namespace: string;
  count: number;
};

type MetafieldNode = {
  id: string;
  namespace: string;
  key: string;
  type: string;
  value: string;
  translations: { locale: string; value: string; outdated: boolean }[];
};

type MetafieldsConnection = {
  edges: { node: MetafieldNode }[];
  pageInfo: { hasNextPage: boolean; endCursor: string | null };
};

type ResourceMetafieldsConnection = {
  edges: { node: { id: string; metafields: MetafieldsConnection } }[];
  pageInfo: { hasNextPage: boolean; endCursor: string | null };
};

type ProductsPagePayload = {
  products: {
    edges: {
      node: {
        id: string;
        title: string;
        status: string;
        images: {
          edges: { node: { id: string; url: string; altText: string | null } }[];
          pageInfo: { hasNextPage: boolean; endCursor: string | null };
        };
      };
    }[];
    pageInfo: { hasNextPage: boolean; endCursor: string | null };
  };
};

function emptyMetafieldsConnection(): MetafieldsConnection {
  return { edges: [], pageInfo: { hasNextPage: false, endCursor: null } };
}

export function summarizeMetafieldNamespaces(rows: MetafieldRow[]): MetafieldNamespaceSummaryRow[] {
  const counts = new Map<string, number>();
  for (const row of rows) {
    const module = row.resource_module ?? row.resource_type;
    const key = `${module}\0${row.namespace}`;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }

  return [...counts.entries()]
    .map(([key, count]) => {
      const [resource_module, namespace] = key.split("\0");
      return { resource_module, namespace, count };
    })
    .sort((a, b) => {
      if (a.resource_module !== b.resource_module) {
        return a.resource_module.localeCompare(b.resource_module);
      }
      if (b.count !== a.count) return b.count - a.count;
      return a.namespace.localeCompare(b.namespace);
    });
}

export function metafieldSummaryToCsv(rows: MetafieldNamespaceSummaryRow[]): string {
  const headers = ["resource_module", "namespace", "count"];
  const escape = (v: unknown) => {
    const s = v == null ? "" : String(v);
    if (s.includes(",") || s.includes('"') || s.includes("\n")) {
      return `"${s.replace(/"/g, '""')}"`;
    }
    return s;
  };
  const lines = [
    headers.join(","),
    ...rows.map((row) => headers.map((h) => escape(row[h as keyof MetafieldNamespaceSummaryRow])).join(",")),
  ];
  return `\uFEFF${lines.join("\n")}`;
}

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

  async *streamAllProductsWithImages(options?: {
    queryString?: string | null;
    sortKey?: string | null;
    reverse?: boolean;
    productFirst?: number;
    imageFirst?: number;
  }): AsyncGenerator<AltStreamChunk> {
    const {
      queryString = null,
      sortKey = null,
      reverse = false,
      productFirst = 100,
      imageFirst = 250,
    } = options ?? {};

    const productsQuery = `
      query Products($first: Int!, $after: String, $query: String, $sortKey: ProductSortKeys, $reverse: Boolean) {
        products(first: $first, after: $after, query: $query, sortKey: $sortKey, reverse: $reverse) {
          edges {
            node {
              id
              title
              status
              images(first: 20) {
                edges {
                  node {
                    id
                    url
                    altText
                  }
                }
                pageInfo {
                  hasNextPage
                  endCursor
                }
              }
            }
          }
          pageInfo {
            hasNextPage
            endCursor
          }
        }
      }
    `;

    const imageQuery = `
      query ProductImages($id: ID!, $first: Int!, $after: String) {
        product(id: $id) {
          images(first: $first, after: $after) {
            edges {
              node {
                id
                url
                altText
              }
            }
            pageInfo {
              hasNextPage
              endCursor
            }
          }
        }
      }
    `;

    const resultRows: AltImageRow[] = [];
    let cursor: string | null = null;

    while (true) {
      const data: GraphqlResponse<ProductsPagePayload> = await this.graphql<ProductsPagePayload>(
        productsQuery,
        {
          first: productFirst,
          after: cursor,
          query: queryString,
          sortKey: sortKey || null,
          reverse: reverse || null,
        },
      );

      if (data.errors?.length) {
        yield { type: "error", error: data.errors[0]?.message ?? "GraphQL error" };
        return;
      }

      const products: ProductsPagePayload["products"] | undefined = data.data?.products;
      if (!products) {
        yield { type: "error", error: "返回数据格式错误" };
        return;
      }

      for (const edge of products.edges ?? []) {
        const node = edge.node;
        const pid = node.id;
        const collectedImages: { id: string; url: string; altText: string | null }[] = [];

        for (const ie of node.images?.edges ?? []) {
          collectedImages.push({
            id: ie.node.id,
            url: ie.node.url,
            altText: ie.node.altText,
          });
        }

        let imgPageInfo = node.images?.pageInfo;
        if (imgPageInfo?.hasNextPage) {
          let imgCursor = imgPageInfo.endCursor;
          while (imgCursor) {
            const imgData = await this.graphql<{
              product: {
                images: {
                  edges: { node: { id: string; url: string; altText: string | null } }[];
                  pageInfo: { hasNextPage: boolean; endCursor: string | null };
                };
              } | null;
            }>(imageQuery, { id: pid, first: imageFirst, after: imgCursor });

            if (imgData.errors?.length) break;

            const imgs = imgData.data?.product?.images;
            if (!imgs) break;

            for (const ie2 of imgs.edges ?? []) {
              collectedImages.push({
                id: ie2.node.id,
                url: ie2.node.url,
                altText: ie2.node.altText,
              });
            }

            if (imgs.pageInfo.hasNextPage) {
              imgCursor = imgs.pageInfo.endCursor;
            } else {
              break;
            }
          }
        }

        if (collectedImages.length) {
          for (const im of collectedImages) {
            resultRows.push({
              product_id: pid,
              product_title: node.title,
              product_status: node.status,
              image_id: im.id,
              image_url: im.url,
              image_altText: im.altText,
            });
          }
        } else {
          resultRows.push({
            product_id: pid,
            product_title: node.title,
            product_status: node.status,
            image_id: null,
            image_url: null,
            image_altText: null,
          });
        }
      }

      yield { type: "progress", count: resultRows.length };

      if (products.pageInfo.hasNextPage) {
        cursor = products.pageInfo.endCursor;
      } else {
        break;
      }
    }

    yield { type: "done", data: resultRows, count: resultRows.length };
  }

  async fetchMetafieldsByOwnerId(
    ownerId: string,
    locale: string,
    metafieldFirst = 100,
    metafieldAfter: string | null = null,
  ) {
    const ownerQuery = `
      query OwnerMetafields($ownerId: ID!, $metafieldFirst: Int!, $metafieldAfter: String, $locale: String!) {
        node(id: $ownerId) {
          ... on HasMetafields {
            metafields(first: $metafieldFirst, after: $metafieldAfter) {
              edges {
                node {
                  id
                  namespace
                  key
                  type
                  value
                  translations(locale: $locale) {
                    locale
                    value
                    outdated
                  }
                }
              }
              pageInfo {
                hasNextPage
                endCursor
              }
            }
          }
        }
      }
    `;

    const data = await this.graphql<{
      node: {
        metafields: MetafieldsConnection;
      } | null;
    }>(ownerQuery, {
      ownerId,
      metafieldFirst,
      metafieldAfter,
      locale,
    });

    if (data.errors?.length) {
      throw new Error(data.errors[0]?.message ?? "GraphQL error");
    }

    return data.data?.node?.metafields ?? emptyMetafieldsConnection();
  }

  async fetchMetafieldsForResource(
    rootField: string,
    locale: string,
    resourceFirst = 100,
    metafieldFirst = 100,
  ): Promise<MetafieldRow[]> {
    const query = `
      query ResourceMetafields($resourceFirst: Int!, $resourceAfter: String, $metafieldFirst: Int!, $metafieldAfter: String, $locale: String!) {
        ${rootField}(first: $resourceFirst, after: $resourceAfter) {
          edges {
            node {
              id
              metafields(first: $metafieldFirst, after: $metafieldAfter) {
                edges {
                  node {
                    id
                    namespace
                    key
                    type
                    value
                    translations(locale: $locale) {
                      locale
                      value
                      outdated
                    }
                  }
                }
                pageInfo {
                  hasNextPage
                  endCursor
                }
              }
            }
          }
          pageInfo {
            hasNextPage
            endCursor
          }
        }
      }
    `;

    const allRows: MetafieldRow[] = [];
    let resourceAfter: string | null = null;

    const appendMetafieldRows = (
      resourceId: string,
      currentMetafields: MetafieldsConnection,
    ) => {
      for (const mfEdge of currentMetafields.edges ?? []) {
        const mfNode = mfEdge.node;
        const trans = mfNode.translations?.[0];
        allRows.push({
          resource_type: rootField,
          resource_id: resourceId,
          metafield_id: mfNode.id ?? "",
          namespace: mfNode.namespace ?? "",
          key: mfNode.key ?? "",
          type: mfNode.type ?? "",
          value: mfNode.value ?? "",
          translation_locale: trans?.locale ?? "",
          translation_value: trans?.value ?? "",
          translation_outdated: trans?.outdated ?? null,
        });
      }
    };

    while (true) {
      const data: GraphqlResponse<Record<string, ResourceMetafieldsConnection>> =
        await this.graphql<Record<string, ResourceMetafieldsConnection>>(query, {
          resourceFirst: resourceFirst,
          resourceAfter,
          metafieldFirst,
          metafieldAfter: null,
          locale,
        });

      if (data.errors?.length) {
        throw new Error(data.errors[0]?.message ?? "GraphQL error");
      }

      const resourceData: ResourceMetafieldsConnection | undefined = data.data?.[rootField];
      if (!resourceData) {
        throw new Error("返回数据格式错误");
      }

      for (const edge of resourceData.edges ?? []) {
        const node = edge.node;
        const resourceId = node.id;
        const metafieldsData = node.metafields ?? emptyMetafieldsConnection();

        appendMetafieldRows(resourceId, metafieldsData);

        let mfPageInfo = metafieldsData.pageInfo;
        let mfAfter = mfPageInfo.endCursor;
        while (mfPageInfo.hasNextPage && mfAfter) {
          const currentMetafields = await this.fetchMetafieldsByOwnerId(
            resourceId,
            locale,
            metafieldFirst,
            mfAfter,
          );
          appendMetafieldRows(resourceId, currentMetafields);
          mfPageInfo = currentMetafields.pageInfo;
          mfAfter = mfPageInfo.endCursor;
        }
      }

      if (resourceData.pageInfo.hasNextPage) {
        resourceAfter = resourceData.pageInfo.endCursor;
      } else {
        break;
      }
    }

    return allRows;
  }
}
