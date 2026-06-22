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
    catalogId: string;
    advertiserId: string;
    updatedAt: string | null;
    pendingCatalogs: Array<{ id: string; name?: string; businessId?: string }>;
  };
}
