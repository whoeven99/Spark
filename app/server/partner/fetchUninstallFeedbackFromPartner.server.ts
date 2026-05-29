const LOG = "[Partner][UninstallFeedback]";
const PARTNER_API_VERSION = "2026-07";
const REQUEST_TIMEOUT_MS = 10_000;
const EVENTS_FIRST = 20;

export type UninstallFeedbackFromPartner = {
  reason: string | null;
  description: string | null;
};

type RelationshipUninstalledNode = {
  reason?: string | null;
  description?: string | null;
  occurredAt?: string | null;
  shop?: {
    id?: string | null;
    myshopifyDomain?: string | null;
    name?: string | null;
  } | null;
};

type AppUninstallEventsResponse = {
  data?: {
    app?: {
      id?: string;
      name?: string;
      events?: {
        edges?: Array<{ node?: RelationshipUninstalledNode | null } | null>;
      };
    } | null;
  };
  errors?: Array<{ message?: string }>;
};

const APP_UNINSTALL_EVENTS_QUERY = `
  query AppUninstallEvents($appId: ID!, $first: Int!) {
    app(id: $appId) {
      id
      name
      events(first: $first, types: [RELATIONSHIP_UNINSTALLED]) {
        edges {
          node {
            __typename
            ... on RelationshipUninstalled {
              occurredAt
              reason
              description
              shop {
                id
                myshopifyDomain
                name
              }
            }
          }
        }
      }
    }
  }
`;

/** Partner API 端点须含组织 ID，见 https://shopify.dev/docs/api/partner */
export function buildPartnerGraphqlUrl(organizationId: string): string {
  const orgId = organizationId.trim();
  return `https://partners.shopify.com/${orgId}/api/${PARTNER_API_VERSION}/graphql.json`;
}

/** Partner App GID：支持 gid://partners/App/123 或纯数字 */
export function resolvePartnerAppGid(): string | null {
  const raw = process.env.SHOPIFY_PARTNER_APP_ID?.trim();
  if (!raw) return null;
  if (raw.startsWith("gid://")) return raw;
  return `gid://partners/App/${raw}`;
}

export function normalizeShopDomain(shop: string): string {
  const trimmed = shop.trim().toLowerCase();
  if (!trimmed) return "";
  const withoutProtocol = trimmed.replace(/^https?:\/\//, "");
  const host = withoutProtocol.split("/")[0] ?? "";
  if (host.endsWith(".myshopify.com")) return host;
  if (host.includes(".")) return host;
  return `${host}.myshopify.com`;
}

function parseOccurredAt(value: string | null | undefined): number {
  if (!value) return 0;
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? ms : 0;
}

function pickLatestForShop(
  edges: Array<{ node?: RelationshipUninstalledNode | null } | null>,
  shopDomain: string,
): UninstallFeedbackFromPartner | null {
  let best: UninstallFeedbackFromPartner | null = null;
  let bestAt = 0;

  for (const edge of edges) {
    const node = edge?.node;
    if (!node) continue;

    const nodeDomain = normalizeShopDomain(node.shop?.myshopifyDomain ?? "");
    if (!nodeDomain || nodeDomain !== shopDomain) continue;

    const occurredAt = parseOccurredAt(node.occurredAt);
    if (occurredAt < bestAt) continue;

    bestAt = occurredAt;
    best = {
      reason: typeof node.reason === "string" ? node.reason.trim() || null : null,
      description:
        typeof node.description === "string"
          ? node.description.trim() || null
          : null,
    };
  }

  return best;
}

async function parsePartnerJsonResponse(
  res: Response,
  shopDomain: string,
): Promise<AppUninstallEventsResponse | null> {
  const bodyText = await res.text();
  try {
    return JSON.parse(bodyText) as AppUninstallEventsResponse;
  } catch {
    console.warn(
      `${LOG} invalid_json shop=${shopDomain} status=${res.status} preview=${bodyText.slice(0, 120)}`,
    );
    return null;
  }
}

export async function fetchUninstallFeedbackFromPartner(
  shop: string,
): Promise<UninstallFeedbackFromPartner | null> {
  const token = process.env.SHOPIFY_PARTNER_API_TOKEN?.trim();
  if (!token) {
    console.info(`${LOG} skipped reason=no_token shop=${shop}`);
    return null;
  }

  const organizationId = process.env.SHOPIFY_PARTNER_ORGANIZATION_ID?.trim();
  if (!organizationId) {
    console.info(`${LOG} skipped reason=no_org_id shop=${shop}`);
    return null;
  }

  const appGid = resolvePartnerAppGid();
  if (!appGid) {
    console.info(`${LOG} skipped reason=no_app_id shop=${shop}`);
    return null;
  }

  const shopDomain = normalizeShopDomain(shop);
  if (!shopDomain) {
    console.warn(`${LOG} skipped reason=invalid_shop shop=${shop}`);
    return null;
  }

  const variables = { appId: appGid, first: EVENTS_FIRST };
  const partnerGraphqlUrl = buildPartnerGraphqlUrl(organizationId);

  console.info(
    `${LOG} request_start shop=${shopDomain} appGid=${appGid} orgId=${organizationId} first=${EVENTS_FIRST} url=${partnerGraphqlUrl}`,
  );
  console.info(`${LOG} request_vars ${JSON.stringify(variables)}`);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const res = await fetch(partnerGraphqlUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Shopify-Access-Token": token,
      },
      body: JSON.stringify({
        query: APP_UNINSTALL_EVENTS_QUERY,
        variables,
      }),
      signal: controller.signal,
    });

    const json = await parsePartnerJsonResponse(res, shopDomain);
    if (!json) return null;

    if (!res.ok) {
      console.warn(
        `${LOG} http_failed shop=${shopDomain} status=${res.status}`,
      );
      return null;
    }

    if (json.errors?.length) {
      console.warn(
        `${LOG} graphql_errors shop=${shopDomain} errors=${json.errors.map((e) => e.message).join("; ")}`,
      );
      return null;
    }

    const app = json.data?.app;
    if (!app) {
      console.warn(`${LOG} app_not_found shop=${shopDomain} appGid=${appGid}`);
      return null;
    }

    const edges = app.events?.edges ?? [];
    console.info(
      `${LOG} response_app shop=${shopDomain} appId=${app.id ?? "(none)"} appName=${app.name ?? "(none)"} edgeCount=${edges.length}`,
    );

    const match = pickLatestForShop(edges, shopDomain);
    console.info(
      `${LOG} done shop=${shopDomain} matched=${Boolean(match)} hasReason=${Boolean(match?.reason)} hasDescription=${Boolean(match?.description)}`,
    );
    return match;
  } catch (error) {
    const isAbort = error instanceof Error && error.name === "AbortError";
    console.warn(
      `${LOG} failed shop=${shopDomain} reason=${isAbort ? "timeout" : "exception"}`,
      error,
    );
    return null;
  } finally {
    clearTimeout(timer);
  }
}
