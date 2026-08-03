/**
 * Meta 沙盒 seed：按优先级尝试多种广告结构，失败自动切换下一策略。
 * 优先 DPA（商品目录广告），其次流量广告（复用帖 / 新发帖 / 图片链接 / 链接创意）。
 */

import {
  ensureSandboxPageLinkedToAdAccount,
  getMetaSandboxCredentials,
  listPagePostStoryIds,
  metaPost,
  normalizeAdAccountId,
  readMetaSandboxEnv,
  resolveSandboxObjectStoryId,
  resolveSandboxPageId,
  resolveSandboxSeedDailyBudgetCents,
  tryCreateSandboxAdCreative,
  uploadSandboxAdImageHash,
  type MetaSandboxCredentials,
  type MetaSandboxSeedResult,
} from "./metaSandbox.server";
import {
  formatCatalogSourceLabelForUi,
  resolveSandboxCatalogContext,
} from "./metaSandboxCatalog.server";

const LOG_PREFIX = "[AdsInsights][Meta][SandboxSeed]";

export type MetaSandboxSeedStrategyId =
  | "catalog_dpa"
  | "traffic_existing_post"
  | "traffic_page_feed_post"
  | "traffic_image_link"
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
  shop: string | null;
  stamp: string;
  campaignName: string;
  adSetName: string;
  adName: string;
  linkUrl: string;
  dailyBudgetCents: number;
  bidAmountCents: number;
  prepWarnings: string[];
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

function trafficCampaignBody(ctx: MetaSandboxSeedContext) {
  return {
    name: ctx.campaignName,
    objective: "OUTCOME_TRAFFIC",
    status: "PAUSED",
    special_ad_categories: [],
    is_adset_budget_sharing_enabled: false,
  };
}

function trafficAdSetBody(ctx: MetaSandboxSeedContext) {
  return {
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
  };
}

async function createPausedAdFromCreative(params: {
  ctx: MetaSandboxSeedContext;
  campaignBody: Record<string, unknown>;
  adSetBody: Record<string, unknown>;
  creativeId: string;
}): Promise<{ campaignId: string; adSetId: string; adId: string }> {
  const { ctx, campaignBody, adSetBody, creativeId } = params;

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

  return { campaignId, adSetId, adId: adResp.id };
}

async function runCatalogDpaSeed(
  ctx: MetaSandboxSeedContext,
): Promise<Omit<MetaSandboxSeedResult, "attempts">> {
  const catalog = await resolveSandboxCatalogContext({
    sandboxAccessToken: ctx.creds.accessToken,
    adAccountId: ctx.creds.adAccountId,
    shop: ctx.shop,
  });
  if (!catalog) {
    throw new Error(
      "未找到 Product Catalog。请先在 /app/ads-catalog 连接 Meta Catalog，或在 .env 设置 META_SANDBOX_PRODUCT_CATALOG_ID",
    );
  }

  const warnings = [
    ...ctx.prepWarnings,
    `DPA 商品广告：catalog ${catalog.catalogId} / product set ${catalog.productSetId}（来源：${formatCatalogSourceLabelForUi(catalog.source)}）`,
  ];

  const { creativeId } = await tryCreateSandboxAdCreative({
    accessToken: ctx.creds.accessToken,
    accountPath: ctx.accountPath,
    adName: ctx.adName,
    creativeBodies: [
      {
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
    ],
  });

  const { campaignId, adSetId, adId } = await createPausedAdFromCreative({
    ctx,
    creativeId,
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
  const envStoryId = readMetaSandboxEnv("META_SANDBOX_SEED_OBJECT_STORY_ID");
  const postIds = envStoryId
    ? [envStoryId.includes("_") ? envStoryId : `${ctx.pageId}_${envStoryId}`]
    : await listPagePostStoryIds(ctx.creds.accessToken, ctx.pageId);

  if (postIds.length === 0) {
    throw new Error("主页上无可复用帖文（可设置 META_SANDBOX_SEED_OBJECT_STORY_ID）");
  }

  const { creativeId, usedObjectStoryId } = await tryCreateSandboxAdCreative({
    accessToken: ctx.creds.accessToken,
    accountPath: ctx.accountPath,
    adName: ctx.adName,
    objectStoryIds: postIds,
  });

  const warnings = [
    ...ctx.prepWarnings,
    `流量广告：复用主页帖文 ${usedObjectStoryId ?? postIds[0]}`,
  ];

  const { campaignId, adSetId, adId } = await createPausedAdFromCreative({
    ctx,
    creativeId,
    campaignBody: trafficCampaignBody(ctx),
    adSetBody: trafficAdSetBody(ctx),
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
    throw new Error(
      "无法通过 Page Token 在主页发布测试帖。请手动在主页发一条公开帖，或授予主页 MANAGE/CREATE_CONTENT 权限",
    );
  }

  const { creativeId, usedObjectStoryId } = await tryCreateSandboxAdCreative({
    accessToken: ctx.creds.accessToken,
    accountPath: ctx.accountPath,
    adName: ctx.adName,
    objectStoryIds: [storyResolution.objectStoryId],
  });

  const warnings = [
    ...ctx.prepWarnings,
    `流量广告：使用主页新帖 ${usedObjectStoryId ?? storyResolution.objectStoryId}`,
  ];

  const { campaignId, adSetId, adId } = await createPausedAdFromCreative({
    ctx,
    creativeId,
    campaignBody: trafficCampaignBody(ctx),
    adSetBody: trafficAdSetBody(ctx),
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

async function runTrafficImageLinkSeed(
  ctx: MetaSandboxSeedContext,
): Promise<Omit<MetaSandboxSeedResult, "attempts">> {
  const imageHash = await uploadSandboxAdImageHash({
    accessToken: ctx.creds.accessToken,
    accountPath: ctx.accountPath,
  });
  if (!imageHash) {
    throw new Error("广告图片上传失败（可设置 META_SANDBOX_SEED_IMAGE_URL）");
  }

  const linkData: Record<string, unknown> = {
    message: "Spark Meta sandbox test",
    link: ctx.linkUrl,
    name: ctx.adName,
    image_hash: imageHash,
    call_to_action: { type: "LEARN_MORE", value: { link: ctx.linkUrl } },
  };

  const { creativeId } = await tryCreateSandboxAdCreative({
    accessToken: ctx.creds.accessToken,
    accountPath: ctx.accountPath,
    adName: ctx.adName,
    creativeBodies: [
      {
        object_story_spec: {
          page_id: ctx.pageId,
          link_data: linkData,
        },
      },
    ],
  });

  const warnings = [...ctx.prepWarnings, "流量广告：广告账户图片 + 链接创意"];

  const { campaignId, adSetId, adId } = await createPausedAdFromCreative({
    ctx,
    creativeId,
    campaignBody: trafficCampaignBody(ctx),
    adSetBody: trafficAdSetBody(ctx),
  });

  return {
    campaignId,
    adSetId,
    adId,
    campaignName: ctx.campaignName,
    strategy: "traffic_image_link",
    strategyLabel: "流量广告（图片链接）",
    warnings,
  };
}

async function runTrafficLinkSpecSeed(
  ctx: MetaSandboxSeedContext,
): Promise<Omit<MetaSandboxSeedResult, "attempts">> {
  const { creativeId } = await tryCreateSandboxAdCreative({
    accessToken: ctx.creds.accessToken,
    accountPath: ctx.accountPath,
    adName: ctx.adName,
    creativeBodies: [
      {
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
    ],
  });

  const warnings = [...ctx.prepWarnings, "流量广告：链接创意 object_story_spec"];

  const { campaignId, adSetId, adId } = await createPausedAdFromCreative({
    ctx,
    creativeId,
    campaignBody: trafficCampaignBody(ctx),
    adSetBody: trafficAdSetBody(ctx),
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
      Boolean(
        await resolveSandboxCatalogContext({
          sandboxAccessToken: ctx.creds.accessToken,
          adAccountId: ctx.creds.adAccountId,
          shop: ctx.shop,
        }),
      ),
    run: runCatalogDpaSeed,
  },
  {
    id: "traffic_existing_post",
    label: "流量广告（复用主页帖）",
    canAttempt: async (ctx) => {
      if (readMetaSandboxEnv("META_SANDBOX_SEED_OBJECT_STORY_ID")) return true;
      const posts = await listPagePostStoryIds(ctx.creds.accessToken, ctx.pageId);
      return posts.length > 0;
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
    id: "traffic_image_link",
    label: "流量广告（图片链接）",
    canAttempt: async () => true,
    run: runTrafficImageLinkSeed,
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

function formatCatalogSkipReason(shop: string | null): string {
  if (shop) {
    return "未找到 Catalog：请先在 /app/ads-catalog 连接 Meta Catalog，或设置 META_SANDBOX_PRODUCT_CATALOG_ID";
  }
  return "未找到 Catalog：请设置 META_SANDBOX_PRODUCT_CATALOG_ID（沙盒 token 通常无 business/catalog 权限）";
}

export type MetaSandboxSeedOptions = {
  shop?: string | null;
};

/**
 * 按优先级尝试多种 Meta 沙盒广告结构；任一成功即返回，全部失败则抛错。
 */
export async function seedMetaSandboxMinimalStructure(
  options?: MetaSandboxSeedOptions,
): Promise<MetaSandboxSeedResult> {
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

  const linkResult = await ensureSandboxPageLinkedToAdAccount({
    accessToken: creds.accessToken,
    adAccountId: creds.adAccountId,
    pageId,
  });

  const stamp = Date.now().toString(36);
  const dailyBudgetCents = resolveSandboxSeedDailyBudgetCents();
  const ctx: MetaSandboxSeedContext = {
    creds,
    accountPath: normalizeAdAccountId(creds.adAccountId),
    pageId,
    shop: options?.shop?.trim() || null,
    stamp,
    campaignName: `Spark Meta Sandbox Campaign ${stamp}`,
    adSetName: `Spark Meta Sandbox AdSet ${stamp}`,
    adName: `Spark Meta Sandbox Ad ${stamp}`,
    linkUrl: readMetaSandboxEnv("META_SANDBOX_SEED_LINK_URL") || "https://example.com",
    dailyBudgetCents,
    bidAmountCents: Math.max(100, Math.round(dailyBudgetCents * 0.2)),
    prepWarnings: [...linkResult.warnings],
  };

  const attempts: SeedAttempt[] = [];

  for (const strategy of META_SANDBOX_SEED_STRATEGIES) {
    try {
      const canAttempt = await strategy.canAttempt(ctx);
      if (!canAttempt) {
        attempts.push({
          strategy: strategy.id,
          ok: false,
          message:
            strategy.id === "catalog_dpa"
              ? formatCatalogSkipReason(ctx.shop)
              : "前置条件不满足，已跳过",
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
