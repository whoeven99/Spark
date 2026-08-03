import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { Link, useFetcher, useLoaderData, useLocation, useRevalidator, type SubmitTarget } from "react-router";
import { useAppBridge } from "@shopify/app-bridge-react";
import { useEmbeddedLocationSearch } from "../../hooks/useEmbeddedLocationSearch";
import { useTranslation } from "react-i18next";
import {
  PageHeaderNav,
  PageSurface,
  pageColorTokens,
  pageContentStyle,
  pageFieldLabelStyle,
  pageHintTextStyle,
} from "./pageUiStyles";
import { SegmentedPageTabs } from "../component/shared/SegmentedPageTabs";
import { AdsCatalogTaskCard } from "../component/adsCatalog/AdsCatalogTaskCard";
import { AdsCatalogTaskDetailPage } from "../component/adsCatalog/AdsCatalogTaskDetailPage";
import { GoogleConnectPanels } from "../component/adsCatalog/GoogleConnectPanels";
import { MetaConnectPanels } from "../component/adsCatalog/MetaConnectPanels";
import { TiktokConnectPanels } from "../component/adsCatalog/TiktokConnectPanels";
import { TiktokCatalogPicker } from "../component/adsCatalog/TiktokCatalogPicker";
import { TiktokBoundCatalogInfo } from "../component/adsCatalog/TiktokBoundCatalogInfo";
import {
  GoogleFeedFilters,
  parseList,
  type GoogleFiltersValue,
} from "../component/adsCatalog/GoogleFeedFilters";
import { GmcValidationReport } from "../component/adsCatalog/GmcValidationReport";
import { GmcReviewDetailModal } from "../component/adsCatalog/GmcReviewDetailModal";
import type {
  AdsCatalogPageLoaderData,
  AdsCatalogSyncRequestBody,
  FeedValidationReportView,
  GmcReviewProductView,
} from "../component/adsCatalog/types";
import type { AITaskItem, AITaskStatus } from "../../lib/aiTaskTypes";
import { resolveAdsCatalogAuthResult } from "../../lib/adsCatalogOAuthResult";

type Tab = "sync" | "credentials" | "tasks";
type Platform = "facebook" | "google" | "tiktok";

const sectionStyle = {
  border: `1px solid ${pageColorTokens.border}`,
  borderRadius: pageColorTokens.radiusCard,
  padding: 20,
  background: pageColorTokens.surface,
  boxShadow: pageColorTokens.shadowCard,
  display: "flex",
  flexDirection: "column" as const,
  gap: 16,
};

const inputStyle = {
  width: "100%",
  padding: "10px 12px",
  borderRadius: pageColorTokens.radiusControl,
  border: `1px solid ${pageColorTokens.borderInput}`,
  fontSize: 13,
  fontFamily: "inherit",
};

const buttonPrimary = {
  padding: "10px 18px",
  borderRadius: pageColorTokens.radiusControl,
  background: pageColorTokens.brandGreen,
  color: "#fff",
  border: "none",
  fontSize: 13,
  fontWeight: 700,
  cursor: "pointer",
};

const buttonSecondary = {
  padding: "10px 18px",
  borderRadius: pageColorTokens.radiusControl,
  background: pageColorTokens.surface,
  color: pageColorTokens.textPrimary,
  border: `1px solid ${pageColorTokens.borderSubtle}`,
  fontSize: 13,
  fontWeight: 600,
  cursor: "pointer",
};

const DEFAULT_FILTERS: GoogleFiltersValue = {
  tags: "",
  productTypes: "",
  vendors: "",
  inStockOnly: false,
  contentLanguage: "en",
  targetCountry: "US",
  googleProductCategory: "",
};

function readTabFromSearch(search: string): Tab | null {
  const params = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
  const tab = params.get("tab");
  if (tab === "sync" || tab === "credentials" || tab === "tasks") return tab;
  return null;
}

function readTaskIdFromSearch(search: string): string | null {
  const params = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
  return params.get("taskId");
}

function syncAdsCatalogPageSearch(
  locationSearch: string,
  updates: { tab?: Tab; taskId?: string | null },
) {
  if (typeof window === "undefined") return;
  const params = new URLSearchParams(
    locationSearch.startsWith("?") ? locationSearch.slice(1) : locationSearch,
  );
  if (updates.tab === "sync") {
    params.delete("tab");
  } else if (updates.tab) {
    params.set("tab", updates.tab);
  }
  if (updates.taskId) {
    params.set("taskId", updates.taskId);
  } else if (updates.taskId === null) {
    params.delete("taskId");
  }
  const query = params.toString();
  const nextSearch = query ? `?${query}` : "";
  if (window.location.search === nextSearch) return;
  window.history.replaceState(null, "", `${window.location.pathname}${nextSearch}`);
}

type PendingSyncContext = {
  platform: Platform;
  tiktokUploadMethod?: "product_upload" | "product_file";
  bindingMode?: string;
};

interface GoogleStatusData {
  ok?: boolean;
  accountSuspended?: boolean;
  accountRestricted?: boolean;
  products?: GmcReviewProductView[];
  lastCheckedAt?: string | null;
  adsLink?: {
    bound: boolean;
    customerId: string | null;
    state: "not_linked" | "pending" | "linked" | "failed" | null;
    error?: string;
  };
}

export function AdsCatalogPage() {
  const { t, i18n } = useTranslation();
  const shopify = useAppBridge();
  const location = useLocation();
  const locationSearch = useEmbeddedLocationSearch();
  const loaderData = useLoaderData<AdsCatalogPageLoaderData>();
  const revalidator = useRevalidator();
  const credentials = loaderData.credentials;
  const inferredTiktokRegion = loaderData.inferredTiktokRegion;
  const taskPageSize = loaderData.initialTaskPage.pageSize;

  const [tab, setTabState] = useState<Tab>(() => readTabFromSearch(location.search) ?? "sync");
  const [platform, setPlatform] = useState<Platform>("google");
  const [productIdsRaw, setProductIdsRaw] = useState("");
  const [filters, setFilters] = useState<GoogleFiltersValue>(DEFAULT_FILTERS);
  const [tasks, setTasks] = useState<AITaskItem[]>(loaderData.initialTaskPage.tasks);
  const [selectedTaskId, setSelectedTaskIdState] = useState<string | null>(() =>
    readTaskIdFromSearch(location.search),
  );
  const [highlightedTaskId, setHighlightedTaskId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [fbPreview, setFbPreview] = useState<unknown[] | null>(null);
  const [googleReport, setGoogleReport] = useState<FeedValidationReportView | null>(null);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [reviewPlatform, setReviewPlatform] = useState<"facebook" | "google">("google");
  const [authBanner, setAuthBanner] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const [previewPlatform, setPreviewPlatform] = useState<Platform | null>(null);
  const [tiktokSyncBusy, setTiktokSyncBusy] = useState(false);
  const [tiktokSyncError, setTiktokSyncError] = useState<string | null>(null);

  const syncFetcher = useFetcher<{
    success?: boolean;
    taskId?: string;
    batchId?: string;
    platform?: Platform;
    errorMsg?: string;
    productCount?: number;
  }>();
  const previewFetcher = useFetcher<{
    ok?: boolean;
    error?: string;
    platform?: Platform;
    preview?: unknown[];
    report?: FeedValidationReportView;
    total?: number;
  }>();
  const statusFetcher = useFetcher<GoogleStatusData>();
  const metaStatusFetcher = useFetcher<GoogleStatusData>();
  const [refreshingStatus, setRefreshingStatus] = useState(false);
  const pendingSyncRef = useRef<PendingSyncContext | null>(null);
  const lastHandledTaskIdRef = useRef<string | undefined>(undefined);

  const setTab = useCallback(
    (nextTab: Tab) => {
      setTabState(nextTab);
      if (nextTab !== "tasks") {
        setSelectedTaskIdState(null);
        syncAdsCatalogPageSearch(locationSearch, { tab: nextTab, taskId: null });
        return;
      }
      syncAdsCatalogPageSearch(locationSearch, { tab: nextTab });
    },
    [locationSearch],
  );

  const setSelectedTaskId = useCallback(
    (taskId: string | null) => {
      setSelectedTaskIdState(taskId);
      if (taskId) {
        setTabState("tasks");
        syncAdsCatalogPageSearch(locationSearch, { tab: "tasks", taskId });
      } else {
        syncAdsCatalogPageSearch(locationSearch, { tab: "tasks", taskId: null });
      }
    },
    [locationSearch],
  );

  const runningCount = useMemo(
    () => tasks.filter((task) => task.status === "running").length,
    [tasks],
  );

  const productIds = useMemo(
    () =>
      productIdsRaw
        .split(/[,\n\s]+/)
        .map((s) => s.trim())
        .filter(Boolean),
    [productIdsRaw],
  );

  const googleStatus = statusFetcher.data;
  const accountSuspended = Boolean(googleStatus?.accountSuspended);
  const adsLink = googleStatus?.adsLink ?? null;
  const reviewProducts = googleStatus?.products ?? [];
  const disapprovedCount = reviewProducts.filter((p) => p.status === "disapproved").length;

  const metaStatus = metaStatusFetcher.data;
  const metaAccountRestricted = Boolean(metaStatus?.accountRestricted);
  const metaReviewProducts = metaStatus?.products ?? [];
  const metaDisapprovedCount = metaReviewProducts.filter((p) => p.status === "disapproved").length;

  // Products / last-checked time shown in the review modal depend on which
  // platform's task (or banner) opened it.
  const activeReviewProducts = reviewPlatform === "facebook" ? metaReviewProducts : reviewProducts;
  const activeLastChecked =
    reviewPlatform === "facebook"
      ? metaStatus?.lastCheckedAt ?? null
      : googleStatus?.lastCheckedAt ?? null;

  // Load GMC + Meta catalog status (suspension banner, ads link, review list) on mount.
  useEffect(() => {
    statusFetcher.load(`/api/ads-catalog/google-status${locationSearch}`);
    metaStatusFetcher.load(`/api/ads-catalog/meta-status${locationSearch}`);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Surface OAuth callback outcome and route to the right tab.
  const applyAuthResult = useCallback(
    (input: {
      gmc?: string | null;
      ads?: string | null;
      meta?: string | null;
      tiktok?: string | null;
      reason?: string | null;
    }) => {
      const result = resolveAdsCatalogAuthResult({ ...input, t });
      if (result.action === "none") return;
      if (result.banner) setAuthBanner(result.banner);
      setTab(result.tab);
      revalidator.revalidate();
    },
    [revalidator, t],
  );

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    applyAuthResult({
      gmc: params.get("gmcAuth"),
      ads: params.get("adsAuth"),
      meta: params.get("metaAuth"),
      tiktok: params.get("tiktokAuth"),
      reason: params.get("reason"),
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.search]);

  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      const data = event.data as {
        type?: string;
        gmcAuth?: string;
        adsAuth?: string;
        metaAuth?: string;
        tiktokAuth?: string;
        reason?: string;
      } | null;
      if (!data?.type) return;

      if (data.type === "gmc_oauth") {
        applyAuthResult({ gmc: data.gmcAuth, reason: data.reason });
      } else if (data.type === "ads_catalog_oauth") {
        applyAuthResult({ ads: data.adsAuth, reason: data.reason });
      } else if (data.type === "meta_catalog_oauth") {
        applyAuthResult({ meta: data.metaAuth, reason: data.reason });
      } else if (data.type === "tiktok_catalog_oauth") {
        applyAuthResult({ tiktok: data.tiktokAuth, reason: data.reason });
      }
    };
    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, [applyAuthResult]);

  useEffect(() => {
    if (syncFetcher.state !== "idle" || !syncFetcher.data?.success) return;

    const data = syncFetcher.data;
    if (!data.taskId || !data.batchId) return;
    if (data.taskId === lastHandledTaskIdRef.current) return;

    lastHandledTaskIdRef.current = data.taskId;
    const pending = pendingSyncRef.current;
    pendingSyncRef.current = null;

    const taskPlatform = data.platform ?? pending?.platform ?? platform;
    const tiktokUploadMethod = pending?.tiktokUploadMethod;

    const now = new Date().toISOString();
    const optimisticTask: AITaskItem = {
      id: data.taskId,
      batchId: data.batchId,
      shop: "",
      taskType: "ads_catalog_sync",
      status: "running",
      config: {
        platform: taskPlatform,
        productIds: productIds.length > 0 ? productIds : null,
        totalProducts: data.productCount ?? 0,
        ...(pending?.bindingMode ? { bindingMode: pending.bindingMode } : {}),
        ...(tiktokUploadMethod ? { tiktokUploadMethod } : {}),
      },
      result: null,
      estimatedCredits: null,
      actualCredits: null,
      startedAt: now,
      completedAt: null,
      errorMsg: null,
      createdAt: now,
      updatedAt: now,
    };

    setTasks((prev) =>
      [optimisticTask, ...prev.filter((task) => task.id !== optimisticTask.id)].slice(
        0,
        taskPageSize,
      ),
    );

    const openDetail =
      taskPlatform === "tiktok" && tiktokUploadMethod === "product_file";
    if (openDetail) {
      setSelectedTaskId(data.taskId);
    } else {
      setSelectedTaskIdState(null);
      setHighlightedTaskId(data.taskId);
      setTab("tasks");
    }

    shopify.toast.show(t("adsCatalog.toastTaskCreated"));
    revalidator.revalidate();
    statusFetcher.load(`/api/ads-catalog/google-status${locationSearch}`);
    metaStatusFetcher.load(`/api/ads-catalog/meta-status${locationSearch}`);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [syncFetcher.data, syncFetcher.state]);

  useEffect(() => {
    if (syncFetcher.state !== "idle" || syncFetcher.data?.success !== false) return;
    if (!syncFetcher.data.errorMsg) return;
    if (platform === "tiktok") {
      setTiktokSyncError(syncFetcher.data.errorMsg);
    }
  }, [syncFetcher.data, syncFetcher.state, platform]);

  useEffect(() => {
    if (!highlightedTaskId) return;
    const timer = window.setTimeout(() => setHighlightedTaskId(null), 5000);
    return () => window.clearTimeout(timer);
  }, [highlightedTaskId]);

  useEffect(() => {
    const urlTaskId = readTaskIdFromSearch(location.search);
    if (!urlTaskId) return;
    setTabState("tasks");
    setSelectedTaskIdState(urlTaskId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (previewFetcher.state === "idle" && previewFetcher.data) {
      const responsePlatform = previewFetcher.data.platform ?? platform;
      // 忽略与当前选中平台不一致的响应（例如切换平台后迟到的 Google 预览）。
      if (responsePlatform !== platform) return;

      if (previewFetcher.data.ok) {
        setPreviewError(null);
        setPreviewPlatform(responsePlatform);
        if (responsePlatform === "google") {
          setGoogleReport(previewFetcher.data.report ?? null);
          setFbPreview(null);
        } else {
          setFbPreview(previewFetcher.data.preview ?? []);
          setGoogleReport(null);
        }
      } else {
        setPreviewError(previewFetcher.data.error ?? "Preview failed");
        setPreviewPlatform(null);
        setGoogleReport(null);
        setFbPreview(null);
      }
    }
  }, [previewFetcher.data, previewFetcher.state, platform]);

  useEffect(() => {
    setTasks(loaderData.initialTaskPage.tasks);
  }, [loaderData.initialTaskPage.tasks]);

  // 切换平台时清空另一平台的预览结果，避免残留。
  useEffect(() => {
    setPreviewError(null);
    setPreviewPlatform(null);
    setGoogleReport(null);
    setFbPreview(null);
  }, [platform]);

  const selectedTask = useMemo(
    () => tasks.find((task) => task.id === selectedTaskId) ?? null,
    [selectedTaskId, tasks],
  );

  const credentialReady =
    platform === "facebook"
      ? credentials.meta.connected
      : platform === "tiktok"
        ? credentials.tiktok.connected
        : credentials.googleMerchant.connected;

  function buildSyncBody(): AdsCatalogSyncRequestBody {
    const body: AdsCatalogSyncRequestBody = { platform, filters: { tags: [], productTypes: [], vendors: [], inStockOnly: false } };
    if (productIds.length > 0) body.productIds = productIds;
    // 筛选条件对两个平台都生效（生成对应平台的 feed）。
    body.filters = {
      tags: parseList(filters.tags),
      productTypes: parseList(filters.productTypes),
      vendors: parseList(filters.vendors),
      inStockOnly: filters.inStockOnly,
    };
    if (platform === "google") {
      body.contentLanguage = filters.contentLanguage;
      body.targetCountry = filters.targetCountry;
      if (filters.googleProductCategory.trim()) {
        body.googleProductCategory = filters.googleProductCategory.trim();
      }
    }
    return body;
  }

  function handlePreview() {
    const body = buildSyncBody();
    body.limit = 5;
    setPreviewError(null);
    previewFetcher.submit(body as unknown as SubmitTarget, {
      method: "POST",
      encType: "application/json",
      action: `/api/ads-catalog/preview${locationSearch}`,
    });
  }

  async function handleSync() {
    if (platform === "google" && googleReport) {
      if (googleReport.hasErrors > 0) {
        const proceed = window.confirm(
          t("adsCatalog.confirmErrors", {
            errors: googleReport.hasErrors,
            ok: googleReport.totalProducts - googleReport.hasErrors,
          }),
        );
        if (!proceed) return;
      } else if (googleReport.hasWarnings > 0) {
        const proceed = window.confirm(
          t("adsCatalog.confirmWarnings", { warnings: googleReport.hasWarnings }),
        );
        if (!proceed) return;
      }
    }

    if (platform === "tiktok") {
      if (!credentialReady || tiktokSyncBusy || syncFetcher.state !== "idle") return;

      setTiktokSyncBusy(true);
      setTiktokSyncError(null);
      try {
        const preflightParams = new URLSearchParams(
          locationSearch.startsWith("?") ? locationSearch.slice(1) : locationSearch,
        );
        preflightParams.set("uploadMethod", "product_file");
        const preflightResp = await fetch(
          `/api/ads-catalog/tiktok-sync-preflight?${preflightParams.toString()}`,
          { headers: { Accept: "application/json" } },
        );
        const preflight = (await preflightResp.json().catch(() => ({}))) as {
          ok?: boolean;
          canSync?: boolean;
          error?: string;
          warnings?: string[];
        };
        if (!preflight.canSync) {
          setTiktokSyncError(preflight.error ?? t("adsCatalog.authError"));
          return;
        }
        if (preflight.warnings && preflight.warnings.length > 0) {
          const proceed = window.confirm(
            `${t("adsCatalog.tiktokSyncPreflightTitle")}\n\n${preflight.warnings.join("\n\n")}`,
          );
          if (!proceed) return;
        }

        const body = buildSyncBody();
        body.tiktokUploadMethod = "product_file";
        pendingSyncRef.current = {
          platform: "tiktok",
          tiktokUploadMethod: "product_file",
          bindingMode: credentials.tiktok.bindingMode || undefined,
        };
        syncFetcher.submit(body as unknown as SubmitTarget, {
          method: "POST",
          encType: "application/json",
          action: `/api/ads-catalog/sync${locationSearch}`,
        });
      } catch (e) {
        setTiktokSyncError(e instanceof Error ? e.message : t("adsCatalog.authError"));
      } finally {
        setTiktokSyncBusy(false);
      }
      return;
    }

    pendingSyncRef.current = { platform };
    syncFetcher.submit(buildSyncBody() as unknown as SubmitTarget, {
      method: "POST",
      encType: "application/json",
      action: `/api/ads-catalog/sync${locationSearch}`,
    });
  }

  function handleTaskUpdated(taskId: string, status: AITaskStatus, result?: Record<string, unknown>) {
    setTasks((prev) =>
      prev.map((tk) =>
        tk.id === taskId
          ? { ...tk, status, result: (result as AITaskItem["result"]) ?? tk.result }
          : tk,
      ),
    );
  }

  async function handleDelete(taskId: string) {
    setDeletingId(taskId);
    try {
      const resp = await fetch(`/api/ai-task${locationSearch}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "delete", taskId }),
      });
      if (resp.ok) {
        setTasks((prev) => prev.filter((task) => task.id !== taskId));
        setSelectedTaskIdState((prev) => {
          if (prev !== taskId) return prev;
          syncAdsCatalogPageSearch(locationSearch, { tab: "tasks", taskId: null });
          return null;
        });
        revalidator.revalidate();
      }
    } finally {
      setDeletingId(null);
    }
  }

  async function handleRefreshStatus() {
    const endpoint =
      reviewPlatform === "facebook"
        ? "/api/ads-catalog/meta-status"
        : "/api/ads-catalog/google-status";
    setRefreshingStatus(true);
    try {
      await fetch(`${endpoint}${locationSearch}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      if (reviewPlatform === "facebook") {
        metaStatusFetcher.load(`${endpoint}${locationSearch}`);
      } else {
        statusFetcher.load(`${endpoint}${locationSearch}`);
      }
    } finally {
      setRefreshingStatus(false);
    }
  }

  return (
    <PageSurface>
      <PageHeaderNav
        workspaceOnly
        backLabel={t("common.backToPrevious", {
          defaultValue: i18n.language.toLowerCase().startsWith("zh") ? "返回工作台" : "Back",
        })}
        title={t("adsCatalog.pageTitle")}
        subtitle={t("adsCatalog.pageSubtitle")}
      />
      <div style={pageContentStyle}>
        {accountSuspended && (
          <div
            style={{
              background: "#fdecec",
              color: "#c0392b",
              padding: "12px 16px",
              borderRadius: pageColorTokens.radiusControl,
              fontSize: 13,
              display: "flex",
              flexWrap: "wrap",
              gap: 8,
              alignItems: "center",
            }}
          >
            {t("adsCatalog.accountSuspendedBanner")}
            <a href="https://merchants.google.com/" target="_blank" rel="noreferrer" style={{ color: "#c0392b", fontWeight: 700 }}>
              {t("adsCatalog.goToGmc")}
            </a>
          </div>
        )}

        {metaAccountRestricted && (
          <div
            style={{
              background: "#fdecec",
              color: "#c0392b",
              padding: "12px 16px",
              borderRadius: pageColorTokens.radiusControl,
              fontSize: 13,
              display: "flex",
              flexWrap: "wrap",
              gap: 8,
              alignItems: "center",
            }}
          >
            {t("adsCatalog.metaAccountRestrictedBanner")}
            <a
              href="https://business.facebook.com/commerce"
              target="_blank"
              rel="noreferrer"
              style={{ color: "#c0392b", fontWeight: 700 }}
            >
              {t("adsCatalog.goToMetaCommerce")}
            </a>
          </div>
        )}

        {authBanner && (
          <div
            style={{
              background: authBanner.tone === "ok" ? pageColorTokens.brandGreenLight : "#fdecec",
              color: authBanner.tone === "ok" ? pageColorTokens.brandGreenDeep : "#c0392b",
              padding: "10px 14px",
              borderRadius: pageColorTokens.radiusControl,
              fontSize: 13,
            }}
          >
            {authBanner.text}
          </div>
        )}

        <SegmentedPageTabs
          activeTab={tab}
          onTabChange={setTab}
          ariaLabel={t("adsCatalog.pageNavAriaLabel")}
          items={[
            { key: "sync", label: t("adsCatalog.tabSync") },
            { key: "credentials", label: t("adsCatalog.tabCredentials") },
            {
              key: "tasks",
              label: t("adsCatalog.tabTasks"),
              badgeCount: runningCount > 0 ? runningCount : undefined,
            },
          ]}
        />

        {tab === "sync" && (
          <div style={sectionStyle}>
            <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>
              {t("adsCatalog.syncSectionTitle")}
            </h2>
            <p style={pageHintTextStyle}>
              {platform === "tiktok" && credentials.tiktok.bindingMode === "shopify_official"
                ? t("adsCatalog.syncSectionHintTiktokOfficial")
                : platform === "tiktok" && credentials.tiktok.bindingMode === "api_managed"
                  ? t("adsCatalog.syncSectionHintTiktokApi")
                  : t("adsCatalog.syncSectionHint")}
            </p>

            <div>
              <label style={pageFieldLabelStyle}>{t("adsCatalog.fieldPlatform")}</label>
              <div style={{ display: "flex", gap: 12, marginTop: 6, flexWrap: "wrap" }}>
                <button
                  type="button"
                  onClick={() => setPlatform("google")}
                  style={platform === "google" ? buttonPrimary : buttonSecondary}
                >
                  {t("adsCatalog.platformGoogle")}
                </button>
                <button
                  type="button"
                  onClick={() => setPlatform("facebook")}
                  style={platform === "facebook" ? buttonPrimary : buttonSecondary}
                >
                  {t("adsCatalog.platformFacebook")}
                </button>
                <button
                  type="button"
                  onClick={() => setPlatform("tiktok")}
                  style={platform === "tiktok" ? buttonPrimary : buttonSecondary}
                >
                  {t("adsCatalog.platformTiktok")}
                </button>
              </div>
            </div>

            {platform === "tiktok" && credentials.tiktok.connected && (
              <>
                <TiktokBoundCatalogInfo
                  catalogId={credentials.tiktok.catalogId}
                  catalogName={loaderData.boundTiktokCatalogName}
                  bindingMode={credentials.tiktok.bindingMode}
                  currency={loaderData.boundTiktokCatalogCurrency}
                  regionCode={loaderData.boundTiktokCatalogRegion}
                  channel={loaderData.boundTiktokCatalogChannel}
                  locationSearch={locationSearch}
                  inferredTiktokRegion={inferredTiktokRegion}
                  catalogRegionCode={credentials.tiktok.catalogRegionCode}
                  shopLabel={loaderData.shopDomain.split(".")[0]}
                  onChanged={() => revalidator.revalidate()}
                />
                <TiktokCatalogPicker
                  variant="sync"
                  locationSearch={locationSearch}
                  boundCatalogId={credentials.tiktok.catalogId}
                  boundBindingMode={credentials.tiktok.bindingMode}
                  boundChannel={loaderData.boundTiktokCatalogChannel}
                  onChanged={() => revalidator.revalidate()}
                />
              </>
            )}

            <div>
              <label style={pageFieldLabelStyle}>{t("adsCatalog.fieldProductIds")}</label>
              <textarea
                rows={2}
                value={productIdsRaw}
                onChange={(e) => setProductIdsRaw(e.target.value)}
                placeholder={t("adsCatalog.fieldProductIdsPlaceholder")}
                style={{ ...inputStyle, fontFamily: "ui-monospace, monospace", marginTop: 6 }}
              />
              <p style={pageHintTextStyle}>{t("adsCatalog.fieldProductIdsHint")}</p>
            </div>

            <GoogleFeedFilters
              value={filters}
              onChange={setFilters}
              showGoogleFields={platform === "google"}
            />

            {!credentialReady && (
              <div
                style={{
                  background: pageColorTokens.criticalBg,
                  color: pageColorTokens.criticalText,
                  padding: "10px 12px",
                  borderRadius: pageColorTokens.radiusControl,
                  fontSize: 13,
                }}
              >
                {t("adsCatalog.credentialMissing")}
              </div>
            )}

            <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
              <button
                type="button"
                onClick={handlePreview}
                disabled={previewFetcher.state !== "idle"}
                style={buttonSecondary}
              >
                {previewFetcher.state === "submitting"
                  ? t("adsCatalog.actionPreviewing")
                  : t("adsCatalog.actionPreview")}
              </button>
              <button
                type="button"
                onClick={() => void handleSync()}
                disabled={
                  !credentialReady || syncFetcher.state !== "idle" || tiktokSyncBusy
                }
                style={{
                  ...buttonPrimary,
                  opacity: !credentialReady ? 0.6 : 1,
                  cursor: !credentialReady ? "not-allowed" : "pointer",
                }}
              >
                {platform === "tiktok" && tiktokSyncBusy
                  ? t("adsCatalog.actionSyncTiktokFeedBusy")
                  : syncFetcher.state === "submitting"
                    ? t("adsCatalog.actionSyncing")
                    : t("adsCatalog.actionSync")}
              </button>
            </div>
            {platform === "tiktok" && (
              <p style={pageHintTextStyle}>{t("adsCatalog.tiktokFeedSyncHint")}</p>
            )}
            {platform === "tiktok" &&
              credentials.tiktok.bindingMode === "shopify_official" && (
                <div
                  style={{
                    background: pageColorTokens.surfaceMuted,
                    border: `1px solid ${pageColorTokens.borderSubtle}`,
                    color: pageColorTokens.textPrimary,
                    padding: "10px 12px",
                    borderRadius: pageColorTokens.radiusControl,
                    fontSize: 13,
                    lineHeight: 1.45,
                  }}
                >
                  {t("adsCatalog.tiktokOfficialSyncFootnote")}
                </div>
              )}
            {tiktokSyncError && <div style={errorBoxStyle}>{tiktokSyncError}</div>}

            {previewError && (
              <div style={errorBoxStyle}>{previewError}</div>
            )}
            {platform === "google" && previewPlatform === "google" && googleReport && (
              <GmcValidationReport report={googleReport} />
            )}
            {(platform === "facebook" || platform === "tiktok") &&
              previewPlatform === platform &&
              fbPreview &&
              fbPreview.length > 0 && (
              <pre style={previewPreStyle}>{JSON.stringify(fbPreview, null, 2)}</pre>
            )}
            {syncFetcher.data?.errorMsg && (
              <div style={errorBoxStyle}>{syncFetcher.data.errorMsg}</div>
            )}
          </div>
        )}

        {tab === "credentials" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <div
              style={{
                ...sectionStyle,
                padding: "14px 16px",
                background: pageColorTokens.surfaceMuted,
              }}
            >
              <div style={{ fontSize: 13, fontWeight: 600 }}>{t("adsCatalog.insightsGuideTitle")}</div>
              <div style={pageHintTextStyle}>{t("adsCatalog.insightsGuideBody")}</div>
              <Link
                to={`/app/settings/ads-insights${locationSearch}`}
                style={{ color: pageColorTokens.brandBlueDark, fontWeight: 600, fontSize: 13 }}
              >
                {t("adsCatalog.insightsGuideLink")}
              </Link>
            </div>
            <GoogleConnectPanels
              credentials={credentials}
              adsLink={adsLink}
              locationSearch={locationSearch}
              languageCode={i18n.language}
              shopDomain={loaderData.shopDomain}
              shopifyApiKey={loaderData.shopifyApiKey}
              onChanged={() => {
                revalidator.revalidate();
                statusFetcher.load(`/api/ads-catalog/google-status${locationSearch}`);
              }}
            />
            <MetaConnectPanels
              credentials={credentials}
              locationSearch={locationSearch}
              languageCode={i18n.language}
              onChanged={() => {
                revalidator.revalidate();
                metaStatusFetcher.load(`/api/ads-catalog/meta-status${locationSearch}`);
              }}
            />
            <TiktokConnectPanels
              credentials={credentials}
              inferredTiktokRegion={inferredTiktokRegion}
              locationSearch={locationSearch}
              languageCode={i18n.language}
              shopDomain={loaderData.shopDomain}
              shopifyApiKey={loaderData.shopifyApiKey}
              onChanged={() => {
                revalidator.revalidate();
              }}
            />
          </div>
        )}

        {tab === "tasks" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {disapprovedCount > 0 && (
              <div
                style={{
                  ...sectionStyle,
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: 12,
                }}
              >
                <span style={{ color: "#c0392b", fontWeight: 600, fontSize: 13 }}>
                  {t("adsCatalog.platformGoogle")}
                  {" · "}
                  {t("adsCatalog.reviewBadge", { count: disapprovedCount })}
                </span>
                <button
                  type="button"
                  style={buttonSecondary}
                  onClick={() => {
                    setReviewPlatform("google");
                    setReviewOpen(true);
                  }}
                >
                  {t("common.viewDetail")}
                </button>
              </div>
            )}
            {metaDisapprovedCount > 0 && (
              <div
                style={{
                  ...sectionStyle,
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: 12,
                }}
              >
                <span style={{ color: "#c0392b", fontWeight: 600, fontSize: 13 }}>
                  {t("adsCatalog.platformFacebook")}
                  {" · "}
                  {t("adsCatalog.reviewBadge", { count: metaDisapprovedCount })}
                </span>
                <button
                  type="button"
                  style={buttonSecondary}
                  onClick={() => {
                    setReviewPlatform("facebook");
                    setReviewOpen(true);
                  }}
                >
                  {t("common.viewDetail")}
                </button>
              </div>
            )}
            {selectedTask ? (
              <AdsCatalogTaskDetailPage
                task={selectedTask}
                locationSearch={locationSearch}
                onBack={() => setSelectedTaskId(null)}
                onTaskUpdated={handleTaskUpdated}
              />
            ) : tasks.length === 0 ? (
              <div style={{ ...sectionStyle, alignItems: "center", textAlign: "center" }}>
                <p style={{ color: pageColorTokens.textSecondary }}>{t("adsCatalog.tasksEmpty")}</p>
              </div>
            ) : (
              tasks.map((task) => (
                <AdsCatalogTaskCard
                  key={task.id}
                  task={task}
                  locationSearch={locationSearch}
                  highlighted={task.id === highlightedTaskId}
                  onDelete={() => void handleDelete(task.id)}
                  onOpenDetail={() => setSelectedTaskId(task.id)}
                  onOpenReview={() => {
                    const rawPlatform = (task.config as Record<string, unknown>)?.platform;
                    const taskPlatform =
                      rawPlatform === "google"
                        ? "google"
                        : rawPlatform === "facebook"
                          ? "facebook"
                          : "facebook";
                    setReviewPlatform(taskPlatform);
                    setReviewOpen(true);
                  }}
                  onTaskUpdated={handleTaskUpdated}
                  deleting={deletingId === task.id}
                />
              ))
            )}
          </div>
        )}
      </div>

      {reviewOpen && (reviewPlatform === "google" || reviewPlatform === "facebook") && (
        <GmcReviewDetailModal
          platform={reviewPlatform}
          products={activeReviewProducts}
          lastCheckedAt={activeLastChecked}
          refreshing={refreshingStatus}
          onRefresh={() => void handleRefreshStatus()}
          onClose={() => setReviewOpen(false)}
        />
      )}
    </PageSurface>
  );
}

const errorBoxStyle: CSSProperties = {
  background: pageColorTokens.criticalBg,
  color: pageColorTokens.criticalText,
  padding: 10,
  borderRadius: pageColorTokens.radiusControl,
  fontSize: 13,
};

const previewPreStyle: CSSProperties = {
  background: pageColorTokens.surfaceMuted,
  border: `1px solid ${pageColorTokens.border}`,
  borderRadius: pageColorTokens.radiusControl,
  padding: 12,
  fontSize: 12,
  maxHeight: 320,
  overflow: "auto",
};
