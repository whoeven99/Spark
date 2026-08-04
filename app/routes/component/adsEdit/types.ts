export type AdsEditPlatform = "meta" | "tiktok" | "google";

// ─── 列表条目 ──────────────────────────────────────────────────────────────────

export interface AdsListCampaign {
  id: string;
  name: string;
  status: string;
}

export interface AdsListAdSet {
  id: string;
  name: string;
  status: string;
}

export interface AdsListAd {
  id: string;
  name: string;
  status: string;
}

// ─── 详情（用于预填表单） ─────────────────────────────────────────────────────

export interface MetaAdsEditDetail {
  campaign: {
    id: string;
    name: string;
    status: "ACTIVE" | "PAUSED";
    dailyBudget: string;
  };
  adSet: {
    id: string;
    name: string;
    status: "ACTIVE" | "PAUSED";
    startTime: string;
    endTime: string;
    ageMin: string;
    ageMax: string;
    gender: "ALL" | "MALE" | "FEMALE";
    geoCountries: string;
  };
  ad: {
    id: string;
    name: string;
    status: "ACTIVE" | "PAUSED";
    headline: string;
    body: string;
    callToAction: string;
    imageUrl: string;
    linkUrl: string;
  };
}

export interface TiktokAdsEditDetail {
  campaign: {
    id: string;
    name: string;
    status: "ENABLE" | "DISABLE";
    budgetMode: string;
    budget: string;
  };
  adGroup: {
    id: string;
    name: string;
    status: "ENABLE" | "DISABLE";
    budgetMode: string;
    budget: string;
    scheduleStart: string;
    scheduleEnd: string;
    gender: "GENDER_UNLIMITED" | "GENDER_MALE" | "GENDER_FEMALE";
  };
  ad: {
    id: string;
    name: string;
    status: "ENABLE" | "DISABLE";
    adText: string;
    callToAction: string;
    imageUrl: string;
    landingUrl: string;
  };
}

export interface GoogleAdsEditDetail {
  campaign: {
    id: string;
    name: string;
    status: "ENABLED" | "PAUSED";
    dailyBudget: string;
    resourceName: string;
    budgetResourceName: string;
  };
  adGroup: {
    id: string;
    name: string;
    status: "ENABLED" | "PAUSED";
    cpcBid: string;
    resourceName: string;
  };
  ad: {
    id: string;
    name: string;
    finalUrl: string;
    headlines: string[];
    descriptions: string[];
    resourceName: string;
  };
}

export type AdsEditDetail = MetaAdsEditDetail | TiktokAdsEditDetail | GoogleAdsEditDetail;

// ─── 列表 API ─────────────────────────────────────────────────────────────────

export type AdsListLevel = "campaigns" | "adsets" | "ads" | "detail";

export interface AdsListApiParams {
  platform: AdsEditPlatform;
  level: AdsListLevel;
  campaignId?: string;
  adSetId?: string;
  adId?: string;
}

export interface AdsListApiResponse {
  ok: boolean;
  campaigns?: AdsListCampaign[];
  adSets?: AdsListAdSet[];
  ads?: AdsListAd[];
  detail?: AdsEditDetail;
  errorMsg?: string;
}

// ─── 编辑表单 ─────────────────────────────────────────────────────────────────

export interface MetaEditFormData {
  campaign: {
    name: string;
    status: "ACTIVE" | "PAUSED";
    dailyBudget: string;
  };
  adSet: {
    name: string;
    status: "ACTIVE" | "PAUSED";
    startTime: string;
    endTime: string;
    ageMin: string;
    ageMax: string;
    gender: "ALL" | "MALE" | "FEMALE";
    geoCountries: string;
  };
  ad: {
    name: string;
    status: "ACTIVE" | "PAUSED";
    headline: string;
    body: string;
    callToAction: string;
    imageUrl: string;
    linkUrl: string;
  };
}

export interface TiktokEditFormData {
  campaign: {
    name: string;
    status: "ENABLE" | "DISABLE";
    budgetMode: string;
    budget: string;
  };
  adGroup: {
    name: string;
    status: "ENABLE" | "DISABLE";
    budgetMode: string;
    budget: string;
    scheduleStart: string;
    scheduleEnd: string;
    gender: "GENDER_UNLIMITED" | "GENDER_MALE" | "GENDER_FEMALE";
  };
  ad: {
    name: string;
    status: "ENABLE" | "DISABLE";
    adText: string;
    callToAction: string;
    imageUrl: string;
    landingUrl: string;
  };
}

export interface GoogleEditFormData {
  campaign: {
    name: string;
    status: "ENABLED" | "PAUSED";
    dailyBudget: string;
    resourceName: string;
    budgetResourceName: string;
  };
  adGroup: {
    name: string;
    status: "ENABLED" | "PAUSED";
    cpcBid: string;
    resourceName: string;
  };
  ad: {
    name: string;
    finalUrl: string;
    headlines: string[];
    descriptions: string[];
    resourceName: string;
  };
}

// ─── 编辑 API ─────────────────────────────────────────────────────────────────

export interface AdsEditRequest {
  platform: AdsEditPlatform;
  campaignId: string;
  adSetId?: string;
  adGroupId?: string;
  adId: string;
  meta?: MetaEditFormData;
  tiktok?: TiktokEditFormData;
  google?: GoogleEditFormData;
}

export interface AdsEditApiResponse {
  ok: boolean;
  platform: AdsEditPlatform;
  errorMsg?: string;
}

// ─── Loader ───────────────────────────────────────────────────────────────────

export interface AdsEditLoaderData {
  meta: {
    connected: boolean;
    adAccountId: string;
    adAccountName: string;
  };
  tiktok: {
    connected: boolean;
    advertiserId: string;
  };
  google: {
    connected: boolean;
    customerId: string;
    developerTokenConfigured: boolean;
  };
}
