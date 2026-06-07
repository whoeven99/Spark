const TOKEN_KEY = "spark_admin_token";
const ROLE_KEY = "spark_admin_role";

export type AdminRole = "owner" | "user";

export function getToken(): string {
  return localStorage.getItem(TOKEN_KEY) ?? "";
}

export function setToken(token: string): void {
  localStorage.setItem(TOKEN_KEY, token);
}

export function clearToken(): void {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(ROLE_KEY);
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
  createdBy: string;
  createdAt: string;
  updatedAt: string;
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
