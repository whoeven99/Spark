import type { UninstallFeedback } from "./parseUninstallFeedback.server";

type PartnerUninstallNode = {
  occurredAt?: string;
  reason?: string | null;
  description?: string | null;
  shop?: { myshopifyDomain?: string | null } | null;
};

type PartnerEventsResponse = {
  data?: {
    app?: {
      events?: {
        edges?: Array<{ node?: PartnerUninstallNode | null } | null>;
        nodes?: Array<PartnerUninstallNode | null>;
      } | null;
    } | null;
  };
  errors?: Array<{ message?: string }>;
};

function normalizeShopDomain(shop: string): string {
  return shop
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/\/.*$/, "");
}

function getPartnerConfig():
  | { orgId: string; token: string; appGid: string; apiVersion: string }
  | null {
  const orgId = process.env.SHOPIFY_PARTNER_ORG_ID?.trim();
  const token =
    process.env.SHOPIFY_PARTNER_API_TOKEN?.trim() ||
    process.env.SHOPIFY_CLI_PARTNERS_TOKEN?.trim();
  const appGid = process.env.SHOPIFY_PARTNER_APP_GID?.trim();
  if (!orgId || !token || !appGid) return null;

  const apiVersion =
    process.env.SHOPIFY_PARTNER_API_VERSION?.trim() || "2025-07";
  return { orgId, token, appGid, apiVersion };
}

const RECENT_UNINSTALLS_QUERY = `#graphql
  query RecentRelationshipUninstalled($appId: ID!) {
    app(id: $appId) {
      events(first: 25, types: [RELATIONSHIP_UNINSTALLED]) {
        edges {
          node {
            __typename
            occurredAt
            ... on RelationshipUninstalled {
              reason
              description
              shop {
                myshopifyDomain
              }
            }
          }
        }
      }
    }
  }
`;

function collectNodes(response: PartnerEventsResponse): PartnerUninstallNode[] {
  const events = response.data?.app?.events;
  if (!events) return [];

  const fromEdges =
    events.edges
      ?.map((edge) => edge?.node)
      .filter((node): node is PartnerUninstallNode => Boolean(node)) ?? [];
  const fromNodes =
    events.nodes?.filter((node): node is PartnerUninstallNode => Boolean(node)) ??
    [];

  return [...fromEdges, ...fromNodes];
}

function isRecentEnough(occurredAt: string | undefined): boolean {
  if (!occurredAt) return true;
  const ts = Date.parse(occurredAt);
  if (Number.isNaN(ts)) return true;
  const maxAgeMs = 15 * 60 * 1000;
  return Date.now() - ts <= maxAgeMs;
}

/**
 * 从 Partner API 拉取最近卸载原因（需配置 SHOPIFY_PARTNER_ORG_ID、SHOPIFY_PARTNER_APP_GID、
 * SHOPIFY_PARTNER_API_TOKEN 或 SHOPIFY_CLI_PARTNERS_TOKEN）。
 * `app/uninstalled` HTTP body 通常不含 reason，卸载反馈主要在 RelationshipUninstalled 事件。
 */
export async function fetchPartnerUninstallFeedback(params: {
  shop: string;
}): Promise<UninstallFeedback | null> {
  const config = getPartnerConfig();
  if (!config) return null;

  const shopDomain = normalizeShopDomain(params.shop);
  const url = `https://partners.shopify.com/${config.orgId}/api/${config.apiVersion}/graphql.json`;

  let response: Response;
  try {
    response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Shopify-Access-Token": config.token,
      },
      body: JSON.stringify({
        query: RECENT_UNINSTALLS_QUERY,
        variables: { appId: config.appGid },
      }),
    });
  } catch (error) {
    console.warn("[CommonEvent] Partner API uninstall feedback fetch failed:", error);
    return null;
  }

  if (!response.ok) {
    console.warn(
      `[CommonEvent] Partner API HTTP ${response.status} when fetching uninstall feedback`,
    );
    return null;
  }

  let body: PartnerEventsResponse;
  try {
    body = (await response.json()) as PartnerEventsResponse;
  } catch {
    return null;
  }

  if (body.errors?.length) {
    console.warn(
      "[CommonEvent] Partner API GraphQL errors:",
      body.errors.map((e) => e.message).join("; "),
    );
    return null;
  }

  const match = collectNodes(body).find((node) => {
    const domain = node.shop?.myshopifyDomain?.trim().toLowerCase();
    if (!domain || domain !== shopDomain) return false;
    return isRecentEnough(node.occurredAt);
  });

  if (!match) return null;

  const reason = match.reason?.trim() || null;
  const description = match.description?.trim() || null;
  if (!reason && !description) return null;

  return {
    reason,
    description,
    source: "partner_api",
  };
}
