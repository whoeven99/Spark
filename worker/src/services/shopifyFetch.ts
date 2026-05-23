/** Maps our module names to Shopify's TranslatableResourceType enum values */
export const MODULE_TO_SHOPIFY_TYPE: Record<string, string> = {
  PRODUCT: "PRODUCT",
  COLLECTION: "COLLECTION",
  PAGE: "PAGE",
  ARTICLE: "ARTICLE",
  METAOBJECT: "METAOBJECT",
  ONLINE_STORE_THEME: "ONLINE_STORE_THEME",
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

const FETCH_PAGE_SIZE = 50;

const TRANSLATABLE_RESOURCES_QUERY = `
query GetTranslatableResources($resourceType: TranslatableResourceType!, $first: Int!, $after: String) {
  translatableResources(resourceType: $resourceType, first: $first, after: $after) {
    edges {
      node {
        resourceId
        translatableContent {
          key
          value
          digest
          locale
        }
      }
    }
    pageInfo {
      hasNextPage
      endCursor
    }
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

/** Fetch all translatable resources for a module, up to the limit. Returns chunked arrays. */
export async function fetchTranslatableResources(
  shopDomain: string,
  accessToken: string,
  module: string,
  limitPerType: number,
  chunkSize = 50,
): Promise<TranslatableResource[][]> {
  const shopifyType = MODULE_TO_SHOPIFY_TYPE[module];
  if (!shopifyType) {
    console.warn(`[shopifyFetch] unsupported module: ${module}`);
    return [];
  }

  const allResources: TranslatableResource[] = [];
  let cursor: string | null = null;
  let fetched = 0;

  while (fetched < limitPerType) {
    const remaining = limitPerType - fetched;
    const pageSize = Math.min(FETCH_PAGE_SIZE, remaining);
    const variables: Record<string, unknown> = {
      resourceType: shopifyType,
      first: pageSize,
      ...(cursor ? { after: cursor } : {}),
    };

    const data = (await shopifyGraphql(shopDomain, accessToken, TRANSLATABLE_RESOURCES_QUERY, variables)) as {
      translatableResources: {
        edges: Array<{
          node: {
            resourceId: string;
            translatableContent: Array<{ key: string; value: string; digest: string; locale: string }>;
          };
        }>;
        pageInfo: { hasNextPage: boolean; endCursor: string };
      };
    };

    const edges = data.translatableResources.edges;
    for (const edge of edges) {
      const fields = edge.node.translatableContent.filter((f) => f.value?.trim());
      if (fields.length > 0) {
        allResources.push({
          resourceId: edge.node.resourceId,
          fields: fields.map((f) => ({ key: f.key, value: f.value, digest: f.digest })),
        });
      }
    }

    fetched += edges.length;
    if (!data.translatableResources.pageInfo.hasNextPage || edges.length === 0) break;
    cursor = data.translatableResources.pageInfo.endCursor;
  }

  // Split into chunks
  const chunks: TranslatableResource[][] = [];
  for (let i = 0; i < allResources.length; i += chunkSize) {
    chunks.push(allResources.slice(i, i + chunkSize));
  }
  return chunks;
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
