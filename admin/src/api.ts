const TOKEN_KEY = "spark_admin_token";

export function getToken(): string {
  return localStorage.getItem(TOKEN_KEY) ?? "";
}

export function setToken(token: string): void {
  localStorage.setItem(TOKEN_KEY, token);
}

export function clearToken(): void {
  localStorage.removeItem(TOKEN_KEY);
}

async function apiFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const token = getToken();
  const res = await fetch(`/api${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      ...(options?.headers ?? {}),
    },
  });
  if (res.status === 401) {
    clearToken();
    window.location.reload();
    throw new Error("Unauthorized");
  }
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? `HTTP ${res.status}`);
  }
  return res.json();
}

// --- Types ---

export type OverviewData = {
  totalShops: number;
  activeSubs: number;
  totalUsedTokens: number;
  totalSubTokens: number;
  totalPurchasedTokens: number;
  recentEvents: {
    shop: string;
    appName: string;
    eventType: string;
    topic: string | null;
    createdAt: string;
  }[];
};

export type ShopRow = {
  shop: string;
  appName: string;
  subscriptionTokens: number;
  purchasedTokens: number;
  trialTokens: number;
  usedTokens: number;
  accountCreatedAt: string;
  accountUpdatedAt: string;
  planKey: string | null;
  subStatus: string | null;
  billingInterval: string | null;
  currentPeriodEnd: string | null;
};

export type TranslationJob = {
  id: string;
  shopName: string;
  source: string;
  target: string;
  modules: string[];
  aiModel: string;
  status: string;
  claimedBy: string | null;
  metrics: {
    initTotal: number;
    initDone: number;
    translateTotal: number;
    translateDone: number;
    translateFailed: number;
    writebackTotal: number;
    writebackDone: number;
    writebackFailed: number;
    usedTokens: number;
  };
  errorMessage: string | null;
  errorStage: string | null;
  createdAt: string;
  updatedAt: string;
};

export type UsageRow = {
  shop: string;
  appName: string;
  subscriptionTokens: number;
  purchasedTokens: number;
  trialTokens: number;
  usedTokens: number;
  totalTokens: number;
  usagePercent: number;
  remainingTokens: number;
  updatedAt: string;
  planKey: string | null;
  subStatus: string | null;
  currentPeriodEnd: string | null;
};

// --- API calls ---

export function fetchOverview(): Promise<OverviewData> {
  return apiFetch("/overview");
}

export function fetchShops(search?: string): Promise<{ shops: ShopRow[] }> {
  const q = search ? `?search=${encodeURIComponent(search)}` : "";
  return apiFetch(`/shops${q}`);
}

export function fetchShopEvents(
  shop: string,
): Promise<{ events: unknown[]; billingLogs: unknown[] }> {
  return apiFetch(`/shops/${encodeURIComponent(shop)}/events`);
}

export function fetchTranslations(params?: {
  status?: string;
  shop?: string;
  limit?: number;
}): Promise<{ jobs: TranslationJob[]; total: number }> {
  const query = new URLSearchParams();
  if (params?.status) query.set("status", params.status);
  if (params?.shop) query.set("shop", params.shop);
  if (params?.limit) query.set("limit", String(params.limit));
  const qs = query.toString();
  return apiFetch(`/translations${qs ? `?${qs}` : ""}`);
}

export function fetchTranslationJob(
  jobId: string,
  shop?: string,
): Promise<{ job: TranslationJob }> {
  const qs = shop ? `?shop=${encodeURIComponent(shop)}` : "";
  return apiFetch(`/translations/${encodeURIComponent(jobId)}${qs}`);
}

export function fetchUsage(search?: string): Promise<{ usage: UsageRow[] }> {
  const q = search ? `?search=${encodeURIComponent(search)}` : "";
  return apiFetch(`/usage${q}`);
}

export function fetchUsageHistory(
  shop: string,
): Promise<{ history: unknown[] }> {
  return apiFetch(`/usage/${encodeURIComponent(shop)}/history`);
}
