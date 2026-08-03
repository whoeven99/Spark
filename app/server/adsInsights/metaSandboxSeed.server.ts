/**
 * Meta 沙盒 seed：按优先级尝试多种广告结构，失败自动切换下一策略。
 * 优先 DPA（商品目录广告），其次流量广告（复用帖 / 新发帖 / 链接创意）。
 */

import {
  buildMetaDevModeCreativeHint,
  getMetaSandboxCredentials,
  isMetaDevModeCreativePostError,
  metaGet,
  metaPost,
  normalizeAdAccountId,
  readMetaSandboxEnv,
  resolveSandboxObjectStoryId,
  resolveSandboxPageId,
  resolveSandboxSeedDailyBudgetCents,
  type MetaApiError,
  type MetaSandboxCredentials,
  type MetaSandboxSeedResult,
} from "./metaSandbox.server";

const LOG_PREFIX = "[AdsInsights][Meta][SandboxSeed]";

export type MetaSandboxSeedStrategyId =
  | "catalog_dpa"
  | "traffic_existing_post"
  | "traffic_page_feed_post"
  | "traffic_link_spec";

type SeedAttempt = {
  strategy: MetaSandboxSeedStrategyId;
  ok: boolean;
  message?: string;
};

type MetaSandboxSeedContext = {
  creds: MetaSandboxCredentials;
  accountPath: string;
  pageId: string;
  stamp: string;
  campaignName: string;
  adSetName: string;
  adName: string;
  linkUrl: string;
  dailyBudgetCents: number;
  bidAmountCents: number;
};

type CatalogSeedContext = {
  catalogId: string;
  productSetId: string;
};

type StrategyDefinition = {
  id: MetaSandboxSeedStrategyId;
  label: string;
  canAttempt: (ctx: MetaSandboxSeedContext) => Promise<boolean>;
  run: (ctx: MetaSandboxSeedContext) => Promise<Omit<MetaSandboxSeedResult, "attempts">>;
};

function baseTargeting() {
  return {
    geo_locations: { countries: ["US"] },
    age_min: 18,
    age_max: 65,
    targeting_automation: { advantage_audience: 0 },
  };
}

async function resolveSandboxCatalogContext(
  accessToken: string,
  adAccountId: string,
): Promise<CatalogSeedContext | null> {
  const envCatalogId = readMetaSandboxEnv("META_SANDBOX_PRODUCT_CATALOG_ID");
  const envProductSetId = readMetaSandboxEnv("META_SANDBOX_PRODUCT_SET_ID");

  if (envCatalogId) {
    const productSetId =
      envProductSetId || (await resolveFirstProductSetId(accessToken, envCatalogId));
    return productSetId ? { catalogId: envCatalogId, productSetId } : null;
  }

  const accountPath = normalizeAdAccountId(adAccountId);
  const catalogIds: string[] = [];

  try {
    const json = await metaGet<{ data?: Array<{ id?: string }> }>(
      `${accountPath}/product_catalogs`,
      accessToken,
      { fields: "id,name", limit: "25" },
    );
    for (const row of json.data ?? []) {
      const id = row.id?.trim();
      if (id) catalogIds.push(id);
    }
  } catch {
    // 部分 token 无此边
  }

  if (catalogIds.length === 0) {
    try {
      const businesses = await metaGet<{ data?: Array<{ id?: string }> }>(
        "me/businesses",
        accessToken,
        { fields: "id", limit: "25" },
      );
      for (const biz of businesses.data ?? []) {
        const businessId = biz.id?.trim();
        if (!businessId) continue;
        try {
          const json = await metaGet<{ data?: Array<{ id?: string }> }>(
            `${businessId}/owned_product_catalogs`,
            accessToken,
            { fields: "id,name", limit: "25" },
          );
          for (const row of json.data ?? []) {
            const id = row.id?.trim();
            if (id) catalogIds.push(id);
          }
        } catch {
          // 跳过无权限 Business
        }
      }
    } catch {
      // 无 business 权限
    }
  }

  for (const catalogId of catalogIds) {
    const productSetId = await resolveFirstProductSetId(accessToken, catalogId);
    if (productSetId) return { catalogId, productSetId };
  }

  return null;
}

async function resolveFirstProductSetId(
  accessToken: string,
  catalogId: string,
): Promise<string | null> {
  try {
    const json = await metaGet<{ data?: Array<{ id?: string; name?: string }> }>(
      `${catalogId}/product_sets`,
      accessToken,
      { fields: "id,name", limit: "25" },
    );
    const rows = json.data ?? [];
    const preferred = rows.find((row) => /all products/i.test(row.name ?? ""));
    return (preferred ?? rows[0])?.id?.trim() || null;
  } catch {
    return null;
  }
}

async function createPausedAd(params: {
  ctx: MetaSandboxSeedContext;
  campaignBody: Record<string, unknown>;
  adSetBody: Record<string, unknown>;
  creativeBody: Record<string, unknown>;
  warnings: string[];
}): Promise<{ campaignId: string; adSetId: string; adId: string; creativeId: string }> {
  const { ctx, campaignBody, adSetBody, creativeBody, warnings } = params;

  const campaignResp = await metaPost<{ id: string }>(
    `${ctx.accountPath}/campaigns`,
    ctx.creds.accessToken,
    campaignBody,
    "创建沙盒广告系列",
  );
  const campaignId = campaignResp.id;

  const adSetResp = await metaPost<{ id: string }>(
    `${ctx.accountPath}/adsets`,
    ctx.creds.accessToken,
    { ...adSetBody, campaign_id: campaignId },
    "创建沙盒广告组",
  );
  const adSetId = adSetResp.id;

  let creativeId: string;
  try {
    const creativeResp = await metaPost<{ id: string }>(
      `${ctx.accountPath}/adcreatives`,
      ctx.creds.accessToken,
      creativeBody,
      "创建沙盒广告创意",
    );
    creativeId = creativeResp.id;
  } catch (e) {
    const metaError = (e as Error & { metaError?: MetaApiError }).metaError;
    if (isMetaDevModeCreativePostError(metaError)) {
      throw new Error(buildMetaDevModeCreativeHint(), { cause: e });
    }
    throw e;
  }

  const adResp = await metaPost<{ id: string }>(
    `${ctx.accountPath}/ads`,
    ctx.creds.accessToken,
    {
      name: ctx.adName,
      adset_id: adSetId,
      creative: { creative_id: creativeId },
      status: "PAUSED",
    },
    "创建沙盒广告",
  );

  return { campaignId, adSetId, adId: adResp.id, creativeId };
}

async function runCatalogDpaSeed(
  ctx: MetaSandboxSeedContext,
): Promise<Omit<MetaSandboxSeedResult, "attempts">> {
  const catalog = await resolveSandboxCatalogContext(ctx.creds.accessToken, ctx.creds.adAccountId);
  if (!catalog) {
    throw new Error("未找到 Product Catalog / Product Set（可设置 META_SANDBOX_PRODUCT_CATALOG_ID）");
  }

  const warnings = [
    `DPA 商品广告：catalog ${catalog.catalogId} / product set ${catalog.productSetId}`,
  ];

  const { campaignId, adSetId, adId } = await createPausedAd({
    ctx,
    warnings,
    campaignBody: {
      name: ctx.campaignName,
      objective: "OUTCOME_SALES",
      status: "PAUSED",
      special_ad_categories: [],
      is_adset_budget_sharing_enabled: false,
      promoted_object: { product_catalog_id: catalog.catalogId },
    },
    adSetBody: {
      name: ctx.adSetName,
      billing_event: "IMPRESSIONS",
      optimization_goal: "LINK_CLICKS",
      promoted_object: { product_set_id: catalog.productSetId },
      targeting: baseTargeting(),
      status: "PAUSED",
      start_time: new Date().toISOString(),
      bid_strategy: "LOWEST_COST_WITH_BID_CAP",
      bid_amount: ctx.bidAmountCents,
      daily_budget: ctx.dailyBudgetCents,
    },
    creativeBody: {
      name: `${ctx.adName}_creative`,
      product_set_id: catalog.productSetId,
      object_story_spec: {
        page_id: ctx.pageId,
        template_data: {
          link: ctx.linkUrl,
          message: "Spark Meta sandbox catalog {{product.name}}",
          name: "{{product.price}}",
          call_to_action: { type: "SHOP_NOW" },
        },
      },
    },
  });

  return {
    campaignId,
    adSetId,
    adId,
    campaignName: ctx.campaignName,
    strategy: "catalog_dpa",
    strategyLabel: "DPA 商品广告",
    warnings,
  };
}

async function runTrafficExistingPostSeed(
  ctx: MetaSandboxSeedContext,
): Promise<Omit<MetaSandboxSeedResult, "attempts">> {
  const storyResolution = await resolveSandboxObjectStoryId({
    accessToken: ctx.creds.accessToken,
    pageId: ctx.pageId,
    linkUrl: ctx.linkUrl,
    message: "Spark Meta sandbox test",
    allowCreatePagePost: false,
  });

  if (!storyResolution.objectStoryId) {
    throw new Error("主页上无可复用帖文（可设置 META_SANDBOX_SEED_OBJECT_STORY_ID）");
  }

  const warnings = ["流量广告：复用主页现有帖文"];

  const { campaignId, adSetId, adId } = await createPausedAd({
    ctx,
    warnings,
    campaignBody: {
      name: ctx.campaignName,
      objective: "OUTCOME_TRAFFIC",
      status: "PAUSED",
      special_ad_categories: [],
      is_adset_budget_sharing_enabled: false,
    },
    adSetBody: {
      name: ctx.adSetName,
      billing_event: "IMPRESSIONS",
      optimization_goal: "LINK_CLICKS",
      destination_type: "WEBSITE",
      targeting: baseTargeting(),
      status: "PAUSED",
      start_time: new Date().toISOString(),
      bid_strategy: "LOWEST_COST_WITH_BID_CAP",
      bid_amount: ctx.bidAmountCents,
      daily_budget: ctx.dailyBudgetCents,
    },
    creativeBody: {
      name: `${ctx.adName}_creative`,
      object_story_id: storyResolution.objectStoryId,
    },
  });

  return {
    campaignId,
    adSetId,
    adId,
    campaignName: ctx.campaignName,
    strategy: "traffic_existing_post",
    strategyLabel: "流量广告（复用主页帖）",
    warnings,
  };
}

async function runTrafficPageFeedSeed(
  ctx: MetaSandboxSeedContext,
): Promise<Omit<MetaSandboxSeedResult, "attempts">> {
  const storyResolution = await resolveSandboxObjectStoryId({
    accessToken: ctx.creds.accessToken,
    pageId: ctx.pageId,
    linkUrl: ctx.linkUrl,
    message: "Spark Meta sandbox test",
    allowCreatePagePost: true,
    requireNewPagePost: true,
  });

  if (!storyResolution.objectStoryId || storyResolution.source !== "page_feed") {
    throw new Error("无法通过 Page Token 在主页发布测试帖");
  }

  const warnings = ["流量广告：使用主页新发布的帖文"];

  const { campaignId, adSetId, adId } = await createPausedAd({
    ctx,
    warnings,
    campaignBody: {
      name: ctx.campaignName,
      objective: "OUTCOME_TRAFFIC",
      status: "PAUSED",
      special_ad_categories: [],
      is_adset_budget_sharing_enabled: false,
    },
    adSetBody: {
      name: ctx.adSetName,
      billing_event: "IMPRESSIONS",
      optimization_goal: "LINK_CLICKS",
      destination_type: "WEBSITE",
      targeting: baseTargeting(),
      status: "PAUSED",
      start_time: new Date().toISOString(),
      bid_strategy: "LOWEST_COST_WITH_BID_CAP",
      bid_amount: ctx.bidAmountCents,
      daily_budget: ctx.dailyBudgetCents,
    },
    creativeBody: {
      name: `${ctx.adName}_creative`,
      object_story_id: storyResolution.objectStoryId,
    },
  });

  return {
    campaignId,
    adSetId,
    adId,
    campaignName: ctx.campaignName,
    strategy: "traffic_page_feed_post",
    strategyLabel: "流量广告（主页新发帖）",
    warnings,
  };
}

async function runTrafficLinkSpecSeed(
  ctx: MetaSandboxSeedContext,
): Promise<Omit<MetaSandboxSeedResult, "attempts">> {
  const warnings = ["流量广告：链接创意 object_story_spec（开发模式 App 可能失败）"];

  const { campaignId, adSetId, adId } = await createPausedAd({
    ctx,
    warnings,
    campaignBody: {
      name: ctx.campaignName,
      objective: "OUTCOME_TRAFFIC",
      status: "PAUSED",
      special_ad_categories: [],
      is_adset_budget_sharing_enabled: false,
    },
    adSetBody: {
      name: ctx.adSetName,
      billing_event: "IMPRESSIONS",
      optimization_goal: "LINK_CLICKS",
      destination_type: "WEBSITE",
      targeting: baseTargeting(),
      status: "PAUSED",
      start_time: new Date().toISOString(),
      bid_strategy: "LOWEST_COST_WITH_BID_CAP",
      bid_amount: ctx.bidAmountCents,
      daily_budget: ctx.dailyBudgetCents,
    },
    creativeBody: {
      name: `${ctx.adName}_creative`,
      object_story_spec: {
        page_id: ctx.pageId,
        link_data: {
          message: "Spark Meta sandbox test",
          link: ctx.linkUrl,
          name: ctx.adName,
          call_to_action: { type: "LEARN_MORE", value: { link: ctx.linkUrl } },
        },
      },
    },
  });

  return {
    campaignId,
    adSetId,
    adId,
    campaignName: ctx.campaignName,
    strategy: "traffic_link_spec",
    strategyLabel: "流量广告（链接创意）",
    warnings,
  };
}

const META_SANDBOX_SEED_STRATEGIES: StrategyDefinition[] = [
  {
    id: "catalog_dpa",
    label: "DPA 商品广告",
    canAttempt: async (ctx) =>
      Boolean(await resolveSandboxCatalogContext(ctx.creds.accessToken, ctx.creds.adAccountId)),
    run: runCatalogDpaSeed,
  },
  {
    id: "traffic_existing_post",
    label: "流量广告（复用主页帖）",
    canAttempt: async (ctx) => {
      const story = await resolveSandboxObjectStoryId({
        accessToken: ctx.creds.accessToken,
        pageId: ctx.pageId,
        linkUrl: ctx.linkUrl,
        message: "Spark Meta sandbox test",
        allowCreatePagePost: false,
      });
      return Boolean(story.objectStoryId);
    },
    run: runTrafficExistingPostSeed,
  },
  {
    id: "traffic_page_feed_post",
    label: "流量广告（主页新发帖）",
    canAttempt: async () => true,
    run: runTrafficPageFeedSeed,
  },
  {
    id: "traffic_link_spec",
    label: "流量广告（链接创意）",
    canAttempt: async () => true,
    run: runTrafficLinkSpecSeed,
  },
];

export function formatMetaSandboxSeedFailure(attempts: SeedAttempt[]): string {
  const lines = attempts.map((item) => {
    const status = item.ok ? "成功" : "失败";
    const detail = item.message ? `：${item.message}` : "";
    return `- ${item.strategy}（${status}）${detail}`;
  });
  return ["所有 Meta 沙盒 seed 策略均失败：", ...lines].join("\n");
}

/**
 * 按优先级尝试多种 Meta 沙盒广告结构；任一成功即返回，全部失败则抛错。
 */
export async function seedMetaSandboxMinimalStructure(): Promise<MetaSandboxSeedResult> {
  const creds = getMetaSandboxCredentials();
  if (!creds) {
    throw new Error(
      "未配置 Meta 沙盒：请设置 META_SANDBOX_ACCESS_TOKEN 与 META_SANDBOX_AD_ACCOUNT_ID",
    );
  }

  const pageId = await resolveSandboxPageId({
    accessToken: creds.accessToken,
    adAccountId: creds.adAccountId,
    pageId: creds.pageId,
  });
  if (!pageId) {
    throw new Error(
      "未找到可用于创建广告的 Facebook Page。请任选其一：① 在 Business Manager 将 Page 关联到沙盒广告账户；② 在 facebook.com/pages/create 创建主页；③ 在 .env 设置 META_SANDBOX_PAGE_ID=<Page 数字 ID>",
    );
  }

  const stamp = Date.now().toString(36);
  const dailyBudgetCents = resolveSandboxSeedDailyBudgetCents();
  const ctx: MetaSandboxSeedContext = {
    creds,
    accountPath: normalizeAdAccountId(creds.adAccountId),
    pageId,
    stamp,
    campaignName: `Spark Meta Sandbox Campaign ${stamp}`,
    adSetName: `Spark Meta Sandbox AdSet ${stamp}`,
    adName: `Spark Meta Sandbox Ad ${stamp}`,
    linkUrl: readMetaSandboxEnv("META_SANDBOX_SEED_LINK_URL") || "https://example.com",
    dailyBudgetCents,
    bidAmountCents: Math.max(100, Math.round(dailyBudgetCents * 0.2)),
  };

  const attempts: SeedAttempt[] = [];

  for (const strategy of META_SANDBOX_SEED_STRATEGIES) {
    try {
      const canAttempt = await strategy.canAttempt(ctx);
      if (!canAttempt) {
        attempts.push({
          strategy: strategy.id,
          ok: false,
          message: "前置条件不满足，已跳过",
        });
        continue;
      }

      const result = await strategy.run(ctx);
      attempts.push({ strategy: strategy.id, ok: true });
      return { ...result, attempts };
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      attempts.push({ strategy: strategy.id, ok: false, message });
      console.warn(`${LOG_PREFIX} strategy ${strategy.id} failed: ${message}`);
    }
  }

  throw new Error(formatMetaSandboxSeedFailure(attempts));
}
