export interface ProductIssueView {
  level: "error" | "warning";
  rule: string;
  message: string;
}

export interface ProductValidationView {
  productId: string;
  title: string;
  status: "ok" | "warning" | "error";
  issues: ProductIssueView[];
}

export interface FeedValidationReportView {
  totalProducts: number;
  readyToSync: number;
  hasWarnings: number;
  hasErrors: number;
  products: ProductValidationView[];
}

export interface GoogleFeedFilters {
  tags: string[];
  productTypes: string[];
  vendors: string[];
  inStockOnly: boolean;
}

export interface GmcReviewProductView {
  offerId: string;
  title: string | null;
  status: string;
  issues: Array<{ code: string; servability: string; description: string }>;
}

import type { AITaskListPageData } from "../../../lib/aiTaskTypes";

export type AdsCatalogPlatform = "facebook" | "google" | "tiktok";

export interface AdsCatalogSyncRequestBody {
  platform: AdsCatalogPlatform;
  productIds?: string[];
  filters: {
    tags: string[];
    productTypes: string[];
    vendors: string[];
    inStockOnly: boolean;
  };
  limit?: number;
  contentLanguage?: string;
  targetCountry?: string;
  googleProductCategory?: string;
  /** TikTok：product_upload=JSON 分批；product_file=CSV Feed 文件上传。 */
  tiktokUploadMethod?: "product_upload" | "product_file";
}

export type AdsCatalogPageLoaderData = {
  /** 当前店铺 myshopify 域名，用于主题编辑器 / 店面 deep link。 */
  shopDomain: string;
  /** Shopify app api_key（client_id），用于 App embed activateAppId。 */
  shopifyApiKey: string;
  initialTaskPage: AITaskListPageData;
  /** 根据店铺币种/国家推断的 TikTok Catalog 区域。 */
  inferredTiktokRegion: string;
  boundTiktokCatalogName: string;
  boundTiktokCatalogCurrency: string;
  boundTiktokCatalogRegion: string;
  boundTiktokCatalogChannel: string;
  credentials: CredentialsView;
};

export interface CredentialsView {
  facebook: {
    configured: boolean;
    updatedAt: string | null;
    fields: {
      accessTokenMasked: string;
      catalogId: string;
      businessId: string;
      apiVersion: string;
    };
  };
  meta: {
    connected: boolean;
    catalogId: string;
    businessId: string;
    updatedAt: string | null;
    pixelId: string;
    hasCapiAccessToken: boolean;
    /** 已保存的 CAPI Access Token（Shopify Admin 鉴权页内展示）。 */
    capiAccessToken: string;
    hasStoredCapiAccessToken: boolean;
    metaOAuthCapiAvailable: boolean;
    testEventCode: string;
    capiEnabled: boolean;
    enabledEvents: string[];
    metaAdsConnected: boolean;
    metaAdsAdAccountId: string;
    metaCapiBisuConfigured: boolean;
    capiTokenType: string;
    pendingCapiPixels: Array<{ pixelId: string; pixelName?: string; businessId?: string }>;
    pendingCatalogs: Array<{ id: string; name?: string; businessId?: string }>;
  };
  googleMerchant: {
    connected: boolean;
    merchantId: string;
    updatedAt: string | null;
    pendingAccounts: Array<{ id: string; name?: string; formatted?: string }>;
  };
  googleAds: {
    connected: boolean;
    customerId: string;
    customerIdFormatted: string;
    updatedAt: string | null;
    remarketing: {
      tagId: string;
      source: "auto" | "manual" | "";
      confirmedAt: string | null;
      enabledEvents: string[];
      enabledFieldGroups: string[];
      pixelName: string;
      conversionLabel: string;
      enhancedConversions: boolean;
      customPixelConfirmedAt: string | null;
      metafieldSyncStatus: "synced" | "failed" | "";
      metafieldSyncError: string;
    };
    pendingAccounts: Array<{ id: string; name?: string; formatted?: string }>;
    availableAccounts: Array<{ id: string; name?: string; formatted?: string }>;
  };
  tiktok: {
    connected: boolean;
    authorized: boolean;
    awaitingCatalog: boolean;
    catalogId: string;
    advertiserId: string;
    /** shopify_official | api_managed；未连接时为空字符串。 */
    bindingMode: "" | "shopify_official" | "api_managed";
    /** 手动选择的 Catalog 目标市场（ISO2）。 */
    catalogRegionCode: string;
    updatedAt: string | null;
    /** 已选中或新建的 TikTok Pixel Code。 */
    pixelCode: string;
    /** 是否已配置 Events API Access Token（不明文回传）。 */
    hasEventsApiAccessToken: boolean;
    /** 已保存的 Test Event Code（服务端测试模式）；空字符串表示未开启。 */
    testEventCode: string;
    /** Conversion API / Events API 开关。 */
    eventsApiEnabled: boolean;
    /** 勾选上报的 TikTok 标准事件名。 */
    enabledEvents: string[];
    pendingCatalogs: Array<{
      id: string;
      name?: string;
      businessId?: string;
      isShopifyOfficial?: boolean;
    }>;
  };
}
