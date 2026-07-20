/**
 * Meta (Facebook) Marketing API — 广告创建服务。
 * 依赖 MetaAdsCredential（meta_ads 平台），需连接广告账户后方可使用。
 *
 * API 参考：https://developers.facebook.com/docs/marketing-api/reference/
 */

import type {
  MetaAdFormData,
  MetaCampaignObjective,
} from "../../routes/component/adsCreate/types";

const META_API_VERSION = "v19.0";
const GRAPH_BASE = "https://graph.facebook.com";

type MetaApiError = {
  message?: string;
  type?: string;
  code?: number;
  error_subcode?: number;
  error_user_title?: string;
  error_user_msg?: string;
  error_data?: string | Record<string, unknown>;
  fbtrace_id?: string;
};

type DeliveryConfig = {
  optimizationGoal: string;
  billingEvent: string;
  destinationType?: string;
  /** 需要写入 ad set 的 promoted_object */
  promotedObject?: Record<string, string>;
};

function graphUrl(path: string): string {
  return `${GRAPH_BASE}/${META_API_VERSION}${path}`;
}

/** Meta Marketing API 对嵌套字段要求 form-urlencoded + JSON 字符串。 */
function encodeMetaBody(
  accessToken: string,
  body: Record<string, unknown>,
): URLSearchParams {
  const params = new URLSearchParams();
  params.set("access_token", accessToken);
  for (const [key, value] of Object.entries(body)) {
    if (value === undefined || value === null) continue;
    if (typeof value === "object") {
      params.set(key, JSON.stringify(value));
    } else {
      params.set(key, String(value));
    }
  }
  return params;
}

function formatMetaError(error: MetaApiError | undefined, fallback: string): string {
  if (!error) return fallback;
  const parts = [
    error.error_user_title,
    error.error_user_msg,
    error.message && error.message !== "Invalid parameter" ? error.message : null,
    error.message === "Invalid parameter" ? "Invalid parameter" : null,
  ].filter(Boolean);
  const unique = [...new Set(parts)];
  let msg = unique.join(" — ") || fallback;

  if (typeof error.error_data === "string" && error.error_data.trim()) {
    try {
      const data = JSON.parse(error.error_data) as { blame_field_specs?: unknown };
      if (data.blame_field_specs) {
        msg += `（字段：${JSON.stringify(data.blame_field_specs)}）`;
      }
    } catch {
      // ignore
    }
  }
  return msg;
}

async function metaPost<T = Record<string, unknown>>(
  path: string,
  accessToken: string,
  body: Record<string, unknown>,
  step: string,
): Promise<T> {
  const url = graphUrl(path);
  const resp = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: encodeMetaBody(accessToken, body),
  });
  const text = await resp.text();
  let json: { error?: MetaApiError } & Record<string, unknown>;
  try {
    json = JSON.parse(text) as typeof json;
  } catch {
    throw new Error(`[${step}] Meta API HTTP ${resp.status}: ${text.slice(0, 300)}`);
  }
  if (!resp.ok || json.error) {
    throw new Error(
      `[${step}] ${formatMetaError(json.error, `Meta API HTTP ${resp.status}`)}`,
    );
  }
  return json as T;
}

/** 将广告账户 ID 规范化为 act_ 前缀格式。 */
function normalizeAdAccountId(id: string): string {
  const stripped = id.replace(/^act_/, "");
  return `act_${stripped}`;
}

/** datetime-local / ISO → Meta 可接受的 ISO8601。 */
function toMetaTime(input?: string): string {
  const raw = typeof input === "string" ? input.trim() : "";
  if (!raw) return new Date().toISOString();
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) {
    throw new Error(`时间格式无效：${raw}`);
  }
  return date.toISOString();
}

/**
 * ODAX 目标与 optimization_goal / destination_type 映射。
 * @see https://developers.facebook.com/docs/marketing-api/reference/ad-campaign
 */
function resolveDeliveryConfig(objective: MetaCampaignObjective): DeliveryConfig {
  switch (objective) {
    case "OUTCOME_TRAFFIC":
      return {
        optimizationGoal: "LINK_CLICKS",
        billingEvent: "IMPRESSIONS",
        destinationType: "WEBSITE",
      };
    case "OUTCOME_AWARENESS":
      return {
        optimizationGoal: "REACH",
        billingEvent: "IMPRESSIONS",
      };
    case "OUTCOME_ENGAGEMENT":
      // 站外链接互动：Website + Link Clicks（不依赖贴文/视频资产）
      return {
        optimizationGoal: "LINK_CLICKS",
        billingEvent: "IMPRESSIONS",
        destinationType: "WEBSITE",
      };
    case "OUTCOME_LEADS":
      throw new Error(
        "「获取线索」需要 Instant Form 或 Pixel，当前创建页暂不支持。请改用「流量」目标。",
      );
    case "OUTCOME_SALES":
      throw new Error(
        "「销售转化」需要 Meta Pixel / 转化事件，当前创建页暂不支持。请改用「流量」目标。",
      );
    case "OUTCOME_APP_PROMOTION":
      throw new Error(
        "「应用推广」需要应用 ID 与商店链接，当前创建页暂不支持。请改用「流量」目标。",
      );
    default:
      return {
        optimizationGoal: "LINK_CLICKS",
        billingEvent: "IMPRESSIONS",
        destinationType: "WEBSITE",
      };
  }
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
  const pageId = typeof form.pageId === "string" ? form.pageId.trim() : "";
  if (!pageId) {
    throw new Error("请选择用于投放的 Facebook 主页（Page）");
  }

  const linkUrl = typeof form.adLinkUrl === "string" ? form.adLinkUrl.trim() : "";
  if (!linkUrl) {
    throw new Error("请填写目标网址");
  }

  const delivery = resolveDeliveryConfig(form.campaignObjective);

  // ── Step 1: Campaign ─────────────────────────────────────────────────────
  const campaignBody: Record<string, unknown> = {
    name: form.campaignName,
    objective: form.campaignObjective,
    status: form.campaignStatus,
    special_ad_categories: [],
    // 使用广告组预算时显式关闭 campaign budget sharing（与官方示例一致）
    is_adset_budget_sharing_enabled: false,
  };
  const dailyBudgetRaw =
    typeof form.campaignDailyBudget === "string" ? form.campaignDailyBudget.trim() : "";
  const dailyBudgetCents = dailyBudgetRaw
    ? Math.round(parseFloat(dailyBudgetRaw) * 100)
    : 0;
  if (dailyBudgetCents > 0) {
    // Campaign 预算（CBO）：此时不再设置 is_adset_budget_sharing_enabled=false 冲突——
    // 有 daily_budget 时由 campaign 统一预算。
    delete campaignBody.is_adset_budget_sharing_enabled;
    campaignBody.daily_budget = dailyBudgetCents;
  }

  const campaignResp = await metaPost<{ id: string }>(
    `${accountPath}/campaigns`,
    accessToken,
    campaignBody,
    "创建广告系列",
  );
  const campaignId = campaignResp.id;

  // ── Step 2: Ad Set ───────────────────────────────────────────────────────
  const targeting: Record<string, unknown> = {
    age_min: parseInt(form.ageMin || "18", 10),
    age_max: parseInt(form.ageMax || "65", 10),
  };
  if (form.gender && form.gender !== "ALL") {
    targeting.genders = form.gender === "MALE" ? [1] : [2];
  }
  const geoCountries =
    typeof form.geoCountries === "string" ? form.geoCountries : "";
  const countries = geoCountries
    .split(/[\s,;]+/)
    .map((c) => c.trim().toUpperCase())
    .filter(Boolean);
  // geo_locations 为多数账户必填；未填时默认 US
  targeting.geo_locations = {
    countries: countries.length > 0 ? countries : ["US"],
  };

  // 不传 bid_strategy / bid_amount：走 Meta 默认「最低费用、不设上限」。
  // 显式传 bid_strategy 时，部分账户会强制要求 bid_amount，反而报 Invalid parameter。
  const adSetBody: Record<string, unknown> = {
    name: form.adSetName,
    campaign_id: campaignId,
    billing_event: delivery.billingEvent,
    optimization_goal: delivery.optimizationGoal,
    targeting,
    status: form.campaignStatus,
    start_time: toMetaTime(form.adSetStartTime),
  };
  if (delivery.destinationType) {
    adSetBody.destination_type = delivery.destinationType;
  }
  if (delivery.promotedObject) {
    adSetBody.promoted_object = delivery.promotedObject;
  }
  if (form.adSetEndTime?.trim()) {
    adSetBody.end_time = toMetaTime(form.adSetEndTime);
  }
  // 未设 Campaign 预算时，Ad Set 必须设预算（默认 $5，避免低于账户最低限额）
  if (dailyBudgetCents <= 0) {
    adSetBody.daily_budget = 500;
  }

  const adSetResp = await metaPost<{ id: string }>(
    `${accountPath}/adsets`,
    accessToken,
    adSetBody,
    "创建广告组",
  );
  const adSetId = adSetResp.id;

  // ── Step 3: Ad Creative ───────────────────────────────────────────────────
  const creativeBody: Record<string, unknown> = {
    name: `${form.adName}_creative`,
    object_story_spec: {
      page_id: pageId,
      link_data: {
        message: form.adBody || form.adHeadline || form.adName,
        link: linkUrl,
        name: form.adHeadline || form.adName,
        call_to_action: {
          type: form.adCallToAction,
          value: { link: linkUrl },
        },
        ...(form.adImageUrl?.trim() ? { picture: form.adImageUrl.trim() } : {}),
      },
    },
  };

  const creativeResp = await metaPost<{ id: string }>(
    `${accountPath}/adcreatives`,
    accessToken,
    creativeBody,
    "创建广告创意",
  );
  const creativeId = creativeResp.id;

  // ── Step 4: Ad ────────────────────────────────────────────────────────────
  const adResp = await metaPost<{ id: string }>(
    `${accountPath}/ads`,
    accessToken,
    {
      name: form.adName,
      adset_id: adSetId,
      creative: { creative_id: creativeId },
      status: form.campaignStatus,
    },
    "创建广告",
  );

  return { campaignId, adSetId, adId: adResp.id };
}
