import type { ShopifyAdminGraphqlClient } from "../ai/skills/shopifyInfo/shopifyInfo.tool";
import {
  GOOGLE_REMARKETING_METAFIELD_KEY,
  normalizeGoogleRemarketingEvents,
  normalizeGoogleRemarketingFieldGroups,
  type GoogleRemarketingStorefrontConfig,
} from "../../lib/googleRemarketing";
import {
  getGoogleAdsCredential,
  setGoogleRemarketingConfig,
  type GoogleRemarketingConfig,
} from "./credentialStore.server";
import {
  buildGoogleAdsHeaders,
  googleAdsApiUrl,
  normalizeCustomerId,
  parseGoogleAdsError,
} from "./googleAdsApi.server";
import { prepareGoogleAdsApiAuth } from "./googleAdsToken.server";
import { getGoogleAdsDeveloperToken } from "./googleOAuth.server";

export interface GoogleAwCandidate {
  tagId: string;
  customerId: string;
  customerName?: string;
  source: "global_site_tag" | "conversion_tracking" | "cross_account_conversion";
  crossAccount: boolean;
}

function collectAwIds(value: unknown): string[] {
  if (typeof value !== "string" && typeof value !== "number") return [];
  const text = String(value);
  const matches = text.match(/AW-\d+/g) ?? (/^\d+$/.test(text) ? [`AW-${text}`] : []);
  return [...new Set(matches)];
}

export function parseGoogleAwCandidates(
  rows: Array<Record<string, unknown>>,
  customerId: string,
): GoogleAwCandidate[] {
  const candidates: GoogleAwCandidate[] = [];
  for (const row of rows) {
    const customer = (row.customer ?? {}) as Record<string, unknown>;
    const remarketing = (customer.remarketingSetting ??
      customer.remarketing_setting ??
      {}) as Record<string, unknown>;
    const conversion = (customer.conversionTrackingSetting ??
      customer.conversion_tracking_setting ??
      {}) as Record<string, unknown>;
    const name = String(customer.descriptiveName ?? customer.descriptive_name ?? "").trim();
    const values: Array<{
      value: unknown;
      source: GoogleAwCandidate["source"];
      crossAccount: boolean;
    }> = [
      {
        value:
          remarketing.googleGlobalSiteTag ??
          remarketing.google_global_site_tag,
        source: "global_site_tag",
        crossAccount: false,
      },
      {
        value:
          conversion.conversionTrackingId ??
          conversion.conversion_tracking_id,
        source: "conversion_tracking",
        crossAccount: false,
      },
      {
        value:
          conversion.crossAccountConversionTrackingId ??
          conversion.cross_account_conversion_tracking_id,
        source: "cross_account_conversion",
        crossAccount: true,
      },
    ];
    for (const candidate of values) {
      for (const tagId of collectAwIds(candidate.value)) {
        candidates.push({
          tagId,
          customerId,
          customerName: name || undefined,
          source: candidate.source,
          crossAccount: candidate.crossAccount,
        });
      }
    }
  }
  return [...new Map(candidates.map((item) => [item.tagId, item])).values()];
}

export async function discoverGoogleAwCandidates(
  shop: string,
): Promise<GoogleAwCandidate[]> {
  const auth = await prepareGoogleAdsApiAuth(shop);
  const developerToken = getGoogleAdsDeveloperToken();
  const customerId = normalizeCustomerId(auth.customerId);
  const response = await fetch(
    googleAdsApiUrl(`/customers/${customerId}/googleAds:searchStream`),
    {
      method: "POST",
      headers: {
        ...buildGoogleAdsHeaders({
          accessToken: auth.accessToken,
          developerToken,
          loginCustomerId: auth.loginCustomerId,
        }),
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        query: `SELECT customer.id, customer.descriptive_name,
          customer.remarketing_setting.google_global_site_tag,
          customer.conversion_tracking_setting.conversion_tracking_id,
          customer.conversion_tracking_setting.cross_account_conversion_tracking_id,
          customer.conversion_tracking_setting.conversion_tracking_status
          FROM customer LIMIT 1`,
      }),
    },
  );
  const text = await response.text();
  if (!response.ok) throw new Error(parseGoogleAdsError(text, response.status));
  const parsed = JSON.parse(text) as
    | { results?: Array<Record<string, unknown>> }
    | Array<{ results?: Array<Record<string, unknown>> }>;
  const batches = Array.isArray(parsed) ? parsed : [parsed];
  return parseGoogleAwCandidates(
    batches.flatMap((batch) => batch.results ?? []),
    customerId,
  );
}

async function syncStorefrontMetafield(params: {
  admin: ShopifyAdminGraphqlClient;
  config: GoogleRemarketingStorefrontConfig;
}): Promise<void> {
  const shopResponse = await params.admin.graphql(`#graphql
    query SparkGoogleRemarketingShopId {
      shop { id }
    }
  `);
  const shopJson = (await shopResponse.json()) as {
    data?: { shop?: { id?: string } };
    errors?: Array<{ message?: string }>;
  };
  const ownerId = shopJson.data?.shop?.id;
  if (!ownerId) throw new Error(shopJson.errors?.[0]?.message ?? "无法读取 Shop ID");

  const response = await params.admin.graphql(
    `#graphql
      mutation SparkGoogleRemarketingMetafieldSet($metafields: [MetafieldsSetInput!]!) {
        metafieldsSet(metafields: $metafields) {
          metafields { id key namespace }
          userErrors { field message code }
        }
      }
    `,
    {
      variables: {
        metafields: [
          {
            ownerId,
            key: GOOGLE_REMARKETING_METAFIELD_KEY,
            type: "json",
            value: JSON.stringify(params.config),
          },
        ],
      },
    },
  );
  const json = (await response.json()) as {
    data?: { metafieldsSet?: { userErrors?: Array<{ message?: string }> } };
    errors?: Array<{ message?: string }>;
  };
  const error =
    json.data?.metafieldsSet?.userErrors?.[0]?.message ??
    json.errors?.[0]?.message;
  if (error) throw new Error(error);
}

export async function saveGoogleRemarketingConfig(params: {
  shop: string;
  admin: ShopifyAdminGraphqlClient;
  tagId: string;
  source: "auto" | "manual";
  enabledEvents?: unknown;
  enabledFieldGroups?: unknown;
  customPixelConfirmed?: boolean;
}): Promise<{ config: GoogleRemarketingConfig; partial: boolean }> {
  const tagId = params.tagId.trim().toUpperCase();
  if (!/^AW-\d+$/.test(tagId)) throw new Error("AW 标签必须符合 AW-数字 格式");
  const existing = await getGoogleAdsCredential(params.shop);
  if (!existing) throw new Error("Google Ads 账户未连接");
  const now = new Date().toISOString();
  const config: GoogleRemarketingConfig = {
    tagId,
    source: params.source,
    confirmedAt: now,
    enabledEvents: normalizeGoogleRemarketingEvents(params.enabledEvents),
    enabledFieldGroups: normalizeGoogleRemarketingFieldGroups(
      params.enabledFieldGroups,
    ),
    customPixelConfirmedAt: params.customPixelConfirmed
      ? now
      : existing.remarketing?.customPixelConfirmedAt,
  };
  await setGoogleRemarketingConfig(params.shop, config);
  try {
    await syncStorefrontMetafield({
      admin: params.admin,
      config: {
        tagId,
        enabledEvents: normalizeGoogleRemarketingEvents(config.enabledEvents),
        enabledFieldGroups: normalizeGoogleRemarketingFieldGroups(
          config.enabledFieldGroups,
        ),
      },
    });
    config.metafieldSync = { status: "synced", updatedAt: now };
    await setGoogleRemarketingConfig(params.shop, config);
    return { config, partial: false };
  } catch (error) {
    config.metafieldSync = {
      status: "failed",
      updatedAt: now,
      error: error instanceof Error ? error.message : String(error),
    };
    await setGoogleRemarketingConfig(params.shop, config);
    return { config, partial: true };
  }
}
