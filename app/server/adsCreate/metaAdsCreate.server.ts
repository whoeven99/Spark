/**
 * Meta (Facebook) Marketing API — 广告创建服务。
 * 依赖 MetaAdsCredential（meta_ads 平台），需连接广告账户后方可使用。
 *
 * API 参考：https://developers.facebook.com/docs/marketing-api/reference/
 */

import type { MetaAdFormData } from "../../routes/component/adsCreate/types";

const META_API_VERSION = "v19.0";
const GRAPH_BASE = "https://graph.facebook.com";

type MetaApiError = { message?: string; type?: string; code?: number };

function graphUrl(path: string): string {
  return `${GRAPH_BASE}/${META_API_VERSION}${path}`;
}

async function metaPost<T = Record<string, unknown>>(
  path: string,
  accessToken: string,
  body: Record<string, unknown>,
): Promise<T> {
  const url = graphUrl(path);
  const resp = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ access_token: accessToken, ...body }),
  });
  const text = await resp.text();
  let json: { error?: MetaApiError } & Record<string, unknown>;
  try {
    json = JSON.parse(text) as typeof json;
  } catch {
    throw new Error(`Meta API HTTP ${resp.status}: ${text.slice(0, 300)}`);
  }
  if (!resp.ok || json.error) {
    throw new Error(json.error?.message ?? `Meta API HTTP ${resp.status}`);
  }
  return json as T;
}

/** 将广告账户 ID 规范化为 act_ 前缀格式。 */
function normalizeAdAccountId(id: string): string {
  const stripped = id.replace(/^act_/, "");
  return `act_${stripped}`;
}

export interface MetaCreateResult {
  campaignId: string;
  adSetId: string;
  adId: string;
}

/**
 * 依次创建：Campaign → Ad Set → Ad Creative → Ad。
 * 任一步骤失败即中止并抛出错误。
 */
export async function createMetaAd(params: {
  accessToken: string;
  adAccountId: string;
  form: MetaAdFormData;
}): Promise<MetaCreateResult> {
  const { accessToken, form } = params;
  const accountPath = `/${normalizeAdAccountId(params.adAccountId)}`;
  // pageId 可能因旧前端或未选主页而为 undefined，不可直接 .trim()
  const pageId = typeof form.pageId === "string" ? form.pageId.trim() : "";
  if (!pageId) {
    throw new Error("请选择用于投放的 Facebook 主页（Page）");
  }

  // ── Step 1: Campaign ─────────────────────────────────────────────────────
  const campaignBody: Record<string, unknown> = {
    name: form.campaignName,
    objective: form.campaignObjective,
    status: form.campaignStatus,
    special_ad_categories: [],
  };
  // 按日预算（单位：分），Meta API 使用分为单位。
  const dailyBudgetRaw =
    typeof form.campaignDailyBudget === "string" ? form.campaignDailyBudget.trim() : "";
  if (dailyBudgetRaw) {
    campaignBody.daily_budget = Math.round(parseFloat(dailyBudgetRaw) * 100);
  }

  const campaignResp = await metaPost<{ id: string }>(
    `${accountPath}/campaigns`,
    accessToken,
    campaignBody,
  );
  const campaignId = campaignResp.id;

  // ── Step 2: Ad Set ───────────────────────────────────────────────────────
  const targeting: Record<string, unknown> = {
    age_min: parseInt(form.ageMin || "18", 10),
    age_max: parseInt(form.ageMax || "65", 10),
  };
  if (form.gender !== "ALL") {
    targeting.genders = form.gender === "MALE" ? [1] : [2];
  }
  const geoCountries =
    typeof form.geoCountries === "string" ? form.geoCountries : "";
  const countries = geoCountries
    .split(/[\s,;]+/)
    .map((c) => c.trim().toUpperCase())
    .filter(Boolean);
  if (countries.length > 0) {
    targeting.geo_locations = { countries };
  }

  const adSetBody: Record<string, unknown> = {
    name: form.adSetName,
    campaign_id: campaignId,
    billing_event: "IMPRESSIONS",
    optimization_goal: "REACH",
    targeting,
    status: form.campaignStatus,
    start_time: form.adSetStartTime || new Date().toISOString(),
  };
  if (form.adSetEndTime) {
    adSetBody.end_time = form.adSetEndTime;
  }
  // 若 Campaign 未设置预算，则 Ad Set 必须设置。
  if (!dailyBudgetRaw) {
    adSetBody.daily_budget = 100; // 默认 $1.00
  }

  const adSetResp = await metaPost<{ id: string }>(
    `${accountPath}/adsets`,
    accessToken,
    adSetBody,
  );
  const adSetId = adSetResp.id;

  // ── Step 3: Ad Creative ───────────────────────────────────────────────────
  const creativeBody: Record<string, unknown> = {
    name: `${form.adName}_creative`,
    object_story_spec: {
      page_id: pageId,
      link_data: {
        message: form.adBody,
        link: form.adLinkUrl,
        name: form.adHeadline,
        call_to_action: {
          type: form.adCallToAction,
          value: { link: form.adLinkUrl },
        },
        ...(form.adImageUrl ? { picture: form.adImageUrl } : {}),
      },
    },
  };

  const creativeResp = await metaPost<{ id: string }>(
    `${accountPath}/adcreatives`,
    accessToken,
    creativeBody,
  );
  const creativeId = creativeResp.id;

  // ── Step 4: Ad ────────────────────────────────────────────────────────────
  const adResp = await metaPost<{ id: string }>(`${accountPath}/ads`, accessToken, {
    name: form.adName,
    adset_id: adSetId,
    creative: { creative_id: creativeId },
    status: form.campaignStatus,
  });

  return { campaignId, adSetId, adId: adResp.id };
}
