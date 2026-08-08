import {
  buildGooglePixelConversionActionName,
  GOOGLE_PIXEL_EVENT_ADS_CATEGORY,
  type GooglePixelEventConversions,
  type GooglePixelSetupEvent,
} from "../../lib/googlePixelEvents";
import {
  buildGoogleAdsHeaders,
  googleAdsApiUrl,
  normalizeCustomerId,
  parseGoogleAdsError,
} from "./googleAdsApi.server";
import { prepareGoogleAdsApiAuth } from "./googleAdsToken.server";
import { getGoogleAdsDeveloperToken } from "./googleOAuth.server";
import { discoverGoogleAwCandidates } from "./googleRemarketing.server";

type ConversionActionRow = {
  conversionAction?: {
    resourceName?: string;
    id?: string;
    name?: string;
    category?: string;
    status?: string;
    tagSnippets?: Array<{
      eventSnippet?: string;
      globalSiteTag?: string;
    }>;
    tag_snippets?: Array<{
      event_snippet?: string;
      global_site_tag?: string;
    }>;
  };
};

export function parseConversionLabelFromSnippets(
  snippets: ConversionActionRow["conversionAction"],
): string {
  const items = snippets?.tagSnippets ?? snippets?.tag_snippets ?? [];
  for (const snippet of items) {
    const eventSnippet =
      ("eventSnippet" in snippet ? snippet.eventSnippet : undefined) ??
      ("event_snippet" in snippet ? snippet.event_snippet : undefined) ??
      "";
    const match = eventSnippet.match(/send_to['"]\s*:\s*['"]AW-\d+\/([^'"]+)['"]/i);
    if (match?.[1]) return match[1].trim();
  }
  return "";
}

async function searchConversionActions(params: {
  accessToken: string;
  developerToken: string;
  customerId: string;
  loginCustomerId: string;
}): Promise<ConversionActionRow[]> {
  const customerId = normalizeCustomerId(params.customerId);
  const response = await fetch(
    googleAdsApiUrl(`/customers/${customerId}/googleAds:searchStream`),
    {
      method: "POST",
      headers: {
        ...buildGoogleAdsHeaders({
          accessToken: params.accessToken,
          developerToken: params.developerToken,
          loginCustomerId: params.loginCustomerId,
        }),
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        query: `
          SELECT
            conversion_action.resource_name,
            conversion_action.id,
            conversion_action.name,
            conversion_action.category,
            conversion_action.status,
            conversion_action.tag_snippets
          FROM conversion_action
          WHERE conversion_action.status != 'REMOVED'
        `,
      }),
    },
  );
  const text = await response.text();
  if (!response.ok) throw new Error(parseGoogleAdsError(text, response.status));
  const parsed = JSON.parse(text) as
    | { results?: ConversionActionRow[] }
    | Array<{ results?: ConversionActionRow[] }>;
  const batches = Array.isArray(parsed) ? parsed : [parsed];
  return batches.flatMap((batch) => batch.results ?? []);
}

async function createConversionAction(params: {
  accessToken: string;
  developerToken: string;
  customerId: string;
  loginCustomerId: string;
  name: string;
  category: string;
}): Promise<ConversionActionRow["conversionAction"]> {
  const customerId = normalizeCustomerId(params.customerId);
  const response = await fetch(
    googleAdsApiUrl(`/customers/${customerId}/conversionActions:mutate`),
    {
      method: "POST",
      headers: {
        ...buildGoogleAdsHeaders({
          accessToken: params.accessToken,
          developerToken: params.developerToken,
          loginCustomerId: params.loginCustomerId,
        }),
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        operations: [
          {
            create: {
              name: params.name,
              type: "WEBPAGE",
              category: params.category,
              status: "ENABLED",
              countingType: "ONE_PER_CLICK",
              clickThroughLookbackWindowDays: 30,
              viewThroughLookbackWindowDays: 1,
            },
          },
        ],
      }),
    },
  );
  const text = await response.text();
  if (!response.ok) throw new Error(parseGoogleAdsError(text, response.status));
  const json = JSON.parse(text) as {
    results?: Array<{ resourceName?: string }>;
  };
  const resourceName = json.results?.[0]?.resourceName;
  if (!resourceName) throw new Error("创建转化操作后未返回 resource name");

  const rows = await searchConversionActions(params);
  const created = rows.find(
    (row) => row.conversionAction?.resourceName === resourceName,
  )?.conversionAction;
  if (!created) throw new Error(`无法读取新创建的转化操作：${resourceName}`);
  return created;
}

function findExistingConversionAction(
  rows: ConversionActionRow[],
  name: string,
): ConversionActionRow["conversionAction"] | undefined {
  const normalizedName = name.trim().toLowerCase();
  return rows
    .map((row) => row.conversionAction)
    .find((action) => action?.name?.trim().toLowerCase() === normalizedName);
}

export async function ensureGooglePixelConversionActions(params: {
  shop: string;
  pixelName: string;
  selectedEvents: GooglePixelSetupEvent[];
  labelOf: (event: GooglePixelSetupEvent) => string;
}): Promise<{ tagId: string; eventConversions: GooglePixelEventConversions }> {
  const auth = await prepareGoogleAdsApiAuth(params.shop);
  const developerToken = getGoogleAdsDeveloperToken();
  const candidates = await discoverGoogleAwCandidates(params.shop);
  const tagId = candidates[0]?.tagId;
  if (!tagId) {
    throw new Error("无法从 Google Ads 账户发现 Conversion ID（AW 标签），请确认账户已启用转化跟踪");
  }

  const apiParams = {
    accessToken: auth.accessToken,
    developerToken,
    customerId: auth.customerId,
    loginCustomerId: auth.loginCustomerId,
  };
  const existingRows = await searchConversionActions(apiParams);
  const eventConversions: GooglePixelEventConversions = {};

  for (const eventKey of params.selectedEvents) {
    const eventDisplayName = params.labelOf(eventKey);
    const name = buildGooglePixelConversionActionName({
      pixelName: params.pixelName,
      eventKey,
      eventDisplayName,
    });
    const category = GOOGLE_PIXEL_EVENT_ADS_CATEGORY[eventKey];
    let action = findExistingConversionAction(existingRows, name);

    if (!action) {
      action = await createConversionAction({
        ...apiParams,
        name,
        category,
      });
    }
    if (!action) {
      throw new Error(`无法创建或读取转化操作：${name}`);
    }

    const label = parseConversionLabelFromSnippets(action);
    if (!label) {
      throw new Error(`转化操作「${name}」未返回 Conversion Label，请在 Google Ads 后台检查`);
    }

    eventConversions[eventKey] = {
      label,
      conversionActionId: action.id ? String(action.id) : undefined,
      name: action.name ?? name,
    };
  }

  return { tagId, eventConversions };
}

export function toStorefrontEventLabels(
  eventConversions: GooglePixelEventConversions | undefined,
  fallbackLabel?: string,
): Record<string, string> {
  const out: Record<string, string> = {};
  if (!eventConversions) {
    if (fallbackLabel?.trim()) {
      for (const event of ["page_view", "add_to_cart", "begin_checkout", "add_payment_info"]) {
        out[event] = fallbackLabel.trim();
      }
    }
    return out;
  }
  for (const [event, entry] of Object.entries(eventConversions)) {
    if (!entry || entry.disabled || !entry.label) continue;
    out[event] = entry.label;
  }
  return out;
}
