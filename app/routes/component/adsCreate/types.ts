export type AdPlatform = "meta" | "tiktok" | "google";

// ─── Meta Ads ────────────────────────────────────────────────────────────────

export type MetaCampaignObjective =
  | "OUTCOME_TRAFFIC"
  | "OUTCOME_SALES"
  | "OUTCOME_AWARENESS"
  | "OUTCOME_ENGAGEMENT"
  | "OUTCOME_LEADS"
  | "OUTCOME_APP_PROMOTION";

export type MetaCallToAction =
  | "LEARN_MORE"
  | "SHOP_NOW"
  | "SIGN_UP"
  | "DOWNLOAD"
  | "BOOK_NOW"
  | "CONTACT_US"
  | "ORDER_NOW";

export interface MetaAdFormData {
  // Campaign
  campaignName: string;
  campaignObjective: MetaCampaignObjective;
  campaignDailyBudget: string;
  campaignStatus: "ACTIVE" | "PAUSED";
  // Ad Set
  adSetName: string;
  adSetStartTime: string;
  adSetEndTime: string;
  ageMin: string;
  ageMax: string;
  gender: "ALL" | "MALE" | "FEMALE";
  geoCountries: string;
  // Ad
  adName: string;
  /** Facebook Page Graph ID，广告创意 object_story_spec.page_id 必填（旧客户端可能缺失） */
  pageId?: string;
  adHeadline: string;
  adBody: string;
  adCallToAction: MetaCallToAction;
  adImageUrl: string;
  adLinkUrl: string;
}

// ─── TikTok Ads ──────────────────────────────────────────────────────────────

export type TiktokObjective =
  | "TRAFFIC"
  | "PRODUCT_SALES"
  | "REACH"
  | "VIDEO_VIEWS"
  | "LEAD_GENERATION"
  | "APP_PROMOTION";

export type TiktokBudgetMode =
  | "BUDGET_MODE_DAY"
  | "BUDGET_MODE_TOTAL"
  | "BUDGET_MODE_INFINITE";

export type TiktokCreativeMode = "SINGLE_IMAGE" | "SINGLE_VIDEO" | "SPARK_POST";

export interface TiktokAdFormData {
  // Campaign
  campaignName: string;
  campaignObjective: TiktokObjective;
  campaignBudgetMode: TiktokBudgetMode;
  campaignBudget: string;
  campaignStatus: "ENABLE" | "DISABLE";
  // Ad Group
  adGroupName: string;
  adGroupBudgetMode: TiktokBudgetMode;
  adGroupBudget: string;
  adGroupScheduleStart: string;
  adGroupScheduleEnd: string;
  gender: "GENDER_UNLIMITED" | "GENDER_MALE" | "GENDER_FEMALE";
  locationIds: string;
  identityId: string;
  identityType: string;
  identityDisplayName: string;
  // Ad
  adName: string;
  adText: string;
  adCallToAction: string;
  creativeMode: TiktokCreativeMode;
  adImageUrl: string;
  adVideoUrl: string;
  /** 客户端预上传后的资产 ID（可选；服务端也可从 URL 上传） */
  adImageId: string;
  adVideoId: string;
  tiktokItemId: string;
  adLandingUrl: string;
}

// ─── Google Ads ───────────────────────────────────────────────────────────────

export interface GoogleAdFormData {
  // Campaign
  campaignName: string;
  campaignStatus: "ENABLED" | "PAUSED";
  campaignDailyBudget: string;
  // Ad Group
  adGroupName: string;
  adGroupStatus: "ENABLED" | "PAUSED";
  adGroupCpcBid: string;
  // Responsive Search Ad
  adFinalUrl: string;
  adHeadlines: string[];
  adDescriptions: string[];
}

// ─── API ──────────────────────────────────────────────────────────────────────

export interface AdsCreateRequest {
  platform: AdPlatform;
  mode: "create";
  meta?: MetaAdFormData;
  tiktok?: TiktokAdFormData;
  google?: GoogleAdFormData;
}

export interface AdsCreateApiResponse {
  ok: boolean;
  platform: AdPlatform;
  campaignId?: string;
  adSetId?: string;
  adGroupId?: string;
  adId?: string;
  errorMsg?: string;
}

// ─── Loader ───────────────────────────────────────────────────────────────────

export interface AdsCreateLoaderData {
  meta: {
    connected: boolean;
    adAccountId: string;
    adAccountName: string;
    currencyCode: string;
  };
  tiktok: {
    connected: boolean;
    advertiserId: string;
    currencyCode: string;
  };
  google: {
    connected: boolean;
    customerId: string;
    developerTokenConfigured: boolean;
  };
}
