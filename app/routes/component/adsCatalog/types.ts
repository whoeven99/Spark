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
  initialTaskPage: AITaskListPageData;
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
    pendingAccounts: Array<{ id: string; name?: string; formatted?: string }>;
  };
  tiktok: {
    connected: boolean;
    authorized: boolean;
    awaitingCatalog: boolean;
    catalogId: string;
    advertiserId: string;
    /** shopify_official | api_managed；未连接时为空字符串。 */
    bindingMode: "" | "shopify_official" | "api_managed";
    updatedAt: string | null;
    /** Spark 自动创建并与 Catalog 关联的 TikTok Pixel Code。 */
    pixelCode: string;
    /** 商家应用 ID（应用事件源）。 */
    appId: string;
    pendingCatalogs: Array<{
      id: string;
      name?: string;
      businessId?: string;
      isShopifyOfficial?: boolean;
    }>;
  };
}
