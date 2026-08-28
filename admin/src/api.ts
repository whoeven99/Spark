const TOKEN_KEY = "spark_admin_token";
const ROLE_KEY = "spark_admin_role";
const USER_ID_KEY = "spark_admin_user_id";

export type AdminRole = "owner" | "user";
export type AdminUserId = "yewen" | "allen" | "zhuangze";

export const ADMIN_USER_OPTIONS: ReadonlyArray<{
  id: AdminUserId;
  label: string;
}> = [
  { id: "yewen", label: "Yewen" },
  { id: "allen", label: "Allen" },
  { id: "zhuangze", label: "Zhuangze" },
];

export function getToken(): string {
  return localStorage.getItem(TOKEN_KEY) ?? "";
}

export function setToken(token: string): void {
  localStorage.setItem(TOKEN_KEY, token);
}

export function clearToken(): void {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(ROLE_KEY);
  localStorage.removeItem(USER_ID_KEY);
  localStorage.removeItem("spark_admin_me");
}

export function getRole(): AdminRole | null {
  return (localStorage.getItem(ROLE_KEY) as AdminRole) ?? null;
}

export function setRole(role: AdminRole): void {
  localStorage.setItem(ROLE_KEY, role);
}

export function isOwner(): boolean {
  return getRole() === "owner";
}

export function getAdminUserId(): AdminUserId | null {
  const v = localStorage.getItem(USER_ID_KEY);
  if (v === "yewen" || v === "allen" || v === "zhuangze") return v;
  return null;
}

export function setAdminUserId(userId: AdminUserId): void {
  localStorage.setItem(USER_ID_KEY, userId);
}

export function getAdminUserLabel(): string {
  const id = getAdminUserId();
  return ADMIN_USER_OPTIONS.find((u) => u.id === id)?.label ?? "—";
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
    translateFallback: number;
    translateUnitTotal: number;
    translateUnitDone: number;
    writebackTotal: number;
    writebackDone: number;
    writebackFailed: number;
    verifyTotal: number;
    verifyDone: number;
    verifyFailed: number;
    usedTokens: number;
    currentModule?: string | null;
    progressUpdatedAt?: string | null;
  };
  /** 服务端合并 Redis 后按阶段计算的进度（0–100）。 */
  progressPercent?: number;
  taskSource?: string | null;
  isCover?: boolean;
  errorMessage: string | null;
  errorStage: string | null;
  createdAt: string;
  updatedAt: string;
  lastHeartbeat?: string | null;
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
  source?: string;
  langFrom?: string;
  langTo?: string;
  createdFrom?: string;
  createdTo?: string;
  limit?: number;
  offset?: number;
}): Promise<{ jobs: TranslationJob[]; total: number; offset?: number; limit?: number }> {
  const query = new URLSearchParams();
  if (params?.status) query.set("status", params.status);
  if (params?.shop) query.set("shop", params.shop);
  if (params?.source) query.set("source", params.source);
  if (params?.langFrom) query.set("langFrom", params.langFrom);
  if (params?.langTo) query.set("langTo", params.langTo);
  if (params?.createdFrom) query.set("createdFrom", params.createdFrom);
  if (params?.createdTo) query.set("createdTo", params.createdTo);
  if (params?.limit) query.set("limit", String(params.limit));
  if (params?.offset) query.set("offset", String(params.offset));
  const qs = query.toString();
  return apiFetch(`/translations${qs ? `?${qs}` : ""}`);
}

export type ShopTranslationFilters = {
  shop: string;
  langFrom?: string;
  langTo?: string;
  createdFrom?: string;
  createdTo?: string;
};

export type ShopTranslationStatusRow = {
  status: string;
  taskCount: number;
  tokens: number;
};

export type ShopTranslationSummary = {
  shop: string;
  taskCount: number;
  totalTokens: number;
  byStatus: ShopTranslationStatusRow[];
  filters?: {
    langFrom: string | null;
    langTo: string | null;
    createdFrom: string | null;
    createdTo: string | null;
  };
  note?: string;
};

function appendShopTranslationFilters(query: URLSearchParams, filters: ShopTranslationFilters) {
  query.set("shop", filters.shop);
  if (filters.langFrom) query.set("langFrom", filters.langFrom);
  if (filters.langTo) query.set("langTo", filters.langTo);
  if (filters.createdFrom) query.set("createdFrom", filters.createdFrom);
  if (filters.createdTo) query.set("createdTo", filters.createdTo);
}

export function fetchShopTranslationSummary(
  filters: ShopTranslationFilters,
): Promise<ShopTranslationSummary> {
  const query = new URLSearchParams();
  appendShopTranslationFilters(query, filters);
  return apiFetch(`/translations/shop-summary?${query.toString()}`);
}

export type ShopLangPairRow = {
  source: string;
  target: string;
  taskCount: number;
  tokens: number;
};

export function fetchShopLangPairs(
  filters: ShopTranslationFilters,
): Promise<{ pairs: ShopLangPairRow[]; note?: string }> {
  const query = new URLSearchParams();
  appendShopTranslationFilters(query, filters);
  return apiFetch(`/translations/lang-pairs?${query.toString()}`);
}

export function searchTranslationShops(
  search?: string,
): Promise<{ shops: string[]; note?: string }> {
  const q = search ? `?search=${encodeURIComponent(search)}` : "";
  return apiFetch(`/translations/shops${q}`);
}

/** worker 自动翻译任务来源标识。 */
export const AUTO_TASK_SOURCE = "TsFrontend-Auto";

export type AutoTranslationSummary = {
  byStatus: Record<string, number>;
  total: number;
  createdToday: number;
  note?: string;
};

export function fetchAutoTranslationSummary(): Promise<AutoTranslationSummary> {
  return apiFetch("/translations/auto/summary");
}

export type RepairStuckTranslationResult = {
  ok: true;
  repaired: Array<{
    id: string;
    shopName: string;
    from: string;
    to: string;
    lastHeartbeat: string | null;
    claimedBy: string | null;
  }>;
  hintsPushed: number;
  wakeHints: number;
};

/** 回收发版/异常退出后僵死的 processing 任务，并唤醒排队 hint。 */
export function repairStuckTranslationJobs(body?: {
  heartbeatGraceMs?: number;
  jobIds?: string[];
  wakeQueuedHints?: boolean;
}): Promise<RepairStuckTranslationResult> {
  return apiFetch("/translations/repair-stuck", {
    method: "POST",
    body: JSON.stringify(body ?? {}),
  });
}

export function fetchTranslationJob(
  jobId: string,
  shop?: string,
): Promise<{ job: TranslationJob }> {
  const qs = shop ? `?shop=${encodeURIComponent(shop)}` : "";
  return apiFetch(`/translations/${encodeURIComponent(jobId)}${qs}`);
}

export type TranslationContentCallCost = {
  provider: string;
  model?: string;
  requestId?: string;
  /** Full prompt_tokens (includes cache hits). */
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
  /** DeepSeek usage.prompt_cache_hit_tokens (cache-hit billed rate). */
  promptCacheHitTokens?: number;
  /** DeepSeek usage.prompt_cache_miss_tokens (cache-miss billed rate). */
  promptCacheMissTokens?: number;
  /** Estimated provider CNY (元; official 中文价目 × usage). */
  costCny?: number;
  pricingPeakMultiplier?: number;
  pricingSource?: string;
  chars?: number;
  batchSize?: number;
};

export type TranslationContentFieldCost = TranslationContentCallCost & {
  calls?: TranslationContentCallCost[];
};

export type TranslationContentField = {
  key: string;
  originalValue: string;
  translatedValue: string;
  digest?: string;
  status?: string;
  /** Per-field LLM/Google/cache cost metadata from translate blob. */
  cost?: TranslationContentFieldCost;
};

export type TranslationContentResource = {
  resourceId: string;
  translations: TranslationContentField[];
};

export type TranslationContentPage = {
  module: string | null;
  modules: string[];
  page: number;
  pageSize: number;
  total: number;
  items: TranslationContentResource[];
  note?: string;
};

export type TranslationContentModule = {
  module: string;
  count: number;
  hasContent: boolean;
};

export function fetchTranslationContentModules(params: {
  jobId: string;
  shop?: string;
}): Promise<{ modules: TranslationContentModule[]; note?: string }> {
  const qs = params.shop ? `?shop=${encodeURIComponent(params.shop)}` : "";
  return apiFetch(
    `/translations/${encodeURIComponent(params.jobId)}/content/modules${qs}`,
  );
}

export function fetchTranslationContent(params: {
  jobId: string;
  shop?: string;
  module?: string;
  page?: number;
  pageSize?: number;
}): Promise<TranslationContentPage> {
  const query = new URLSearchParams();
  if (params.shop) query.set("shop", params.shop);
  if (params.module) query.set("module", params.module);
  if (params.page) query.set("page", String(params.page));
  if (params.pageSize) query.set("pageSize", String(params.pageSize));
  const qs = query.toString();
  return apiFetch(
    `/translations/${encodeURIComponent(params.jobId)}/content${qs ? `?${qs}` : ""}`,
  );
}

export type LLMKeyStats = {
  label: string;
  calls: number;
  tokens: number;
  avgLatencyMs: number;
  throttleCount: number;
  errors: number;
  poolConcurrency: number;
  limitReq: number;
  remainingReq: number;
  limitTok: number;
  remainingTok: number;
  updatedAt: number;
};

export function fetchLLMKeyStats(): Promise<{ stats: LLMKeyStats[]; note?: string }> {
  return apiFetch("/translations/key-stats");
}

export type LLMKeyHistoryEntry = {
  t: number;
  dC: number;
  dT: number;
  lat: number;
  conc: number;
  rR: number;
  lR: number;
  rT: number;
  lT: number;
};

export function fetchLLMKeyHistory(
  label?: string,
): Promise<{ history: Record<string, LLMKeyHistoryEntry[]> }> {
  const qs = label ? `?label=${encodeURIComponent(label)}` : "";
  return apiFetch(`/translations/key-stats/history${qs}`);
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

export type SkillStage =
  | "dataAlign"
  | "monitor"
  | "diagnose"
  | "propose"
  | "qc"
  | "execute"
  | "review";

export type StepKind = "data" | "compute" | "llm" | "tool" | "qc" | "execute";

export type StepSpec = {
  id: string;
  label: string;
  kind: StepKind;
  stage?: SkillStage;
  runningLabel?: string;
  optional?: boolean;
};

export type ToolParam = {
  name: string;
  type: string;
  desc: string;
  required?: boolean;
};
export type ToolDef = {
  name: string;
  description: string;
  params: ToolParam[];
};
export type SkillDef = {
  name: string;
  displayName: string;
  description: string;
  category: string;
  stage?: SkillStage;
  conditional: boolean;
  steps: StepSpec[];
  tools: ToolDef[];
};
export type PlaybookDef = {
  name: string;
  displayName: string;
  description: string;
  category: string;
  triggerDescription: string;
  steps: StepSpec[];
  conditional: boolean;
};
export type CapabilitiesData = {
  stats: { skillCount: number; toolCount: number; playbookCount: number };
  skills: SkillDef[];
  playbooks: PlaybookDef[];
};

export function fetchCapabilities(): Promise<CapabilitiesData> {
  return apiFetch("/capabilities");
}

export type SubscriptionRow = {
  shop: string;
  appName: string;
  planKey: string | null;
  status: string;
  billingInterval: string | null;
  currentPeriodEnd: string | null;
  subscriptionTokens: number;
  purchasedTokens: number;
  trialTokens: number;
  usedTokens: number;
  accountCreatedAt: string | null;
};

export type SubscriptionStats = {
  total: number;
  byStatus: Record<string, number>;
  byInterval: Record<string, number>;
  byPlan: { planKey: string | null; total: number; activeCount: number }[];
  expiringSoon: number;
};

export type SubscriptionsData = {
  stats: SubscriptionStats;
  subscriptions: SubscriptionRow[];
};

export type BillingLogRow = {
  shop: string;
  appName: string;
  eventType: string;
  planKey: string | null;
  tokensDelta: number;
  usedTokens: number;
  createdAt: string;
};

export function fetchSubscriptions(params?: {
  search?: string;
  status?: string;
  plan?: string;
  interval?: string;
}): Promise<SubscriptionsData> {
  const query = new URLSearchParams();
  if (params?.search) query.set("search", params.search);
  if (params?.status) query.set("status", params.status);
  if (params?.plan) query.set("plan", params.plan);
  if (params?.interval) query.set("interval", params.interval);
  const qs = query.toString();
  return apiFetch(`/subscriptions${qs ? `?${qs}` : ""}`);
}

export function fetchBillingLogs(
  shop: string,
): Promise<{ billingLogs: BillingLogRow[] }> {
  return apiFetch(`/subscriptions/${encodeURIComponent(shop)}/billing`);
}

// --- Spark 额度 / 系统奖励 ---

export type SparkCreditsAccount = {
  shop: string;
  subscriptionTokens: number;
  purchasedTokens: number;
  trialTokens: number;
  usedTokens: number;
  totalTokens: number;
  remainingTokens: number;
  usagePercent: number;
  createdAt: string;
  updatedAt: string;
  planKey: string | null;
  subStatus: string | null;
  billingInterval: string | null;
  currentPeriodEnd: string | null;
  trialEndsAt: string | null;
};

export type SparkCreditsBillingLog = {
  shop: string;
  eventType: string;
  planKey: string | null;
  referenceId: string | null;
  tokensDelta: number;
  usedTokens: number;
  metadata: Record<string, unknown> | null;
  createdAt: string;
};

export type SparkCreditsPeriodHistory = {
  periodStart: string;
  periodEnd: string;
  usedTokens: number;
  subscriptionTokensAllocated: number;
  purchasedTokensRemaining: number;
  trialTokensRemaining: number;
  planKey: string | null;
  archivedAt: string;
};

export type SparkCreditsData = {
  queriedShop: string;
  account: SparkCreditsAccount | null;
  billingLogs: SparkCreditsBillingLog[];
  systemRewards: SparkCreditsBillingLog[];
  periodHistory: SparkCreditsPeriodHistory[];
};

export function fetchSparkCredits(shop: string): Promise<SparkCreditsData> {
  return apiFetch(`/spark-credits?shop=${encodeURIComponent(shop)}`);
}

export type SparkRewardAdjustResult = {
  shop: string;
  action: "add" | "set";
  before: number;
  after: number;
  tokensDelta: number;
  referenceId?: string;
  eventType?: string;
  logId?: string;
  note?: string;
};

/** Admin 调整 purchasedTokens，BillingLog = SYSTEM_REWARD（系统奖励）。 */
export function adjustSparkSystemReward(params: {
  shop: string;
  action: "add" | "set";
  amount: number;
  note?: string;
}): Promise<SparkRewardAdjustResult> {
  return apiFetch("/spark-credits/reward", {
    method: "POST",
    body: JSON.stringify(params),
  });
}

// --- Spark 账单总览 ---

export type SparkBillingOverviewEvent = SparkCreditsBillingLog;

export type SparkBillingLowBalanceShop = {
  shop: string;
  planKey: string | null;
  subStatus: string | null;
  subscriptionTokens: number;
  purchasedTokens: number;
  trialTokens: number;
  usedTokens: number;
  totalTokens: number;
  remainingTokens: number;
  usagePercent: number;
};

export type SparkBillingOverviewData = {
  days: number;
  since: string;
  summary: {
    activeSubscriptions: number;
    billingEvents: number;
    systemRewardCount: number;
    systemRewardTokens: number;
    lowBalanceShops: number;
  };
  byEventType: Array<{ eventType: string; count: number; tokensSum: number }>;
  recentBillingEvents: SparkBillingOverviewEvent[];
  lowBalanceShops: SparkBillingLowBalanceShop[];
};

export function fetchSparkBillingOverview(
  days = 30,
): Promise<SparkBillingOverviewData> {
  return apiFetch(`/spark-billing/overview?days=${days}`);
}

export type SparkBillingLedgerData = {
  days: number;
  since: string;
  shop: string | null;
  eventType: string | null;
  account: {
    shop: string;
    subscriptionTokens: number;
    purchasedTokens: number;
    trialTokens: number;
    usedTokens: number;
    totalTokens: number;
    remainingTokens: number;
    usagePercent: number;
    planKey: string | null;
    subStatus: string | null;
    billingInterval: string | null;
    currentPeriodEnd: string | null;
  } | null;
  events: SparkCreditsBillingLog[];
};

export function fetchSparkBillingLedger(params?: {
  shop?: string;
  days?: number;
  eventType?: string;
}): Promise<SparkBillingLedgerData> {
  const query = new URLSearchParams();
  if (params?.shop) query.set("shop", params.shop);
  if (params?.days) query.set("days", String(params.days));
  if (params?.eventType) query.set("eventType", params.eventType);
  const qs = query.toString();
  return apiFetch(`/spark-billing/ledger${qs ? `?${qs}` : ""}`);
}

export type BillingTrendPoint = {
  period: string;
  count: number;
  creditTokens: number;
  debitTokens: number;
  shopCount: number;
};

export type BillingEvent = {
  shop: string;
  appName: string;
  eventType: string;
  planKey: string | null;
  tokensDelta: number;
  usedTokens: number;
  createdAt: string;
};

export function fetchBillingTrend(params: {
  period?: "daily" | "monthly";
  startDate?: string;
  endDate?: string;
  eventType?: string;
}): Promise<{ trend: BillingTrendPoint[]; eventTypes: string[] }> {
  const query = new URLSearchParams();
  if (params.period) query.set("period", params.period);
  if (params.startDate) query.set("startDate", params.startDate);
  if (params.endDate) query.set("endDate", params.endDate);
  if (params.eventType) query.set("eventType", params.eventType);
  return apiFetch(`/subscriptions/billing/trend?${query}`);
}

export function fetchBillingEvents(params: {
  shop?: string;
  eventType?: string;
  startDate?: string;
  endDate?: string;
  page?: number;
  pageSize?: number;
}): Promise<{ events: BillingEvent[]; total: number }> {
  const query = new URLSearchParams();
  if (params.shop) query.set("shop", params.shop);
  if (params.eventType) query.set("eventType", params.eventType);
  if (params.startDate) query.set("startDate", params.startDate);
  if (params.endDate) query.set("endDate", params.endDate);
  if (params.page) query.set("page", String(params.page));
  if (params.pageSize) query.set("pageSize", String(params.pageSize));
  return apiFetch(`/subscriptions/billing/events?${query}`);
}

// --- Revenue ---

export type RevenuePlanRow = {
  planKey: string;
  priceAmount: number;
  billingInterval: string | null;
  kind: string;
  activeCount: number;
  planMrr: number;
};

export type RevenueTopShop = {
  shop: string;
  appName: string;
  planKey: string;
  priceAmount: number;
  billingInterval: string | null;
  shopMrr: number;
};

export type RevenueSummary = {
  mrr: number;
  arr: number;
  payingCustomers: number;
  arpu: number;
  planBreakdown: RevenuePlanRow[];
  topShops: RevenueTopShop[];
};

export type RevenueTrendPoint = {
  period: string;
  chargeCount: number;
  shopCount: number;
  totalRevenue: number;
  subscriptionRevenue: number;
  packRevenue: number;
};

export type RevenueCharge = {
  shop: string;
  appName: string;
  eventType: string;
  planKey: string;
  priceAmount: number;
  billingInterval: string | null;
  kind: string;
  createdAt: string;
};

export function fetchRevenueSummary(): Promise<RevenueSummary> {
  return apiFetch("/revenue/summary");
}

export function fetchRevenueTrend(params: {
  period?: "daily" | "monthly";
  startDate?: string;
  endDate?: string;
  kind?: string;
}): Promise<{ trend: RevenueTrendPoint[] }> {
  const query = new URLSearchParams();
  if (params.period) query.set("period", params.period);
  if (params.startDate) query.set("startDate", params.startDate);
  if (params.endDate) query.set("endDate", params.endDate);
  if (params.kind) query.set("kind", params.kind);
  return apiFetch(`/revenue/trend?${query}`);
}

export function fetchRevenueCharges(params: {
  shop?: string;
  startDate?: string;
  endDate?: string;
  kind?: string;
  page?: number;
  pageSize?: number;
}): Promise<{ charges: RevenueCharge[]; total: number }> {
  const query = new URLSearchParams();
  if (params.shop) query.set("shop", params.shop);
  if (params.startDate) query.set("startDate", params.startDate);
  if (params.endDate) query.set("endDate", params.endDate);
  if (params.kind) query.set("kind", params.kind);
  if (params.page) query.set("page", String(params.page));
  if (params.pageSize) query.set("pageSize", String(params.pageSize));
  return apiFetch(`/revenue/charges?${query}`);
}

export function fetchRole(): Promise<{ role: AdminRole }> {
  return apiFetch("/auth/role");
}

// --- Visit Source (入口来源归因) ---

export type VisitSourceRow = {
  id: string;
  shop: string;
  appName: string;
  path: string;
  utm: string;
  referer: string | null;
  createdAt: string;
};

export type VisitSourceByUtm = {
  utm: string;
  visits: number;
  shopCount: number;
};

export function fetchVisitSources(params?: {
  shop?: string;
  utm?: string;
  path?: string;
  startDate?: string;
  endDate?: string;
  page?: number;
  pageSize?: number;
}): Promise<{ visits: VisitSourceRow[]; total: number; byUtm: VisitSourceByUtm[] }> {
  const query = new URLSearchParams();
  if (params?.shop) query.set("shop", params.shop);
  if (params?.utm) query.set("utm", params.utm);
  if (params?.path) query.set("path", params.path);
  if (params?.startDate) query.set("startDate", params.startDate);
  if (params?.endDate) query.set("endDate", params.endDate);
  if (params?.page) query.set("page", String(params.page));
  if (params?.pageSize) query.set("pageSize", String(params.pageSize));
  const qs = query.toString();
  return apiFetch(`/visit-source${qs ? `?${qs}` : ""}`);
}

// --- Agent Runs ---

export type AgentRunRow = {
  id: string;
  shop: string;
  appName: string;
  feature: string;
  status: "success" | "error" | "timeout" | "partial";
  startedAt: string;
  durationMs: number;
  langsmithRunId?: string;
  langsmithProject?: string;
  tools?: { name: string; ok: boolean }[];
  tokenUsage?: { prompt: number; completion: number; total: number };
  error?: { code?: string; message: string };
  reflection?: {
    summary: string;
    rootCause?: string;
    nextTimeStrategy?: string[];
    confidence?: number;
    generatedAt: string;
  };
  inputSummary?: Record<string, unknown>;
};

export type AgentRunStats = {
  summary: {
    total: number;
    successCount: number;
    errorCount: number;
    successRate: number;
    avgDurationMs: number;
    period: string;
    cutoff: string;
  } | null;
  byFeature: {
    feature: string;
    total: number;
    success: number;
    error: number;
    timeout: number;
    partial: number;
    successRate: number;
    avgDurationMs: number;
  }[];
  topErrors: { message: string; count: number }[];
  note?: string;
};

export function fetchAgentRunStats(period?: string): Promise<AgentRunStats> {
  const q = period ? `?period=${encodeURIComponent(period)}` : "";
  return apiFetch(`/agent-runs/stats${q}`);
}

export function fetchAgentRuns(params?: {
  feature?: string;
  status?: string;
  shop?: string;
  period?: string;
  limit?: number;
}): Promise<{ runs: AgentRunRow[]; note?: string }> {
  const query = new URLSearchParams();
  if (params?.feature) query.set("feature", params.feature);
  if (params?.status) query.set("status", params.status);
  if (params?.shop) query.set("shop", params.shop);
  if (params?.period) query.set("period", params.period);
  if (params?.limit) query.set("limit", String(params.limit));
  const qs = query.toString();
  return apiFetch(`/agent-runs${qs ? `?${qs}` : ""}`);
}

// --- Billing Rules ---

export type BillingRuleRow = {
  ruleKey: string;
  feature: string;
  modelKey: string;
  displayName: string;
  multiplier: number;
  baseTokenCost: number | null;
  costUsdPerMillionToken: number | null;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
};

export function fetchBillingRules(): Promise<{ rules: BillingRuleRow[] }> {
  return apiFetch("/billing-rules");
}

export function createBillingRule(data: {
  feature: string;
  modelKey: string;
  displayName: string;
  multiplier: number;
  baseTokenCost?: number | null;
  costUsdPerMillionToken?: number | null;
  enabled?: boolean;
}): Promise<{ ok: boolean; ruleKey: string }> {
  return apiFetch("/billing-rules", { method: "POST", body: JSON.stringify(data) });
}

export function updateBillingRule(
  ruleKey: string,
  data: {
    displayName?: string;
    multiplier?: number;
    baseTokenCost?: number | null;
    costUsdPerMillionToken?: number | null;
    enabled?: boolean;
  },
): Promise<{ ok: boolean }> {
  return apiFetch(`/billing-rules/${encodeURIComponent(ruleKey)}`, {
    method: "PUT",
    body: JSON.stringify(data),
  });
}

export type OpsServiceStatus = {
  key: string;
  name: string;
  category: "core" | "ai" | "ops";
  required: boolean;
  configured: boolean;
  note: string;
  costSignal: string;
  rechargeSignal: string;
};

export type OpsChecklistData = {
  generatedAt: string;
  services: OpsServiceStatus[];
};

export function fetchOpsChecklist(): Promise<OpsChecklistData> {
  return apiFetch("/ops-checklist");
}

export function deleteBillingRule(ruleKey: string): Promise<{ ok: boolean }> {
  return apiFetch(`/billing-rules/${encodeURIComponent(ruleKey)}`, { method: "DELETE" });
}

// --- Pricing Workbench ---

export type MonthlyFixedCostItem = {
  id: string;
  name: string;
  amountUsd: number;
  enabled: boolean;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
};

export type PlanCatalogItem = {
  planKey: string;
  kind: string;
  billingInterval: string | null;
  displayName: string;
  tokens: number;
  priceAmount: string;
  currencyCode: string;
};

export type PricingWorkbenchV2Settings = {
  targetGrossMarginPct: number;
  probePriceUsd: number;
  shopifyRevSharePct: number;
};

export function fetchPricingWorkbenchV2(): Promise<{
  settings: PricingWorkbenchV2Settings & { usageScenarios?: unknown[] | null };
  fixedCosts: MonthlyFixedCostItem[];
  plans: PlanCatalogItem[];
}> {
  return apiFetch("/pricing-workbench");
}

export function updatePricingWorkbenchV2Settings(
  settings: PricingWorkbenchV2Settings & { usageScenarios?: unknown[] },
): Promise<{ ok: boolean }> {
  return apiFetch("/pricing-workbench/settings", {
    method: "PUT",
    body: JSON.stringify(settings),
  });
}

export function createMonthlyFixedCost(data: {
  name: string;
  amountUsd: number;
  enabled?: boolean;
  sortOrder?: number;
}): Promise<{ ok: boolean; id: string }> {
  return apiFetch("/pricing-workbench/fixed-costs", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export function updateMonthlyFixedCost(
  id: string,
  data: {
    name?: string;
    amountUsd?: number;
    enabled?: boolean;
    sortOrder?: number;
  },
): Promise<{ ok: boolean }> {
  return apiFetch(`/pricing-workbench/fixed-costs/${encodeURIComponent(id)}`, {
    method: "PUT",
    body: JSON.stringify(data),
  });
}

export function deleteMonthlyFixedCost(id: string): Promise<{ ok: boolean }> {
  return apiFetch(`/pricing-workbench/fixed-costs/${encodeURIComponent(id)}`, {
    method: "DELETE",
  });
}

// --- Todos ---

export type TodoStatus = "todo" | "doing" | "done";
export type TodoPriority = "low" | "medium" | "high";
export type TodoAssignee = "yewen" | "allen" | "zhuangze";

export type TodoRow = {
  id: string;
  title: string;
  description: string | null;
  assignee: TodoAssignee | null;
  status: TodoStatus;
  priority: TodoPriority;
  etaDays: number | null;
  followers: TodoAssignee[];
  createdBy: string;
  createdAt: string;
  updatedAt: string;
};

export type TodoComment = {
  id: string;
  todoId: string;
  author: TodoAssignee;
  body: string;
  createdAt: string;
};

export function fetchTodos(): Promise<{ todos: TodoRow[] }> {
  return apiFetch("/todos");
}

export function createTodo(data: {
  title: string;
  description?: string;
  assignee?: TodoAssignee;
  priority?: TodoPriority;
  etaDays?: number | null;
  followers?: TodoAssignee[];
  createdBy: string;
}): Promise<{ ok: boolean; id: string }> {
  return apiFetch("/todos", { method: "POST", body: JSON.stringify(data) });
}

export function updateTodo(
  id: string,
  data: {
    title: string;
    description?: string | null;
    assignee?: TodoAssignee | null;
    status: TodoStatus;
    priority: TodoPriority;
    etaDays?: number | null;
    followers?: TodoAssignee[];
  },
): Promise<{ ok: boolean }> {
  return apiFetch(`/todos/${encodeURIComponent(id)}`, {
    method: "PUT",
    body: JSON.stringify(data),
  });
}

export function deleteTodo(id: string): Promise<{ ok: boolean }> {
  return apiFetch(`/todos/${encodeURIComponent(id)}`, { method: "DELETE" });
}

export function fetchTodoComments(
  todoId: string,
): Promise<{ comments: TodoComment[] }> {
  return apiFetch(`/todos/${encodeURIComponent(todoId)}/comments`);
}

export function createTodoComment(
  todoId: string,
  data: { author: TodoAssignee; body: string },
): Promise<{ ok: boolean; comment: TodoComment }> {
  return apiFetch(`/todos/${encodeURIComponent(todoId)}/comments`, {
    method: "POST",
    body: JSON.stringify(data),
  });
}

// --- Pixel Logs（webpixel 阿里云日志，owner only） ---

export type PixelLogConfig = {
  configured: boolean;
  project: string | null;
  logstore: string | null;
};

export type PixelLogRow = {
  id: string;
  /** 毫秒时间戳。 */
  time: number;
  event: string;
  shopName: string;
  clientId: string;
  source: string;
  productId: string;
  schemaVersion: string;
  /** 原始 payload JSON 字符串（可能为空）。 */
  payload: string;
  extra: Record<string, string>;
};

export function fetchPixelLogConfig(): Promise<PixelLogConfig> {
  return apiFetch("/pixel-logs/config");
}

export function fetchPixelLogs(params: {
  shop?: string;
  clientId?: string;
  event?: string;
  keyword?: string;
  from?: number;
  to?: number;
  page?: number;
  pageSize?: number;
}): Promise<{
  logs: PixelLogRow[];
  total: number;
  complete: boolean;
  project: string;
  logstore: string;
}> {
  const query = new URLSearchParams();
  if (params.shop) query.set("shop", params.shop);
  if (params.clientId) query.set("clientId", params.clientId);
  if (params.event) query.set("event", params.event);
  if (params.keyword) query.set("keyword", params.keyword);
  if (params.from) query.set("from", String(params.from));
  if (params.to) query.set("to", String(params.to));
  if (params.page) query.set("page", String(params.page));
  if (params.pageSize) query.set("pageSize", String(params.pageSize));
  return apiFetch(`/pixel-logs?${query}`);
}

// --- App Logs（Spark App 功能埋点，阿里云日志） ---

export type AppLogConfig = {
  configured: boolean;
  project: string | null;
  logstore: string | null;
};

export type AppLogRow = {
  id: string;
  /** 毫秒时间戳。 */
  time: number;
  event: string;
  shopName: string;
  feature: string;
  action: string;
  path: string;
  plan: string;
  source: string;
  schemaVersion: string;
  /** 原始 extra payload JSON 字符串（可能为空）。 */
  payload: string;
  extra: Record<string, string>;
};

export function fetchAppLogConfig(): Promise<AppLogConfig> {
  return apiFetch("/app-logs/config");
}

export function fetchAppLogs(params: {
  shop?: string;
  feature?: string;
  action?: string;
  keyword?: string;
  from?: number;
  to?: number;
  page?: number;
  pageSize?: number;
}): Promise<{
  logs: AppLogRow[];
  total: number;
  complete: boolean;
  project: string;
  logstore: string;
}> {
  const query = new URLSearchParams();
  if (params.shop) query.set("shop", params.shop);
  if (params.feature) query.set("feature", params.feature);
  if (params.action) query.set("action", params.action);
  if (params.keyword) query.set("keyword", params.keyword);
  if (params.from) query.set("from", String(params.from));
  if (params.to) query.set("to", String(params.to));
  if (params.page) query.set("page", String(params.page));
  if (params.pageSize) query.set("pageSize", String(params.pageSize));
  return apiFetch(`/app-logs?${query}`);
}

// --- TSF manage 单字段翻译日志（CreditUsage source=single） ---

export type SingleTranslateCreditMeta = {
  rawTokens?: number | null;
  googleCredits?: number | null;
  aiModel?: string | null;
  target?: string | null;
  sourceLocale?: string | null;
  fieldKey?: string | null;
  shopifyType?: string | null;
  textLength?: number | null;
};

export type SingleTranslateCreditRecord = {
  id: string;
  shop: string;
  credits: number;
  referenceId: string;
  createdAt: string;
  metadata: SingleTranslateCreditMeta;
};

export type SingleTranslateLogStats = {
  totalCount: number;
  totalCredits: number;
  totalRawTokens: number;
};

export type SingleTranslateLogConfig = {
  source: "credit_usage";
  defaultWindowHours: number;
  maxLimit: number;
};

export function fetchSingleTranslateLogConfig(): Promise<SingleTranslateLogConfig> {
  return apiFetch("/tsf/single-translate-logs/config");
}

export function fetchSingleTranslateLogs(params: {
  shop: string;
  from?: number;
  to?: number;
  keyword?: string;
  limit?: number;
  cursor?: string | null;
}): Promise<{
  shop: string;
  from: number;
  to: number;
  keyword: string | null;
  records: SingleTranslateCreditRecord[];
  stats: SingleTranslateLogStats;
  hasMore: boolean;
  cursor: string | null;
  note?: string;
}> {
  const query = new URLSearchParams();
  query.set("shop", params.shop);
  if (params.from) query.set("from", String(params.from));
  if (params.to) query.set("to", String(params.to));
  if (params.keyword) query.set("keyword", params.keyword);
  if (params.limit) query.set("limit", String(params.limit));
  if (params.cursor) query.set("cursor", params.cursor);
  return apiFetch(`/tsf/single-translate-logs?${query}`);
}

export type ShopSizeTier = "超大商店" | "大商店" | "中等商店" | "小商店";

export type ShopSizeProfile = {
  id: string;
  shopName: string;
  largestLanguage: string | null;
  dataBytes: number;
  dataSizeKB: number;
  sizeTier: ShopSizeTier;
  languages: Record<
    string,
    { bytes: number; items: number; units: number; updatedAt: string }
  >;
  updatedAt: string;
};

export function fetchShopSizeProfiles(): Promise<{
  profiles: ShopSizeProfile[];
  note?: string;
}> {
  return apiFetch("/shop-profile");
}

// --- Support（人工客服会话） ---

export type SupportConversationRow = {
  id: string;
  shop: string;
  contactEmail: string | null;
  shopEmail: string | null;
  status: string;
  lastMessage: string;
  lastMessageAt: string;
  unreadForOps: number;
  unreadForShop: number;
  createdAt: string;
  updatedAt: string;
};

export type SupportMessageRow = {
  id: string;
  sender: string; // "shop" | "ops"
  senderName: string | null;
  content: string;
  createdAt: string;
};

export function fetchSupportConversations(params?: {
  status?: string;
  search?: string;
  source?: string;
}): Promise<{ conversations: SupportConversationRow[] }> {
  const query = new URLSearchParams();
  if (params?.status) query.set("status", params.status);
  if (params?.search) query.set("search", params.search);
  if (params?.source) query.set("source", params.source);
  const qs = query.toString();
  return apiFetch(`/support${qs ? `?${qs}` : ""}`);
}

export function fetchSupportConversation(
  shop: string,
  source?: string,
): Promise<{
  conversation: SupportConversationRow;
  messages: SupportMessageRow[];
}> {
  const qs = source ? `?source=${encodeURIComponent(source)}` : "";
  return apiFetch(`/support/${encodeURIComponent(shop)}${qs}`);
}

export function replySupport(
  shop: string,
  content: string,
  senderName?: string,
  source?: string,
): Promise<{ ok: boolean; id: string; createdAt: string }> {
  const qs = source ? `?source=${encodeURIComponent(source)}` : "";
  return apiFetch(`/support/${encodeURIComponent(shop)}/reply${qs}`, {
    method: "POST",
    body: JSON.stringify({ content, senderName }),
  });
}

export function setSupportStatus(
  shop: string,
  status: "open" | "closed",
  source?: string,
): Promise<{ ok: boolean }> {
  const qs = source ? `?source=${encodeURIComponent(source)}` : "";
  return apiFetch(`/support/${encodeURIComponent(shop)}/status${qs}`, {
    method: "POST",
    body: JSON.stringify({ status }),
  });
}

// --- Translation Memory (TM) 缓存查询 ---

export const TM_MODEL_OPTIONS = [
  { value: "gpt-4.1-nano", label: "GPT-4.1 nano（推荐）" },
  { value: "gpt-4.1-mini", label: "gpt-4.1-mini" },
  { value: "deepseek-v4-flash", label: "deepseek-v4-flash" },
  { value: "deepseek-v4-pro", label: "deepseek-v4-pro" },
  { value: "google-translate", label: "google-translate" },
  { value: "deepseek-chat", label: "deepseek-chat" },
  { value: "deepseek-reasoner", label: "deepseek-reasoner" },
] as const;

export const DEFAULT_TM_MODEL = "gpt-4.1-nano";

export type TmLookupRow = {
  target: string;
  model: string;
  hit: boolean;
  key: string;
  value: string | null;
  ttl: number;
  cacheType: "value" | "digest";
};

export type TmLookupResult = {
  mode: "text" | "digest";
  model?: string;
  tryAllModels?: boolean;
  models?: string[];
  source?: string;
  sourceText?: string;
  shop?: string;
  digest?: string | null;
  /** text 模式实际使用的 keyId（digest 或 CRC-32） */
  keyId?: string;
  results: TmLookupRow[];
  note?: string;
};

export type TmBrowseEntry = {
  key: string;
  target: string;
  model: string;
  digest: string;
  value: string;
  valuePreview: string;
  ttl: number;
};

export type TmBrowseResult = {
  shop: string;
  entries: TmBrowseEntry[];
  byTarget: Record<string, number>;
  cursor: string;
  hasMore: boolean;
  pattern?: string;
  scanned?: number;
  note?: string;
};

export type TmShopTargetsResult = {
  shop: string;
  sources?: string[];
  targets: string[];
  note?: string;
};

export type TmValueCrc32Entry = {
  key: string;
  source: string;
  target: string;
  model: string;
  keyId: string;
  value: string;
  valuePreview: string;
  ttl: number;
};

export type TmValueCrc32BrowseResult = {
  shop: string;
  sources: string[];
  targets: string[];
  entries: TmValueCrc32Entry[];
  byTarget: Record<string, number>;
  byModel: Record<string, number>;
  patterns?: string[];
  pairCount?: number;
  scanned?: number;
  truncated?: boolean;
  note?: string;
};

export function lookupTmCache(body: {
  mode: "text" | "digest";
  shop?: string;
  sourceText?: string;
  digest?: string;
  source?: string;
  model?: string;
  targets: string[];
  tryAllModels?: boolean;
}): Promise<TmLookupResult> {
  return apiFetch("/redis-explorer/tm/lookup", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export function fetchShopTmTargets(shop: string): Promise<TmShopTargetsResult> {
  return apiFetch(`/redis-explorer/tm/shop-targets?shop=${encodeURIComponent(shop)}`);
}

export function browseTmCache(params: {
  shop: string;
  target?: string;
  cursor?: string;
  limit?: number;
}): Promise<TmBrowseResult> {
  const query = new URLSearchParams();
  query.set("shop", params.shop);
  if (params.target) query.set("target", params.target);
  if (params.cursor) query.set("cursor", params.cursor);
  if (params.limit) query.set("limit", String(params.limit));
  return apiFetch(`/redis-explorer/tm/browse?${query}`);
}

export function browseValueCrc32Cache(params: {
  shop: string;
  source?: string;
  target?: string;
  model?: string;
  limit?: number;
}): Promise<TmValueCrc32BrowseResult> {
  const query = new URLSearchParams();
  query.set("shop", params.shop);
  if (params.source) query.set("source", params.source);
  if (params.target) query.set("target", params.target);
  if (params.model) query.set("model", params.model);
  if (params.limit) query.set("limit", String(params.limit));
  return apiFetch(`/redis-explorer/tm/browse-value-crc32?${query}`);
}

// ============================================================
// TSF（TypeScriptFrontend）新用户统计 —— 读 TSF 独立 Turso 库
// 额度单位为 Credits；用户以 Account 为准（ShopBillingBinding 已废弃）。
// ============================================================

export type TsfOverviewData = {
  totalNewUsers: number;
  installedNewUsers: number;
  churnedNewUsers: number;
  activeSubs: number;
  totalUsedCredits: number;
  totalSubscriptionCredits: number;
  totalPurchasedCredits: number;
  totalTrialCredits: number;
  recentRegistrations: {
    shop: string;
    installed: boolean;
    deletedAt: string | null;
    createdAt: string;
  }[];
};

export type TsfShopRow = {
  shop: string;
  boundAt: string;
  subscriptionCredits: number;
  purchasedCredits: number;
  trialCredits: number;
  usedCredits: number;
  accountCreatedAt: string | null;
  accountUpdatedAt: string | null;
  planKey: string | null;
  subStatus: string | null;
  billingInterval: string | null;
  currentPeriodEnd: string | null;
  installed: boolean;
  sessionCount?: number;
};

export type TsfBillingLogRow = {
  shop: string;
  eventType: string;
  planKey: string | null;
  creditsDelta: number;
  usedCredits: number;
  createdAt: string;
};

export type TsfShopDetail = {
  account: {
    shop: string;
    deletedAt: string | null;
    createdAt: string;
    updatedAt: string;
    installed: boolean;
  } | null;
  /** @deprecated 兼容旧字段；等于 account 的展示投影 */
  binding: {
    shop: string;
    billingSystem: string;
    boundReason: string | null;
    createdAt: string;
    updatedAt: string;
  } | null;
  billingLogs: TsfBillingLogRow[];
};

export type TsfShopProfileRow = {
  shop: string;
  installed: boolean;
  hasProfile: boolean;
  shopName: string | null;
  primaryLocale: string | null;
  industry: string | null;
  keywords: string[];
  description: string | null;
  brandTone: string | null;
  aiModel: string | null;
  lastScanId: string | null;
  lastScannedAt: string | null;
  createdAt: string | null;
  updatedAt: string | null;
};

export type TsfShopProfilesData = {
  stats: {
    totalShops: number;
    profileShops: number;
    missingProfileShops: number;
    installedShops: number;
  };
  profiles: TsfShopProfileRow[];
  total: number;
  page: number;
  pageSize: number;
};

export type TsfShopScanStageState = "PENDING" | "DONE" | "SKIPPED" | "FAILED";

export type TsfShopScan = {
  id: string;
  shopName: string;
  trigger: "install" | "scheduled" | "manual" | "admin";
  status: "CREATED" | "QUEUED" | "SCANNING" | "COMPLETED" | "PARTIAL" | "FAILED";
  stages: Record<"contentSize" | "profile" | "coverage" | "glossary", TsfShopScanStageState>;
  blobPrefix: string;
  summary: {
    totalItems?: number;
    totalChars?: number;
    moduleStats?: Record<string, { items: number; chars: number }>;
    coverage?: Array<{
      locale: string;
      published: boolean;
      translated: number;
      total: number;
      percent: number | null;
    }>;
    glossaryCount?: number;
  };
  claimedBy: string | null;
  claimedAt: string | null;
  lastHeartbeat: string | null;
  attempts: number;
  errorMessage: string | null;
  errorStage: string | null;
  createdAt: string;
  updatedAt: string;
};

export type TsfProfileStrategy = {
  brandTerms: string[];
  doNotTranslateTerms: string[];
  preferredTerms: Array<{ source: string; note: string | null }>;
  seoTerms: string[];
  moduleHints: Array<{
    module: string;
    tonePolicy: string | null;
    keywordPolicy: string | null;
    literalVsAdaptive: string | null;
  }>;
};

export type TsfShopUnderstanding = {
  industry: string | null;
  subIndustry: string | null;
  brandPositioning: string | null;
  coreProductTypes: string[];
  sellingPoints: string[];
  priceRange: string | null;
  voiceStyle: string | null;
  seoDirection: string | null;
  marketNotes: string[];
  description: string | null;
  keywords: string[];
};

export type TsfShopMarket = {
  name: string;
  handle: string;
  status: string;
  baseCurrency: string | null;
  locales: string[];
};

export type TsfShopSignals = {
  weightedTopTerms: Array<{ term: string; score: number; count: number; sources: string[] }>;
  weightedTopPhrases: Array<{ term: string; score: number; count: number; sources: string[] }>;
  brandTerms: string[];
  categoryTerms: string[];
  menuTerms: string[];
  representativeSamples: Array<{ source: string; text: string }>;
  sourceStats: Record<string, number>;
};

export type TsfShopProfileFacts = {
  shopName: string;
  primaryDomain: string | null;
  currencyCode: string | null;
  productTypes: string[];
  vendors: string[];
  topProductTitles: string[];
  collectionTitles: string[];
  collectionDescriptions: string[];
  articleTitles: string[];
  articleSummaries: string[];
  menuTitles: string[];
  tags: string[];
};

export type TsfThemeTextSample = {
  text: string;
  module: string;
  key: string;
  weight: number;
};

export type TsfShopProfileDetailData = {
  profile: TsfShopProfileRow;
  scan: TsfShopScan | null;
  promptBlock: string | null;
  strategy: TsfProfileStrategy | null;
  glossarySuggestions: Array<{ locale: string; source: string; target: string }>;
  understanding: TsfShopUnderstanding | null;
  markets: TsfShopMarket[];
  signals: TsfShopSignals | null;
  facts: TsfShopProfileFacts | null;
  themeTexts: TsfThemeTextSample[];
  source: "cosmos" | "blob" | "mixed" | "none";
  scanNote: string | null;
};

export type TsfUsageRow = {
  shop: string;
  subscriptionCredits: number;
  purchasedCredits: number;
  trialCredits: number;
  usedCredits: number;
  totalCredits: number;
  usagePercent: number;
  remainingCredits: number;
  updatedAt: string;
  planKey: string | null;
  subStatus: string | null;
  currentPeriodEnd: string | null;
};

export type TsfUsageHistoryRow = {
  periodStart: string;
  periodEnd: string;
  usedCredits: number;
  subscriptionCreditsAllocated: number;
  purchasedCreditsRemaining: number;
  trialCreditsRemaining: number;
  planKey: string;
  archivedAt: string;
};

export type TsfSubscriptionRow = {
  shop: string;
  planKey: string | null;
  status: string;
  billingInterval: string | null;
  currentPeriodEnd: string | null;
  trialEndsAt: string | null;
  subscriptionCredits: number;
  purchasedCredits: number;
  trialCredits: number;
  usedCredits: number;
  accountCreatedAt: string | null;
};

export type TsfSubscriptionsData = {
  stats: {
    total: number;
    byStatus: Record<string, number>;
    byInterval: Record<string, number>;
    byPlan: { planKey: string | null; total: number; activeCount: number }[];
    expiringSoon: number;
  };
  subscriptions: TsfSubscriptionRow[];
};

export type TsfBillingTrendPoint = {
  period: string;
  count: number;
  creditGranted: number;
  creditConsumed: number;
  shopCount: number;
};

export type TsfRevenueSummary = {
  mrr: number;
  arr: number;
  payingCustomers: number;
  arpu: number;
  planBreakdown: {
    planKey: string;
    priceAmount: number;
    billingInterval: string | null;
    kind: string;
    activeCount: number;
    planMrr: number;
  }[];
  topShops: {
    shop: string;
    planKey: string;
    priceAmount: number;
    billingInterval: string | null;
    shopMrr: number;
  }[];
};

export type TsfRevenueTrendPoint = {
  period: string;
  chargeCount: number;
  shopCount: number;
  totalRevenue: number;
  subscriptionRevenue: number;
  packRevenue: number;
};

export type TsfRoiSource = "turso" | "cosmos" | "sls" | "mock";

export type TsfRoiMetric = {
  key: string;
  label: string;
  value: number | string | null;
  display: string;
  wired: boolean;
  source: TsfRoiSource;
  howto: string | null;
};

export type TsfRoiFunnelStep = {
  key: string;
  label: string;
  count: number;
  pctOfInstall: number;
  kind: "forward" | "churn" | "branch";
  note: string | null;
  wired: boolean;
  source: TsfRoiSource;
  howto: string | null;
};

export type TsfRoiChainRate = {
  label: string;
  value: number;
  wired: boolean;
};

export type TsfRoiActionRow = {
  shop: string;
  signal: string;
  detail: string;
  wired: boolean;
  source: TsfRoiSource;
};

export type TsfRoiActionList = {
  title: string;
  wired: boolean;
  source: TsfRoiSource;
  howto: string | null;
  rows: TsfRoiActionRow[];
};

export type TsfRoiHowtoItem = {
  id: string;
  title: string;
  detail: string;
  priority: "P0" | "P1" | "P2";
};

export type TsfRoiData = {
  generatedAt: string;
  windowDays: number;
  decision: {
    wired: boolean;
    source: TsfRoiSource;
    title: string;
    body: string;
    howto: string | null;
  };
  overview: TsfRoiMetric[];
  funnel: TsfRoiFunnelStep[];
  chainRates: Record<string, TsfRoiChainRate>;
  breakdown: {
    trialShops: number;
    expandShops: number;
    trialWired: boolean;
    expandWired: boolean;
    everSubscribed: number;
  };
  slsEvents: {
    name: string;
    count: number;
    wired: false;
    source: "mock";
    howto: string;
  }[];
  actionLists: {
    stuckTrialExpand: TsfRoiActionList;
    payingNoAuto: TsfRoiActionList;
  };
  howtoList: TsfRoiHowtoItem[];
  notes: string[];
};

export function fetchTsfRoi(): Promise<TsfRoiData> {
  return apiFetch("/tsf/roi");
}

export function fetchTsfOverview(): Promise<TsfOverviewData> {
  return apiFetch("/tsf/overview");
}

export function fetchTsfShops(search?: string): Promise<{ shops: TsfShopRow[] }> {
  const q = search ? `?search=${encodeURIComponent(search)}` : "";
  return apiFetch(`/tsf/shops${q}`);
}

export function fetchTsfShopDetail(shop: string): Promise<TsfShopDetail> {
  return apiFetch(`/tsf/shops/${encodeURIComponent(shop)}/events`);
}

export function fetchTsfShopProfiles(params?: {
  search?: string;
  profileState?: "all" | "with" | "without";
  page?: number;
  pageSize?: number;
}): Promise<TsfShopProfilesData> {
  const query = new URLSearchParams();
  if (params?.search) query.set("search", params.search);
  if (params?.profileState && params.profileState !== "all") {
    query.set("profileState", params.profileState);
  }
  if (params?.page) query.set("page", String(params.page));
  if (params?.pageSize) query.set("pageSize", String(params.pageSize));
  const qs = query.toString();
  return apiFetch(`/tsf/shop-profiles${qs ? `?${qs}` : ""}`);
}

export type CoverageBucket = "all" | "low" | "mid" | "high" | "missing";
export type AutoTranslateFilter = "all" | "on" | "off";
export type CoverageSourceKind = "finalize" | "refresh" | "shop_scan";

export type CoverageDistribution = {
  high: number;
  mid: number;
  low: number;
  missing: number;
};

export type TsfLocaleCoverage = {
  locale: string;
  translated: number;
  total: number;
  percent: number | null;
  updatedAt: string | null;
  cacheMissing: boolean;
  autoTranslate: boolean;
  coverageSource: CoverageSourceKind | null;
};

export type TsfShopLanguageCoverageRow = {
  shop: string;
  autoTranslate: boolean;
  autoTranslateLocaleCount: number;
  cacheMissing: boolean;
  localeCount: number;
  translated: number;
  total: number;
  overallPercent: number | null;
  lowestLocale: { locale: string; percent: number } | null;
  updatedAt: string | null;
  updatedAtLabel: string;
  coverageSourceSummary: CoverageSourceKind | "mixed" | null;
  isStale: boolean;
  locales: TsfLocaleCoverage[];
};

export type TsfLanguageCoverageData = {
  stats: {
    tursoShopCount: number;
    shopsWithCache: number;
    shopsWithoutCache: number;
    autoTranslateShops: number;
    avgOverallPercent: number | null;
    lowCoverageShops: number;
    staleShops: number;
    distribution: CoverageDistribution;
    redisKeyCount: number;
    tursoLocaleCount: number;
    snapshotAt: string | null;
  };
  shops: TsfShopLanguageCoverageRow[];
  total: number;
  page: number;
  pageSize: number;
  note: string | null;
};

export function fetchTsfLanguageCoverage(params?: {
  search?: string;
  bucket?: CoverageBucket;
  autoTranslate?: AutoTranslateFilter;
  page?: number;
  pageSize?: number;
  refresh?: boolean;
}): Promise<TsfLanguageCoverageData> {
  const query = new URLSearchParams();
  if (params?.search) query.set("search", params.search);
  if (params?.bucket && params.bucket !== "all") query.set("bucket", params.bucket);
  if (params?.autoTranslate && params.autoTranslate !== "all") {
    query.set("autoTranslate", params.autoTranslate);
  }
  if (params?.page) query.set("page", String(params.page));
  if (params?.pageSize) query.set("pageSize", String(params.pageSize));
  if (params?.refresh) query.set("refresh", "1");
  const qs = query.toString();
  return apiFetch(`/tsf/language-coverage${qs ? `?${qs}` : ""}`);
}

export function fetchTsfShopProfileDetail(
  shop: string,
): Promise<TsfShopProfileDetailData> {
  return apiFetch(`/tsf/shop-profiles/${encodeURIComponent(shop)}`);
}

export type ShopLocaleCoverageRow = {
  locale: string;
  translated: number;
  total: number;
  percent: number | null;
  updatedAt: string | null;
  cacheMissing: boolean;
  autoTranslate: boolean;
  coverageSource?: CoverageSourceKind | null;
};

export function fetchShopLocaleCoverage(
  shop: string,
): Promise<{ shop: string; locales: ShopLocaleCoverageRow[] }> {
  return apiFetch(`/tsf/language-coverage/shop?shop=${encodeURIComponent(shop)}`);
}

export type TsfLanguageCoverageRefreshResult = {
  enqueued: true;
  scanId: string;
  shop: string;
  status: "CREATED";
  trigger: "admin";
  hintPushed: boolean;
  note: string | null;
};

/** Owner：入队现算覆盖率（Worker trigger=admin，只跑 coverage → Turso）。 */
export function triggerTsfLanguageCoverageRefresh(
  shop: string,
): Promise<TsfLanguageCoverageRefreshResult> {
  return apiFetch(`/tsf/language-coverage/refresh`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ shop }),
  });
}

export type TsfShopProfileScanResult = {
  enqueued: true;
  scanId: string;
  status: "CREATED";
  hintPushed: boolean;
  note: string | null;
};

export function triggerTsfShopProfileScan(
  shop: string,
): Promise<TsfShopProfileScanResult> {
  return apiFetch(`/tsf/shop-profiles/${encodeURIComponent(shop)}/scan`, {
    method: "POST",
  });
}

export function fetchTsfUsage(search?: string): Promise<{ usage: TsfUsageRow[] }> {
  const q = search ? `?search=${encodeURIComponent(search)}` : "";
  return apiFetch(`/tsf/usage${q}`);
}

export function fetchTsfUsageAccount(
  shop: string,
): Promise<{ account: TsfUsageRow | null; note?: string }> {
  return apiFetch(`/tsf/usage/account?shop=${encodeURIComponent(shop)}`);
}

export function fetchTsfUsageHistory(
  shop: string,
): Promise<{ history: TsfUsageHistoryRow[] }> {
  return apiFetch(`/tsf/usage/${encodeURIComponent(shop)}/history`);
}

export function fetchTsfSubscriptions(params?: {
  search?: string;
  status?: string;
  plan?: string;
  interval?: string;
}): Promise<TsfSubscriptionsData> {
  const query = new URLSearchParams();
  if (params?.search) query.set("search", params.search);
  if (params?.status) query.set("status", params.status);
  if (params?.plan) query.set("plan", params.plan);
  if (params?.interval) query.set("interval", params.interval);
  const qs = query.toString();
  return apiFetch(`/tsf/subscriptions${qs ? `?${qs}` : ""}`);
}

export function fetchTsfBillingTrend(params: {
  period?: "daily" | "monthly";
  startDate?: string;
  endDate?: string;
  eventType?: string;
}): Promise<{ trend: TsfBillingTrendPoint[]; eventTypes: string[] }> {
  const query = new URLSearchParams();
  if (params.period) query.set("period", params.period);
  if (params.startDate) query.set("startDate", params.startDate);
  if (params.endDate) query.set("endDate", params.endDate);
  if (params.eventType) query.set("eventType", params.eventType);
  const qs = query.toString();
  return apiFetch(`/tsf/subscriptions/billing/trend${qs ? `?${qs}` : ""}`);
}

export type TsfRenewalEventRow = {
  shop: string;
  planKey: string | null;
  creditsDelta: number;
  usedCredits: number;
  createdAt: string;
  /** Shopify 周期滚动/扣款日（metadata.previousPeriodEnd） */
  previousPeriodEnd: string | null;
  nextPeriodEnd: string | null;
  /** 展示用：优先 previousPeriodEnd，否则 createdAt */
  shopifyRenewedAt: string;
};

export type TsfRenewalsData = {
  summary: {
    todayShops: number;
    todayEvents: number;
    yesterdayShops: number;
    yesterdayEvents: number;
    last7Shops: number;
    last7Events: number;
    last30Shops: number;
    last30Events: number;
  };
  daily: { day: string; eventCount: number; shopCount: number }[];
  total: number;
  events: TsfRenewalEventRow[];
};

export function fetchTsfRenewals(params?: {
  days?: number;
  page?: number;
  pageSize?: number;
}): Promise<TsfRenewalsData> {
  const query = new URLSearchParams();
  if (params?.days) query.set("days", String(params.days));
  if (params?.page) query.set("page", String(params.page));
  if (params?.pageSize) query.set("pageSize", String(params.pageSize));
  const qs = query.toString();
  return apiFetch(`/tsf/subscriptions/renewals${qs ? `?${qs}` : ""}`);
}

export function fetchTsfRevenueSummary(): Promise<TsfRevenueSummary> {
  return apiFetch("/tsf/revenue/summary");
}

export function fetchTsfRevenueTrend(params: {
  period?: "daily" | "monthly";
  startDate?: string;
  endDate?: string;
  kind?: string;
}): Promise<{ trend: TsfRevenueTrendPoint[] }> {
  const query = new URLSearchParams();
  if (params.period) query.set("period", params.period);
  if (params.startDate) query.set("startDate", params.startDate);
  if (params.endDate) query.set("endDate", params.endDate);
  if (params.kind) query.set("kind", params.kind);
  const qs = query.toString();
  return apiFetch(`/tsf/revenue/trend${qs ? `?${qs}` : ""}`);
}

export type TsfRevenueCharge = {
  shop: string;
  eventType: string;
  planKey: string;
  priceAmount: number;
  billingInterval: string | null;
  kind: string;
  createdAt: string;
  shopifyChargedAt: string;
};

export function fetchTsfRevenueCharges(params: {
  shop?: string;
  startDate?: string;
  endDate?: string;
  kind?: string;
  page?: number;
  pageSize?: number;
}): Promise<{ charges: TsfRevenueCharge[]; total: number }> {
  const query = new URLSearchParams();
  if (params.shop) query.set("shop", params.shop);
  if (params.startDate) query.set("startDate", params.startDate);
  if (params.endDate) query.set("endDate", params.endDate);
  if (params.kind) query.set("kind", params.kind);
  if (params.page) query.set("page", String(params.page));
  if (params.pageSize) query.set("pageSize", String(params.pageSize));
  const qs = query.toString();
  return apiFetch(`/tsf/revenue/charges${qs ? `?${qs}` : ""}`);
}

export type TsfPackPurchaseRow = {
  shop: string;
  planKey: string | null;
  displayName: string | null;
  referenceId: string | null;
  creditsDelta: number;
  planCredits: number;
  usedCredits: number;
  priceAmount: number;
  currencyCode: string;
  createdAt: string;
};

export type TsfPacksData = {
  stats: {
    totalPurchases: number;
    shopCount: number;
    totalCreditsGranted: number;
    totalRevenue: number;
  };
  total: number;
  purchases: TsfPackPurchaseRow[];
  planOptions: { planKey: string | null; displayName: string | null; count: number }[];
};

export function fetchTsfPacks(params?: {
  shop?: string;
  plan?: string;
  startDate?: string;
  endDate?: string;
  page?: number;
  pageSize?: number;
}): Promise<TsfPacksData> {
  const query = new URLSearchParams();
  if (params?.shop) query.set("shop", params.shop);
  if (params?.plan) query.set("plan", params.plan);
  if (params?.startDate) query.set("startDate", params.startDate);
  if (params?.endDate) query.set("endDate", params.endDate);
  if (params?.page) query.set("page", String(params.page));
  if (params?.pageSize) query.set("pageSize", String(params.pageSize));
  const qs = query.toString();
  return apiFetch(`/tsf/packs${qs ? `?${qs}` : ""}`);
}

export type TsfCreditsAccount = {
  shop: string;
  subscriptionCredits: number;
  purchasedCredits: number;
  trialCredits: number;
  usedCredits: number;
  totalCredits: number;
  remainingCredits: number;
  usagePercent: number;
  deletedAt: string | null;
  createdAt: string;
  updatedAt: string;
  installed: boolean;
  planKey: string | null;
  subStatus: string | null;
  billingInterval: string | null;
  currentPeriodEnd: string | null;
  trialEndsAt: string | null;
};

export type TsfCreditsPackPurchase = {
  shop: string;
  planKey: string | null;
  displayName: string | null;
  referenceId: string | null;
  creditsDelta: number;
  planCredits: number;
  usedCredits: number;
  priceAmount: number;
  currencyCode: string;
  createdAt: string;
};

export type TsfCreditsAdjustMetadata = {
  source?: string;
  action?: "add" | "set";
  before?: number;
  after?: number;
  amount?: number;
  note?: string | null;
  adjustedAt?: string;
  operatorRole?: string;
};

export type TsfCreditsBillingLog = {
  shop: string;
  eventType: string;
  planKey: string | null;
  referenceId: string | null;
  creditsDelta: number;
  usedCredits: number;
  metadata: TsfCreditsAdjustMetadata | null;
  createdAt: string;
};

export type TsfCreditsPeriodHistory = {
  periodStart: string;
  periodEnd: string;
  usedCredits: number;
  subscriptionCreditsAllocated: number;
  purchasedCreditsRemaining: number;
  trialCreditsRemaining: number;
  planKey: string | null;
  archivedAt: string;
};

export type TsfCreditsData = {
  queriedShop: string;
  account: TsfCreditsAccount | null;
  packPurchases: TsfCreditsPackPurchase[];
  packStats: {
    totalPurchases: number;
    totalCreditsGranted: number;
  };
  billingLogs: TsfCreditsBillingLog[];
  adminAdjustments: TsfCreditsBillingLog[];
  periodHistory: TsfCreditsPeriodHistory[];
};

/** 按 shop 查询 TSF Turso 额度与加购积分。 */
export function fetchTsfCredits(shop: string): Promise<TsfCreditsData> {
  return apiFetch(`/tsf/credits?shop=${encodeURIComponent(shop)}`);
}

export type TsfPurchasedCreditsAdjustResult = {
  shop: string;
  action: "add" | "set";
  before: number;
  after: number;
  creditsDelta: number;
  referenceId?: string;
  eventType?: string;
  logId?: string;
  note?: string;
};

/** 添加或修改 Account.purchasedCredits。 */
export function adjustTsfPurchasedCredits(params: {
  shop: string;
  action: "add" | "set";
  amount: number;
  note?: string;
}): Promise<TsfPurchasedCreditsAdjustResult> {
  return apiFetch("/tsf/credits/purchased", {
    method: "POST",
    body: JSON.stringify(params),
  });
}

export type TsfBillingAccount = {
  shop: string;
  subscriptionCredits: number;
  purchasedCredits: number;
  trialCredits: number;
  usedCredits: number;
  createdAt: string;
  updatedAt: string;
};

export type TsfBillingSubscription = {
  shop: string;
  planKey: string | null;
  shopifySubscriptionId: string | null;
  billingInterval: string | null;
  status: string | null;
  creditsPerPeriod: number;
  trialEndsAt: string | null;
  currentPeriodStart: string | null;
  currentPeriodEnd: string | null;
  cancelledAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type TsfBillingSummary = {
  totalCredits: number;
  usedCredits: number;
  remainingCredits: number;
  usagePercent: number;
  billingEventsCount: number;
  translationJobsCount: number;
  translationUsedTokens: number;
  lastBillingAt: string | null;
  lastTranslationAt: string | null;
};

export type TsfBillingEventRow = {
  shop: string;
  eventType: string;
  planKey: string | null;
  referenceId: string | null;
  creditsDelta: number;
  usedCredits: number;
  metadata: string | null;
  createdAt: string;
};

export type TsfBillingPeriodUsageRow = {
  periodStart: string;
  periodEnd: string;
  usedCredits: number;
  subscriptionCreditsAllocated: number;
  purchasedCreditsRemaining: number;
  trialCreditsRemaining: number;
  planKey: string;
  archivedAt: string;
};

export type TsfTranslationUsageRow = {
  id: string;
  shopName: string;
  source: string;
  target: string;
  modules: string[];
  status: string;
  taskSource: string | null;
  isCover: boolean;
  aiModel: string | null;
  usedTokens: number;
  translateDone: number;
  translateTotal: number;
  translateFailed: number;
  writebackDone: number;
  writebackTotal: number;
  writebackFailed: number;
  createdAt: string;
  updatedAt: string;
};

export type TsfBillingLedgerData = {
  account: TsfBillingAccount | null;
  subscription: TsfBillingSubscription | null;
  summary: TsfBillingSummary | null;
  billingEvents: TsfBillingEventRow[];
  periodUsages: TsfBillingPeriodUsageRow[];
  translationUsage: {
    rows: TsfTranslationUsageRow[];
    total: number;
    usedTokens: number;
    note: string | null;
  };
  warnings: string[];
};

export type TsfBillingOverviewSummary = {
  days: number;
  activeSubscriptions: number;
  pendingSubscriptions: number;
  cancelledSubscriptions: number;
  expiringSoon: number;
  newSubscriptions: number;
  renewedSubscriptions: number;
  cancelledEvents: number;
  packPurchases: number;
  creditsGranted: number;
  lowBalanceShops: number;
  translationJobs: number;
  translationUsedTokens: number;
  failedJobs: number;
  pausedJobs: number;
};

export type TsfBillingOverviewEvent = {
  shop: string;
  eventType: string;
  planKey: string | null;
  referenceId: string | null;
  creditsDelta: number;
  usedCredits: number;
  remainingCredits: number;
  subscriptionStatus: string | null;
  billingInterval: string | null;
  currentPeriodEnd: string | null;
  createdAt: string;
};

export type TsfBillingTopUsageShop = {
  shopName: string;
  taskCount: number;
  usedTokens: number;
  failedJobs: number;
  planKey: string | null;
  subscriptionStatus: string | null;
  remainingCredits: number | null;
};

export type TsfBillingRiskShop = {
  shop: string;
  planKey: string | null;
  subscriptionStatus: string | null;
  totalCredits: number;
  usedCredits: number;
  remainingCredits: number;
  currentPeriodEnd: string | null;
  updatedAt: string;
  reasons: string[];
};

export type TsfBillingOverviewData = {
  summary: TsfBillingOverviewSummary;
  recentBillingEvents: TsfBillingOverviewEvent[];
  topTranslationJobs: TsfTranslationUsageRow[];
  topUsageShops: TsfBillingTopUsageShop[];
  riskShops: TsfBillingRiskShop[];
  note: string | null;
};

export function fetchTsfBillingOverview(params?: {
  days?: number;
}): Promise<TsfBillingOverviewData> {
  const query = new URLSearchParams();
  if (params?.days) query.set("days", String(params.days));
  const qs = query.toString();
  return apiFetch(`/tsf/billing/overview${qs ? `?${qs}` : ""}`);
}

export function fetchTsfBillingLedger(params: {
  shop?: string;
  days?: number;
  source?: string;
  status?: string;
  page?: number;
  pageSize?: number;
}): Promise<TsfBillingLedgerData> {
  const query = new URLSearchParams();
  if (params.shop) query.set("shop", params.shop);
  if (params.days) query.set("days", String(params.days));
  if (params.source) query.set("source", params.source);
  if (params.status) query.set("status", params.status);
  if (params.page) query.set("page", String(params.page));
  if (params.pageSize) query.set("pageSize", String(params.pageSize));
  const qs = query.toString();
  return apiFetch(`/tsf/billing${qs ? `?${qs}` : ""}`);
}

// --- Translation ops (SpringBackend proxy) ---

export type SpringBackendEnv = "prod" | "test";

export type TranslationConfigData = {
  env: SpringBackendEnv;
  config: Record<string, string>;
};

export type TranslationAddQuotaResult = {
  env: SpringBackendEnv;
  oldChars: string;
  addChars: string;
  newChars: string;
};

export function fetchTranslationConfig(env: SpringBackendEnv): Promise<TranslationConfigData> {
  return apiFetch(`/translation-ops/config?env=${env}`);
}

export function upsertTranslationConfig(
  env: SpringBackendEnv,
  key: string,
  value: string,
): Promise<TranslationConfigData> {
  const query = new URLSearchParams({ env, key, value });
  return apiFetch(`/translation-ops/config?${query.toString()}`, { method: "PUT" });
}

export function deleteTranslationConfig(
  env: SpringBackendEnv,
  key: string,
): Promise<TranslationConfigData> {
  const query = new URLSearchParams({ env, key });
  return apiFetch(`/translation-ops/config?${query.toString()}`, { method: "DELETE" });
}

export function addTranslationQuota(params: {
  shopName: string;
  addChars: number;
}): Promise<TranslationAddQuotaResult> {
  return apiFetch("/translation-ops/add-quota", {
    method: "POST",
    body: JSON.stringify(params),
  });
}

// --- Shopify 翻译资源运维（直连 Shopify GraphQL，token 从 TSF Turso Session 解析）---

export type ShopifyTranslationRow = {
  moduleType: string;
  resourceId: string;
  key: string;
  source_text: string | null;
  source_code: string | null;
  target_text: string | null;
  target_code: string | null;
  digest: string | null;
  type: string | null;
  outdated: boolean | null;
};

export function fetchShopifyTranslationResourceTypes(): Promise<{ resourceTypes: string[] }> {
  return apiFetch("/shopify-translation/resource-types");
}

export function checkShopifyTranslationSession(shopName: string): Promise<{
  shop: string;
  hasToken: boolean;
  scope: string | null;
}> {
  const query = new URLSearchParams({ shopName });
  return apiFetch(`/shopify-translation/session-check?${query.toString()}`);
}

export function queryShopifyTranslations(params: {
  shopName: string;
  targetLocale: string;
  selectedModules: string[];
}): Promise<{ data: ShopifyTranslationRow[]; count: number }> {
  return apiFetch("/shopify-translation/query", {
    method: "POST",
    body: JSON.stringify(params),
  });
}

export function registerShopifyTranslation(params: {
  shopName: string;
  resourceId: string;
  locale: string;
  key: string;
  value: string;
  digest: string;
}): Promise<Record<string, unknown>> {
  return apiFetch("/shopify-translation/register", {
    method: "POST",
    body: JSON.stringify(params),
  });
}

export function deleteShopifyTranslation(params: {
  shopName: string;
  resourceId: string;
  locale: string;
  translationKey: string;
}): Promise<{ success?: boolean; error?: string }> {
  return apiFetch("/shopify-translation/delete", {
    method: "POST",
    body: JSON.stringify(params),
  });
}

export async function consumeShopifyTranslationSse(
  path: string,
  form: FormData,
  onLog: (line: string) => void,
): Promise<void> {
  const token = getToken();
  const res = await fetch(`/api/shopify-translation/${path}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: form,
  });

  if (res.status === 401) {
    clearToken();
    window.location.reload();
    throw new Error("Unauthorized");
  }
  if (!res.ok) {
    const body = await res.text();
    throw new Error(body || `HTTP ${res.status}`);
  }

  const reader = res.body?.getReader();
  if (!reader) throw new Error("无法读取响应流");

  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const parts = buffer.split("\n\n");
    buffer = parts.pop() ?? "";
    for (const part of parts) {
      for (const line of part.split("\n")) {
        if (line.startsWith("data: ")) {
          const msg = line.slice(6);
          if (msg !== "__COMPLETE__") onLog(msg);
        }
      }
    }
  }
}

export async function importShopifyQueryCsv(
  params: {
    shopName: string;
    locale: string;
    concurrency: number;
    file: File;
  },
  onLog: (line: string) => void,
): Promise<void> {
  const form = new FormData();
  form.append("shopName", params.shopName);
  form.append("locale", params.locale);
  form.append("concurrency", String(params.concurrency));
  form.append("file", params.file);
  return consumeShopifyTranslationSse("query-csv-import", form, onLog);
}

export async function importShopifyStandardCsv(
  params: { shopName: string; file: File },
  onLog: (line: string) => void,
): Promise<void> {
  const form = new FormData();
  form.append("shopName", params.shopName);
  form.append("file", params.file);
  return consumeShopifyTranslationSse("standard-csv-import", form, onLog);
}

export async function importLiquidRuleCsv(
  params: { shopName: string; file: File },
  onLog: (line: string) => void,
): Promise<void> {
  const form = new FormData();
  form.append("shopName", params.shopName);
  form.append("file", params.file);
  return consumeShopifyTranslationSse("liquid-rule-csv-import", form, onLog);
}

export type BatchDeleteCsvResult = {
  success: boolean;
  summary?: string;
  error?: string;
  results?: {
    row: number;
    resourceId: string;
    locale: string;
    key: string;
    status: "deleted" | "failed" | "skipped";
    message: string;
  }[];
};

export async function batchDeleteShopifyTranslationsCsv(params: {
  shopName: string;
  file: File;
}): Promise<BatchDeleteCsvResult> {
  const token = getToken();
  const form = new FormData();
  form.append("shopName", params.shopName);
  form.append("file", params.file);

  const res = await fetch("/api/shopify-translation/batch-delete-csv", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: form,
  });

  if (res.status === 401) {
    clearToken();
    window.location.reload();
    throw new Error("Unauthorized");
  }

  const body = (await res.json().catch(() => ({}))) as BatchDeleteCsvResult & { error?: string };
  if (!res.ok) {
    throw new Error(body.error ?? `HTTP ${res.status}`);
  }
  return body;
}

export function exportTranslationRowsToCsv(rows: ShopifyTranslationRow[]): void {
  const headers = [
    "moduleType",
    "resourceId",
    "key",
    "source_text",
    "source_code",
    "target_text",
    "target_code",
    "digest",
    "type",
    "outdated",
  ];
  const escape = (v: unknown) => {
    const s = v == null ? "" : String(v);
    if (s.includes(",") || s.includes('"') || s.includes("\n")) {
      return `"${s.replace(/"/g, '""')}"`;
    }
    return s;
  };
  const lines = [
    headers.join(","),
    ...rows.map((row) => headers.map((h) => escape(row[h as keyof ShopifyTranslationRow])).join(",")),
  ];
  const blob = new Blob(["\uFEFF" + lines.join("\n")], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `shopify_translations_${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export type ShopifyAltImageRow = {
  product_id: string;
  product_title: string;
  product_status: string;
  image_id: string | null;
  image_url: string | null;
  image_altText: string | null;
  target_text?: string;
  target?: string;
};

export type ShopifyAltStreamChunk =
  | { type: "progress"; count: number }
  | { type: "done"; data: ShopifyAltImageRow[]; count: number }
  | { type: "error"; error: string };

export type MetafieldModuleOption = {
  key: string;
  label: string;
  rootField: string;
};

export type MetafieldNamespaceSummaryRow = {
  resource_module: string;
  namespace: string;
  count: number;
};

export type MetafieldDetailRow = {
  resource_module?: string;
  resource_type: string;
  resource_id: string;
  metafield_id: string;
  namespace: string;
  key: string;
  type: string;
  value: string;
  translation_locale: string;
  translation_value: string;
  translation_outdated: boolean | null;
};

export function fetchMetafieldModules(): Promise<{ modules: MetafieldModuleOption[] }> {
  return apiFetch("/shopify-translation/metafield-modules");
}

export async function queryShopifyAltImages(
  params: {
    shopName: string;
    query?: string | null;
    sortKey?: string | null;
    reverse?: boolean;
  },
  onChunk: (chunk: ShopifyAltStreamChunk) => void,
): Promise<void> {
  const token = getToken();
  const res = await fetch("/api/shopify-translation/alt-query", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(params),
  });

  if (res.status === 401) {
    clearToken();
    window.location.reload();
    throw new Error("Unauthorized");
  }
  if (!res.ok) {
    const body = await res.text();
    try {
      const parsed = JSON.parse(body) as { error?: string };
      throw new Error(parsed.error ?? body);
    } catch (e) {
      if (e instanceof Error && e.message !== body) throw e;
      throw new Error(body || `HTTP ${res.status}`);
    }
  }

  const reader = res.body?.getReader();
  if (!reader) throw new Error("无法读取响应流");

  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      onChunk(JSON.parse(trimmed) as ShopifyAltStreamChunk);
    }
  }

  if (buffer.trim()) {
    onChunk(JSON.parse(buffer.trim()) as ShopifyAltStreamChunk);
  }
}

export function queryMetafieldNamespaceStats(params: {
  shopName: string;
  locale: string;
  modules: string[];
  resourceFirst?: number;
  metafieldFirst?: number;
}): Promise<{
  summary: MetafieldNamespaceSummaryRow[];
  details: MetafieldDetailRow[];
  csvBase64: string;
  csvFilename: string;
  totalMetafields: number;
}> {
  return apiFetch("/shopify-translation/metafield-namespace-stats", {
    method: "POST",
    body: JSON.stringify(params),
  });
}

export function exportAltRowsToCsv(rows: ShopifyAltImageRow[]): void {
  const headers = ["product_id", "image_id", "image_url", "image_altText", "target_text", "target"];
  const escape = (v: unknown) => {
    const s = v == null ? "" : String(v);
    if (s.includes(",") || s.includes('"') || s.includes("\n")) {
      return `"${s.replace(/"/g, '""')}"`;
    }
    return s;
  };
  const lines = [
    headers.join(","),
    ...rows.map((row) => headers.map((h) => escape(row[h as keyof ShopifyAltImageRow])).join(",")),
  ];
  const blob = new Blob(["\uFEFF" + lines.join("\n")], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `shopify_alt_azure_${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export function downloadBase64Csv(csvBase64: string, filename: string): void {
  const byteChars = atob(csvBase64);
  const byteNumbers = new Array(byteChars.length);
  for (let i = 0; i < byteChars.length; i++) byteNumbers[i] = byteChars.charCodeAt(i);
  const byteArray = new Uint8Array(byteNumbers);
  const blob = new Blob([byteArray], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

// --- OpenRouter probe (owner-only server proxy) ---

export type OpenRouterStatus = {
  configured: boolean;
  error?: string;
  keyStatus?: number;
  creditsStatus?: number;
  key?: {
    is_free_tier: unknown;
    limit: unknown;
    limit_remaining: unknown;
    usage: unknown;
    usage_daily: unknown;
    expires_at: unknown;
  } | null;
  credits?: Record<string, unknown> | null;
  keyError?: string | null;
  note?: string;
};

export type OpenRouterModelOption = {
  id: string;
  name: string;
  context_length: number | null;
  pricing: { prompt: string | null; completion: string | null } | null;
  free: boolean;
  provider: string;
  modality?: string | null;
  output_modalities?: string[] | null;
};

export type OpenRouterChatResult = {
  ok: boolean;
  httpStatus: number;
  model: string;
  modelUsed: string | null;
  content: string | null;
  finish_reason: string | null;
  usage: Record<string, unknown> | null;
  error: { code: number | string; message: string; metadata: unknown } | null;
};

export type OpenRouterImageResult = {
  ok: boolean;
  httpStatus: number;
  model: string;
  modelUsed: string | null;
  images: Array<{
    b64: string | null;
    url: string | null;
    mimeType: string | null;
  }>;
  usage: Record<string, unknown> | null;
  error: { code: number | string; message: string; metadata: unknown } | null;
};

export function fetchOpenRouterStatus(): Promise<OpenRouterStatus> {
  return apiFetch("/openrouter-probe/status");
}

export function fetchOpenRouterModels(
  modalities: string = "text",
): Promise<{
  total_count: number;
  models: OpenRouterModelOption[];
  modalities?: string;
}> {
  const qs = new URLSearchParams({ modalities });
  return apiFetch(`/openrouter-probe/models?${qs.toString()}`);
}

export function postOpenRouterChat(body: {
  model: string;
  prompt: string;
  system?: string;
  max_tokens?: number;
  temperature?: number;
}): Promise<OpenRouterChatResult> {
  return apiFetch("/openrouter-probe/chat", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export function postOpenRouterImages(body: {
  model: string;
  prompt: string;
  imageUrl?: string;
  imageBase64?: string;
  mimeType?: string;
  resolution?: string;
  output_format?: string;
  aspect_ratio?: string;
}): Promise<OpenRouterImageResult> {
  return apiFetch("/openrouter-probe/images", {
    method: "POST",
    body: JSON.stringify(body),
  });
}
