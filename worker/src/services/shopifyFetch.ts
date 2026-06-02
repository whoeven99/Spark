/** Maps our module names to Shopify's TranslatableResourceType enum values */
import { shouldIncludeFieldV2 } from "./translationFilter.js";

export const MODULE_TO_SHOPIFY_TYPE: Record<string, string> = {
  PRODUCT: "PRODUCT",
  PRODUCT_OPTION: "PRODUCT_OPTION",
  PRODUCT_OPTION_VALUE: "PRODUCT_OPTION_VALUE",
  COLLECTION: "COLLECTION",
  ONLINE_STORE_THEME: "ONLINE_STORE_THEME",
  ONLINE_STORE_THEME_APP_EMBED: "ONLINE_STORE_THEME_APP_EMBED",
  ONLINE_STORE_THEME_LOCALE_CONTENT: "ONLINE_STORE_THEME_LOCALE_CONTENT",
  ONLINE_STORE_THEME_JSON_TEMPLATE: "ONLINE_STORE_THEME_JSON_TEMPLATE",
  ONLINE_STORE_THEME_SECTION_GROUP: "ONLINE_STORE_THEME_SECTION_GROUP",
  ONLINE_STORE_THEME_SETTINGS_CATEGORY: "ONLINE_STORE_THEME_SETTINGS_CATEGORY",
  ONLINE_STORE_THEME_SETTINGS_DATA_SECTIONS: "ONLINE_STORE_THEME_SETTINGS_DATA_SECTIONS",
  MENU: "MENU",
  LINK: "LINK",
  DELIVERY_METHOD_DEFINITION: "DELIVERY_METHOD_DEFINITION",
  FILTER: "FILTER",
  METAFIELD: "METAFIELD",
  METAOBJECT: "METAOBJECT",
  PAYMENT_GATEWAY: "PAYMENT_GATEWAY",
  SELLING_PLAN: "SELLING_PLAN",
  SELLING_PLAN_GROUP: "SELLING_PLAN_GROUP",
  SHOP: "SHOP",
  ARTICLE: "ARTICLE",
  BLOG: "BLOG",
  PAGE: "PAGE",
};

/** PRODUCT/ARTICLE/PAGE/COLLECTION 先拉 ID 再走 translatableResourcesByIds */
export const ID_BASED_MODULES = ["PRODUCT", "ARTICLE", "PAGE", "COLLECTION"] as const;

/** Init 阶段 Shopify Admin query 筛选（硬编码，对齐 Spring 默认语义） */
export const ID_BASED_MODULE_QUERY: Record<string, string> = {
  PRODUCT: "",
  COLLECTION: "published_status:published",
  PAGE: "published_status:published",
  ARTICLE: "published_status:published",
};

export type TranslatableField = {
  key: string;
  value: string;
  digest: string;
};

export type TranslatableResource = {
  resourceId: string;
  fields: TranslatableField[];
};

export type FetchTranslatableOptions = {
  targetLocale: string;
  isCover: boolean;
  isHandle: boolean;
};

type TranslatableNode = {
  resourceId: string;
  translations: Array<{ key: string; outdated?: boolean | null }>;
  translatableContent: Array<{
    key: string;
    value: string;
    digest: string;
    locale: string;
    type?: string | null;
  }>;
};

const FETCH_PAGE_SIZE = 50;
const ID_FETCH_PAGE_SIZE = 250;
const TRANSLATABLE_RESOURCES_BY_IDS_BATCH = 250;

// Cap a chunk's total translatable text so a chunk blob / in-memory batch never
// gets huge (a single resource is still kept whole, even if it exceeds this).
const MAX_CHUNK_CHARS = Number(process.env.TRANSLATION_MAX_CHUNK_CHARS?.trim()) || 50_000;

const TRANSLATABLE_RESOURCES_QUERY = `
query GetTranslatableResources(
  $resourceType: TranslatableResourceType!
  $first: Int!
  $locale: String!
  $after: String
) {
  translatableResources(resourceType: $resourceType, first: $first, after: $after) {
    edges {
      node {
        resourceId
        translations(locale: $locale) {
          key
          outdated
        }
        translatableContent {
          key
          value
          digest
          locale
          type
        }
      }
    }
    pageInfo {
      hasNextPage
      endCursor
    }
  }
}`;

const TRANSLATABLE_RESOURCES_BY_IDS_QUERY = `
query GetTranslatableResourcesByIds($resourceIds: [ID!]!, $first: Int, $after: String, $locale: String!) {
  translatableResourcesByIds(resourceIds: $resourceIds, first: $first, after: $after) {
    nodes {
      resourceId
      translations(locale: $locale) {
        key
        outdated
      }
      translatableContent {
        key
        value
        digest
        locale
        type
      }
    }
    pageInfo {
      endCursor
      hasNextPage
    }
  }
}`;

const PRODUCTS_IDS_QUERY = `
query GetProducts($query: String, $first: Int, $after: String) {
  products(first: $first, after: $after, query: $query) {
    edges { node { id } }
    pageInfo { endCursor hasNextPage }
  }
}`;

const ARTICLES_IDS_QUERY = `
query GetArticles($query: String, $first: Int, $after: String) {
  articles(first: $first, after: $after, query: $query) {
    edges { node { id } }
    pageInfo { endCursor hasNextPage }
  }
}`;

const PAGES_IDS_QUERY = `
query GetPages($query: String, $first: Int, $after: String) {
  pages(first: $first, after: $after, query: $query) {
    edges { node { id } }
    pageInfo { endCursor hasNextPage }
  }
}`;

const COLLECTIONS_IDS_QUERY = `
query GetCollections($query: String, $first: Int, $after: String) {
  collections(first: $first, after: $after, query: $query) {
    edges { node { id } }
    pageInfo { endCursor hasNextPage }
  }
}`;

const TRANSLATIONS_REGISTER_MUTATION = `
mutation RegisterTranslations($resourceId: ID!, $translations: [TranslationInput!]!) {
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
}`;

const MODULE_ID_QUERY: Record<string, { gql: string; connectionKey: string }> = {
  PRODUCT: { gql: PRODUCTS_IDS_QUERY, connectionKey: "products" },
  ARTICLE: { gql: ARTICLES_IDS_QUERY, connectionKey: "articles" },
  PAGE: { gql: PAGES_IDS_QUERY, connectionKey: "pages" },
  COLLECTION: { gql: COLLECTIONS_IDS_QUERY, connectionKey: "collections" },
};

async function shopifyGraphql(
  shopDomain: string,
  accessToken: string,
  query: string,
  variables: Record<string, unknown>,
): Promise<unknown> {
  const url = `https://${shopDomain}/admin/api/2024-01/graphql.json`;
  const resp = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Shopify-Access-Token": accessToken,
    },
    body: JSON.stringify({ query, variables }),
  });
  if (!resp.ok) {
    throw new Error(`Shopify GraphQL HTTP ${resp.status}: ${await resp.text()}`);
  }
  const json = (await resp.json()) as { data?: unknown; errors?: unknown[] };
  if (json.errors?.length) {
    throw new Error(`Shopify GraphQL errors: ${JSON.stringify(json.errors)}`);
  }
  return json.data;
}

function buildResourceQueryFilter(
  module: string,
  updatedAtAfter?: string,
): string | null {
  const base = ID_BASED_MODULE_QUERY[module] ?? "";
  let query = base.trim();

  if (updatedAtAfter) {
    const iso = updatedAtAfter;
    query = query ? `${query} AND updated_at:>'${iso}'` : `updated_at:>'${iso}'`;
  }

  return query || null;
}

function mapNodeToResource(
  node: TranslatableNode,
  module: string,
  options: FetchTranslatableOptions,
): TranslatableResource | null {
  const translations = node.translations ?? [];
  const fields = node.translatableContent
    .filter((f) =>
      shouldIncludeFieldV2(
        { key: f.key, value: f.value, type: f.type },
        translations,
        {
          module,
          isCover: options.isCover,
          isHandle: options.isHandle,
        },
      ),
    )
    .map((f) => ({ key: f.key, value: f.value, digest: f.digest }));

  if (fields.length === 0) return null;
  return { resourceId: node.resourceId, fields };
}

function resourceChars(r: TranslatableResource): number {
  return r.fields.reduce((sum, f) => sum + (f.value?.length ?? 0), 0);
}

/**
 * Pack resources into chunks bounded by BOTH a max count (`chunkSize`) and a max
 * total char count (`MAX_CHUNK_CHARS`), whichever is hit first. Each resource is
 * kept whole; a single oversized resource gets its own chunk.
 */
function chunkResources(
  resources: TranslatableResource[],
  chunkSize: number,
  maxChars: number = MAX_CHUNK_CHARS,
): TranslatableResource[][] {
  const chunks: TranslatableResource[][] = [];
  let current: TranslatableResource[] = [];
  let currentChars = 0;

  for (const r of resources) {
    const size = resourceChars(r);
    if (current.length > 0 && (current.length >= chunkSize || currentChars + size > maxChars)) {
      chunks.push(current);
      current = [];
      currentChars = 0;
    }
    current.push(r);
    currentChars += size;
  }

  if (current.length > 0) chunks.push(current);
  return chunks;
}

/** 按 config query 分页拉取资源 GID，最多 limit 条。 */
export async function fetchResourceIdsByQuery(
  shopDomain: string,
  accessToken: string,
  module: string,
  limit: number,
  updatedAtAfter?: string,
): Promise<string[]> {
  const spec = MODULE_ID_QUERY[module];
  if (!spec) return [];

  const queryFilter = buildResourceQueryFilter(module, updatedAtAfter);
  const ids: string[] = [];
  let after: string | null = null;

  while (ids.length < limit) {
    const pageSize = Math.min(ID_FETCH_PAGE_SIZE, limit - ids.length);
    const variables: Record<string, unknown> = {
      first: pageSize,
      ...(queryFilter ? { query: queryFilter } : {}),
      ...(after ? { after } : {}),
    };

    const data = (await shopifyGraphql(
      shopDomain,
      accessToken,
      spec.gql,
      variables,
    )) as Record<
      string,
      {
        edges: Array<{ node: { id: string } }>;
        pageInfo: { hasNextPage: boolean; endCursor: string };
      }
    >;

    const connection = data[spec.connectionKey];
    if (!connection?.edges?.length) break;

    for (const edge of connection.edges) {
      if (edge.node?.id) ids.push(edge.node.id);
      if (ids.length >= limit) break;
    }

    if (!connection.pageInfo.hasNextPage || ids.length >= limit) break;
    after = connection.pageInfo.endCursor;
  }

  return ids.slice(0, limit);
}

async function fetchTranslatableResourcesByType(
  shopDomain: string,
  accessToken: string,
  module: string,
  shopifyType: string,
  limitPerType: number,
  options: FetchTranslatableOptions,
): Promise<TranslatableResource[]> {
  const allResources: TranslatableResource[] = [];
  let cursor: string | null = null;
  let fetched = 0;

  while (fetched < limitPerType) {
    const remaining = limitPerType - fetched;
    const pageSize = Math.min(FETCH_PAGE_SIZE, remaining);
    const variables: Record<string, unknown> = {
      resourceType: shopifyType,
      first: pageSize,
      locale: options.targetLocale,
      ...(cursor ? { after: cursor } : {}),
    };

    const data = (await shopifyGraphql(
      shopDomain,
      accessToken,
      TRANSLATABLE_RESOURCES_QUERY,
      variables,
    )) as {
      translatableResources: {
        edges: Array<{ node: TranslatableNode }>;
        pageInfo: { hasNextPage: boolean; endCursor: string };
      };
    };

    const edges = data.translatableResources.edges;
    for (const edge of edges) {
      const resource = mapNodeToResource(edge.node, module, options);
      if (resource) allResources.push(resource);
    }

    fetched += edges.length;
    if (!data.translatableResources.pageInfo.hasNextPage || edges.length === 0) break;
    cursor = data.translatableResources.pageInfo.endCursor;
  }

  return allResources;
}

async function fetchTranslatableResourcesByIds(
  shopDomain: string,
  accessToken: string,
  module: string,
  resourceIds: string[],
  limitPerType: number,
  options: FetchTranslatableOptions,
): Promise<TranslatableResource[]> {
  const allResources: TranslatableResource[] = [];
  const ids = resourceIds.slice(0, limitPerType);

  for (let offset = 0; offset < ids.length && allResources.length < limitPerType; offset += TRANSLATABLE_RESOURCES_BY_IDS_BATCH) {
    const batch = ids.slice(offset, offset + TRANSLATABLE_RESOURCES_BY_IDS_BATCH);
    let after: string | null = null;

    while (allResources.length < limitPerType) {
      const variables: Record<string, unknown> = {
        resourceIds: batch,
        first: TRANSLATABLE_RESOURCES_BY_IDS_BATCH,
        locale: options.targetLocale,
        ...(after ? { after } : {}),
      };

      const data = (await shopifyGraphql(
        shopDomain,
        accessToken,
        TRANSLATABLE_RESOURCES_BY_IDS_QUERY,
        variables,
      )) as {
        translatableResourcesByIds: {
          nodes: TranslatableNode[];
          pageInfo: { hasNextPage: boolean; endCursor: string };
        };
      };

      const nodes = data.translatableResourcesByIds.nodes ?? [];
      for (const node of nodes) {
        if (allResources.length >= limitPerType) break;
        const resource = mapNodeToResource(node, module, options);
        if (resource) allResources.push(resource);
      }

      if (
        !data.translatableResourcesByIds.pageInfo.hasNextPage ||
        nodes.length === 0 ||
        allResources.length >= limitPerType
      ) {
        break;
      }
      after = data.translatableResourcesByIds.pageInfo.endCursor;
    }
  }

  return allResources.slice(0, limitPerType);
}

/** Fetch translatable resources for a module, filtered by isCover/isHandle rules. Returns chunked arrays. */
export async function fetchTranslatableResources(
  shopDomain: string,
  accessToken: string,
  module: string,
  limitPerType: number,
  chunkSize: number,
  options: FetchTranslatableOptions,
  updatedAtAfter?: string,
): Promise<TranslatableResource[][]> {
  const shopifyType = MODULE_TO_SHOPIFY_TYPE[module];
  if (!shopifyType) {
    console.warn(`[shopifyFetch] unsupported module: ${module}`);
    return [];
  }

  let allResources: TranslatableResource[];

  if ((ID_BASED_MODULES as readonly string[]).includes(module)) {
    const resourceIds = await fetchResourceIdsByQuery(
      shopDomain,
      accessToken,
      module,
      limitPerType,
      updatedAtAfter,
    );
    if (resourceIds.length === 0) return [];

    allResources = await fetchTranslatableResourcesByIds(
      shopDomain,
      accessToken,
      module,
      resourceIds,
      limitPerType,
      options,
    );
  } else {
    allResources = await fetchTranslatableResourcesByType(
      shopDomain,
      accessToken,
      module,
      shopifyType,
      limitPerType,
      options,
    );
  }

  return chunkResources(allResources, chunkSize);
}

export type TranslationInput = {
  key: string;
  value: string;
  translatableContentDigest: string;
  locale: string;
};

/** Write translations back to a single Shopify resource. */
export async function registerTranslations(
  shopDomain: string,
  accessToken: string,
  resourceId: string,
  translations: TranslationInput[],
): Promise<{ success: boolean; userErrors: Array<{ field: string; message: string }> }> {
  try {
    const data = (await shopifyGraphql(
      shopDomain,
      accessToken,
      TRANSLATIONS_REGISTER_MUTATION,
      { resourceId, translations },
    )) as {
      translationsRegister: {
        translations: unknown[];
        userErrors: Array<{ field: string; message: string }>;
      };
    };
    const userErrors = data.translationsRegister.userErrors;
    return { success: userErrors.length === 0, userErrors };
  } catch (e) {
    return { success: false, userErrors: [{ field: "", message: String(e) }] };
  }
}

/** @internal Vitest 用：构建 ID 模块 query filter */
export function buildInitModuleQueryFilterForTest(
  module: string,
  updatedAtAfter?: string,
): string | null {
  return buildResourceQueryFilter(module, updatedAtAfter);
}

/** @internal Vitest 用：判断是否 ID 模块 */
export function isIdBasedModuleForTest(module: string): boolean {
  return (ID_BASED_MODULES as readonly string[]).includes(module);
}

/** @internal Vitest 用：size-aware chunk 切分 */
export function chunkResourcesForTest(
  resources: TranslatableResource[],
  chunkSize: number,
  maxChars: number,
): TranslatableResource[][] {
  return chunkResources(resources, chunkSize, maxChars);
}
