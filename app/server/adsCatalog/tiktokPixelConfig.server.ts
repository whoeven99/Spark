import type { ShopifyAdminGraphqlClient } from "../ai/skills/shopifyInfo/shopifyInfo.tool";
import {
  bindTiktokCatalogPixelEventSource,
  createTiktokPixel,
  listTiktokPixels,
  trackTiktokPixelEvent,
} from "./clients/tiktokCatalogClient.server";
import {
  getTiktokCatalogCredential,
  setTiktokCatalogCredential,
  type TiktokCatalogCredential,
} from "./credentialStore.server";
import {
  normalizeTiktokEnabledEvents,
  TIKTOK_PIXEL_METAFIELD_KEY,
  TIKTOK_PIXEL_METAFIELD_NAMESPACE,
  type TiktokPixelEventName,
  type TiktokPixelStorefrontConfig,
} from "../../lib/tiktokPixelEvents";

const LOG_PREFIX = "[AdsCatalog][TikTokPixelConfig]";

function credentialWriteBase(credential: TiktokCatalogCredential) {
  return {
    accessToken: credential.accessToken,
    refreshToken: credential.refreshToken,
    advertiserId: credential.advertiserId,
    bcId: credential.bcId,
    catalogId: credential.catalogId,
    catalogName: credential.catalogName,
  };
}

export type SaveTiktokPixelConfigInput = {
  shop: string;
  admin: ShopifyAdminGraphqlClient;
  mode: "select" | "create";
  /** 用于创建 / 校验 Pixel 列表的广告主；缺省用凭证中的 advertiserId。 */
  advertiserId?: string;
  pixelCode?: string;
  pixelName?: string;
  eventsApiAccessToken?: string;
  eventsApiEnabled?: boolean;
  enabledEvents?: unknown;
  /** 保存后是否尝试绑定 Catalog 事件源（默认 true）。 */
  bindCatalogEventSource?: boolean;
};

export type SaveTiktokPixelConfigResult = {
  pixelCode: string;
  created: boolean;
  bound: boolean;
  eventsApiEnabled: boolean;
  enabledEvents: TiktokPixelEventName[];
  hasEventsApiAccessToken: boolean;
};

async function resolveShopGid(admin: ShopifyAdminGraphqlClient): Promise<string> {
  const response = await admin.graphql(`#graphql
    query SparkTiktokPixelShopId {
      shop { id }
    }
  `);
  const json = (await response.json()) as {
    data?: { shop?: { id?: string } };
    errors?: Array<{ message?: string }>;
  };
  const id = json.data?.shop?.id?.trim();
  if (!id) {
    throw new Error(
      json.errors?.[0]?.message || "Failed to resolve shop GID for metafield write",
    );
  }
  return id;
}

/** 将 Pixel 店面配置写入 Shop metafield，供 Theme App Embed 读取。 */
export async function syncTiktokPixelStorefrontMetafield(params: {
  admin: ShopifyAdminGraphqlClient;
  config: TiktokPixelStorefrontConfig;
}): Promise<void> {
  const shopId = await resolveShopGid(params.admin);
  const testEventCode = params.config.testEventCode?.trim() || "";
  const value = JSON.stringify({
    pixelCode: params.config.pixelCode,
    enabledEvents: params.config.enabledEvents,
    eventsApiEnabled: params.config.eventsApiEnabled,
    ...(testEventCode ? { testEventCode } : {}),
  });

  const response = await params.admin.graphql(
    `#graphql
      mutation SparkTiktokPixelMetafieldSet($metafields: [MetafieldsSetInput!]!) {
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
            ownerId: shopId,
            namespace: TIKTOK_PIXEL_METAFIELD_NAMESPACE,
            key: TIKTOK_PIXEL_METAFIELD_KEY,
            type: "json",
            value,
          },
        ],
      },
    },
  );
  const json = (await response.json()) as {
    data?: {
      metafieldsSet?: {
        userErrors?: Array<{ message?: string }>;
      };
    };
    errors?: Array<{ message?: string }>;
  };
  const userErrors = json.data?.metafieldsSet?.userErrors ?? [];
  if (json.errors?.length || userErrors.length) {
    const msg =
      userErrors[0]?.message ||
      json.errors?.[0]?.message ||
      "metafieldsSet failed";
    throw new Error(`TikTok Pixel metafield sync failed: ${msg}`);
  }
}

function storefrontConfigFromCredential(credential: TiktokCatalogCredential): {
  pixelCode: string;
  enabledEvents: ReturnType<typeof normalizeTiktokEnabledEvents>;
  eventsApiEnabled: boolean;
  testEventCode?: string;
} | null {
  const pixelCode = credential.pixelCode?.trim() ?? "";
  if (!pixelCode) return null;
  const testEventCode = credential.testEventCode?.trim() || undefined;
  return {
    pixelCode,
    enabledEvents: normalizeTiktokEnabledEvents(credential.enabledEvents),
    eventsApiEnabled:
      typeof credential.eventsApiEnabled === "boolean" ? credential.eventsApiEnabled : true,
    ...(testEventCode ? { testEventCode } : {}),
  };
}

/**
 * 保存 Pixel 绑定配置。
 * - create：仅在 TikTok 创建 Pixel 并写入凭证，不要求 Events API Token / 事件。
 * - select：绑定已有 Pixel，并保存 Token / 事件 / metafield。
 */
export async function saveTiktokPixelConfig(
  params: SaveTiktokPixelConfigInput,
): Promise<SaveTiktokPixelConfigResult> {
  const credential = await getTiktokCatalogCredential(params.shop);
  if (!credential) {
    throw new Error("TikTok Catalog 尚未连接，请先完成授权。");
  }
  if (!credential.bcId) {
    throw new Error("缺少 bcId，请重新授权 TikTok。");
  }

  const advertiserId =
    params.advertiserId?.trim() || credential.advertiserId;
  const existingToken = credential.eventsApiAccessToken?.trim() || "";
  const existingEvents = normalizeTiktokEnabledEvents(credential.enabledEvents);
  const existingEventsApiEnabled =
    typeof credential.eventsApiEnabled === "boolean"
      ? credential.eventsApiEnabled
      : true;

  if (params.mode === "create") {
    const pixelName =
      params.pixelName?.trim() ||
      `Spark Pixel — ${params.shop.split(".")[0] || "Store"}`.slice(0, 40);
    const pixel = await createTiktokPixel({
      accessToken: credential.accessToken,
      advertiserId,
      pixelName,
    });
    const pixelCode = pixel.pixelCode;

    await setTiktokCatalogCredential(params.shop, {
      accessToken: credential.accessToken,
      refreshToken: credential.refreshToken,
      advertiserId,
      bcId: credential.bcId,
      catalogId: credential.catalogId,
      catalogName: credential.catalogName,
      bindingMode: credential.bindingMode,
      pixelCode,
      appId: credential.appId,
      eventsApiAccessToken: existingToken || undefined,
      eventsApiEnabled: existingEventsApiEnabled,
      enabledEvents: existingEvents,
    });

    console.info(
      `${LOG_PREFIX} step=created shop=${params.shop} pixelCode=${pixelCode} advertiserId=${advertiserId}`,
    );

    return {
      pixelCode,
      created: true,
      bound: false,
      eventsApiEnabled: existingEventsApiEnabled,
      enabledEvents: existingEvents,
      hasEventsApiAccessToken: Boolean(existingToken),
    };
  }

  const enabledEvents = normalizeTiktokEnabledEvents(params.enabledEvents);
  const eventsApiEnabled =
    typeof params.eventsApiEnabled === "boolean" ? params.eventsApiEnabled : true;
  const pixelCode = params.pixelCode?.trim() ?? "";
  if (!pixelCode) {
    throw new Error("请选择已有 Pixel");
  }

  const listed = await listTiktokPixels({
    accessToken: credential.accessToken,
    advertiserId,
  }).catch(() => [] as Array<{ pixelCode: string }>);
  if (listed.length > 0 && !listed.some((p) => p.pixelCode === pixelCode)) {
    console.warn(
      `${LOG_PREFIX} step=select_pixel_not_in_list shop=${params.shop} pixelCode=${pixelCode}`,
    );
  }

  const incomingToken = params.eventsApiAccessToken?.trim() ?? "";
  const eventsApiAccessToken = incomingToken || existingToken;
  if (!eventsApiAccessToken) {
    throw new Error("请配置 TikTok Events API Access Token");
  }

  let activeAdvertiserId = advertiserId;

  const preservedTestEventCode = credential.testEventCode?.trim() || undefined;

  await setTiktokCatalogCredential(params.shop, {
    accessToken: credential.accessToken,
    refreshToken: credential.refreshToken,
    advertiserId: activeAdvertiserId,
    bcId: credential.bcId,
    catalogId: credential.catalogId,
    catalogName: credential.catalogName,
    bindingMode: credential.bindingMode,
    pixelCode,
    appId: credential.appId,
    eventsApiAccessToken,
    eventsApiEnabled,
    enabledEvents,
  });

  try {
    await syncTiktokPixelStorefrontMetafield({
      admin: params.admin,
      config: {
        pixelCode,
        enabledEvents,
        eventsApiEnabled,
        ...(preservedTestEventCode ? { testEventCode: preservedTestEventCode } : {}),
      },
    });
  } catch (e) {
    console.warn(
      `${LOG_PREFIX} step=metafield_sync_failed shop=${params.shop} err=${e instanceof Error ? e.message : String(e)}`,
    );
  }

  let bound = false;
  const shouldBind = params.bindCatalogEventSource !== false;
  if (shouldBind && credential.bindingMode === "api_managed") {
    try {
      const bindResult = await bindTiktokCatalogPixelEventSource({
        accessToken: credential.accessToken,
        advertiserId: activeAdvertiserId,
        bcId: credential.bcId,
        catalogId: credential.catalogId,
        pixelCode,
      });
      if (bindResult.advertiserId !== activeAdvertiserId) {
        activeAdvertiserId = bindResult.advertiserId;
        await setTiktokCatalogCredential(params.shop, {
          accessToken: credential.accessToken,
          refreshToken: credential.refreshToken,
          advertiserId: activeAdvertiserId,
          bcId: credential.bcId,
          catalogId: credential.catalogId,
          catalogName: credential.catalogName,
          bindingMode: credential.bindingMode,
          pixelCode,
          appId: credential.appId,
          eventsApiAccessToken,
          eventsApiEnabled,
          enabledEvents,
        });
      }
      bound = true;
    } catch (e) {
      const errMsg = e instanceof Error ? e.message : String(e);
      console.warn(
        `${LOG_PREFIX} step=catalog_bind_failed shop=${params.shop} pixelCode=${pixelCode} err=${errMsg}`,
      );
      throw new Error(
        `Pixel 配置已保存（${pixelCode}），但绑定到 Catalog 失败：${errMsg}`,
      );
    }
  }

  console.info(
    `${LOG_PREFIX} step=saved shop=${params.shop} pixelCode=${pixelCode} created=false bound=${bound} events=${enabledEvents.join(",")}`,
  );

  return {
    pixelCode,
    created: false,
    bound,
    eventsApiEnabled,
    enabledEvents,
    hasEventsApiAccessToken: true,
  };
}

/** orders/paid → CompletePayment（按勾选 + CAPI 开关）。 */
export async function maybeTrackTiktokCompletePayment(params: {
  shop: string;
  orderId: string;
  orderName?: string;
  value?: number;
  currency?: string;
  email?: string;
}): Promise<{ sent: boolean; reason?: string }> {
  const credential = await getTiktokCatalogCredential(params.shop);
  if (!credential) return { sent: false, reason: "no_credential" };

  const pixelCode = credential.pixelCode?.trim() ?? "";
  const token = credential.eventsApiAccessToken?.trim() ?? "";
  const enabled =
    typeof credential.eventsApiEnabled === "boolean" ? credential.eventsApiEnabled : true;
  const events = normalizeTiktokEnabledEvents(credential.enabledEvents);

  if (!enabled) return { sent: false, reason: "events_api_disabled" };
  if (!pixelCode) return { sent: false, reason: "no_pixel" };
  if (!token) return { sent: false, reason: "no_events_api_token" };
  if (!events.includes("CompletePayment")) {
    return { sent: false, reason: "event_not_enabled" };
  }

  const eventId = params.orderName?.trim() || params.orderId;
  const properties: Record<string, unknown> = {};
  if (typeof params.value === "number" && Number.isFinite(params.value)) {
    properties.value = params.value;
  }
  if (params.currency?.trim()) properties.currency = params.currency.trim();
  if (params.email?.trim()) {
    // Events API 推荐 hashed email；第一期先传明文由 TikTok 侧处理风险较低的测试字段，
    // 正式增强可改为 SHA256。此处放入 context.user 更常见。
  }

  const testEventCode = credential.testEventCode?.trim() || undefined;

  try {
    await trackTiktokPixelEvent({
      eventsApiAccessToken: token,
      pixelCode,
      event: "CompletePayment",
      eventId,
      timestamp: new Date().toISOString(),
      properties: Object.keys(properties).length ? properties : undefined,
      context: params.email?.trim()
        ? { user: { email: params.email.trim() } }
        : undefined,
      testEventCode,
    });
    console.info(
      `${LOG_PREFIX} step=complete_payment_sent shop=${params.shop} eventId=${eventId}${testEventCode ? " test=1" : ""}`,
    );
    return { sent: true };
  } catch (e) {
    console.warn(
      `${LOG_PREFIX} step=complete_payment_failed shop=${params.shop} err=${e instanceof Error ? e.message : String(e)}`,
    );
    return { sent: false, reason: "track_failed" };
  }
}

/** 开启测试模式：凭证 + metafield 写入 testEventCode（店面 ttq / CompletePayment 均带测试标记）。 */
export async function startTiktokPixelTestEventMode(params: {
  shop: string;
  admin: ShopifyAdminGraphqlClient;
  testEventCode: string;
}): Promise<void> {
  const credential = await getTiktokCatalogCredential(params.shop);
  if (!credential) {
    throw new Error("TikTok Catalog 尚未连接，请先完成授权。");
  }
  const testEventCode = params.testEventCode.trim();
  if (!testEventCode) throw new Error("请填写 Test Event Code");
  if (!credential.pixelCode?.trim()) {
    throw new Error("请先选择或创建 Pixel");
  }

  await setTiktokCatalogCredential(params.shop, {
    ...credentialWriteBase(credential),
    testEventCode,
  });

  const storefront = storefrontConfigFromCredential({
    ...credential,
    testEventCode,
  });
  if (storefront) {
    await syncTiktokPixelStorefrontMetafield({
      admin: params.admin,
      config: storefront,
    });
  }

  console.info(
    `${LOG_PREFIX} step=test_mode_started shop=${params.shop} pixel=${credential.pixelCode}`,
  );
}

/** 结束测试模式：清空凭证与 metafield 中的 testEventCode，恢复正式事件。 */
export async function clearTiktokPixelTestEventMode(params: {
  shop: string;
  admin: ShopifyAdminGraphqlClient;
}): Promise<void> {
  const credential = await getTiktokCatalogCredential(params.shop);
  if (!credential) return;

  if (credential.testEventCode?.trim()) {
    await setTiktokCatalogCredential(params.shop, {
      ...credentialWriteBase(credential),
      testEventCode: "",
    });
  }

  const storefront = storefrontConfigFromCredential({
    ...credential,
    testEventCode: undefined,
  });
  if (storefront) {
    await syncTiktokPixelStorefrontMetafield({
      admin: params.admin,
      config: storefront,
    });
  }

  console.info(`${LOG_PREFIX} step=test_mode_cleared shop=${params.shop}`);
}

export async function testTiktokServerEvents(params: {
  shop: string;
  testEventCode: string;
  /** 未保存时可临时用表单里的 token 测连通性。 */
  eventsApiAccessToken?: string;
  /** 未保存时可临时用表单里选中的 Pixel。 */
  pixelCode?: string;
}): Promise<void> {
  const credential = await getTiktokCatalogCredential(params.shop);
  if (!credential) {
    throw new Error("TikTok Catalog 尚未连接，请先完成授权。");
  }
  const pixelCode =
    params.pixelCode?.trim() || credential.pixelCode?.trim() || "";
  const testEventCode = params.testEventCode.trim();
  const token =
    params.eventsApiAccessToken?.trim() ||
    credential.eventsApiAccessToken?.trim() ||
    "";
  if (!pixelCode) throw new Error("请先选择或创建 Pixel");
  if (!token) throw new Error("请配置 TikTok Events API Access Token");
  if (!testEventCode) throw new Error("请填写 Test Event Code");

  await trackTiktokPixelEvent({
    eventsApiAccessToken: token,
    pixelCode,
    event: "CompletePayment",
    eventId: `spark-test-${Date.now()}`,
    timestamp: new Date().toISOString(),
    properties: { value: 1, currency: "USD", content_type: "product" },
    testEventCode,
  });
}
