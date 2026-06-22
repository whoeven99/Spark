import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { useFetcher, useLoaderData, useLocation, useRevalidator, type SubmitTarget } from "react-router";
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

interface GoogleStatusData {
  ok?: boolean;
  accountSuspended?: boolean;
  accountRestricted?: boolean;
  products?: GmcReviewProductView[];
  lastCheckedAt?: string | null;
  adsLink?: { bound: boolean; customerId: string | null; linked: boolean | null };
}

export function AdsCatalogPage() {
  const { t, i18n } = useTranslation();
  const location = useLocation();
  const locationSearch = useEmbeddedLocationSearch();
  const loaderData = useLoaderData<AdsCatalogPageLoaderData>();
  const revalidator = useRevalidator();
  const credentials = loaderData.credentials;

  const [tab, setTab] = useState<Tab>("sync");
  const [platform, setPlatform] = useState<Platform>("google");
  const [productIdsRaw, setProductIdsRaw] = useState("");
  const [filters, setFilters] = useState<GoogleFiltersValue>(DEFAULT_FILTERS);
  const [tasks, setTasks] = useState<AITaskItem[]>(loaderData.initialTaskPage.tasks);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [fbPreview, setFbPreview] = useState<unknown[] | null>(null);
  const [googleReport, setGoogleReport] = useState<FeedValidationReportView | null>(null);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [reviewPlatform, setReviewPlatform] = useState<"facebook" | "google">("google");
  const [authBanner, setAuthBanner] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const [previewPlatform, setPreviewPlatform] = useState<Platform | null>(null);

  const syncFetcher = useFetcher<{
    success?: boolean;
    taskId?: string;
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
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const gmc = params.get("gmcAuth");
    const ads = params.get("adsAuth");
    const meta = params.get("metaAuth");
    const tiktok = params.get("tiktokAuth");
    const reason = params.get("reason");
    if (gmc === "select" || ads === "select" || meta === "select" || tiktok === "select") {
      setTab("credentials");
      revalidator.revalidate();
    } else if (gmc === "success" || ads === "success" || meta === "success" || tiktok === "success") {
      setAuthBanner({ tone: "ok", text: t("adsCatalog.authSuccess") });
      setTab("credentials");
      revalidator.revalidate();
    } else if (gmc === "error" || ads === "error" || meta === "error" || tiktok === "error") {
      setAuthBanner({ tone: "error", text: reason || t("adsCatalog.authError") });
      setTab("credentials");
    } else if (gmc === "cancelled" || ads === "cancelled" || meta === "cancelled" || tiktok === "cancelled") {
      setAuthBanner({ tone: "error", text: t("adsCatalog.authCancelled") });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.search]);

  useEffect(() => {
    if (syncFetcher.state === "idle" && syncFetcher.data?.success) {
      setTab("tasks");
      revalidator.revalidate();
      statusFetcher.load(`/api/ads-catalog/google-status${locationSearch}`);
      metaStatusFetcher.load(`/api/ads-catalog/meta-status${locationSearch}`);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [syncFetcher.data, syncFetcher.state]);

  // TikTok does not yet have a dedicated status endpoint; revalidate loader on sync success.

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

  // 切换平台时清空另一平台的预览结果，避免 Google 校验报告残留在 Facebook 下。
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

  function handleSync() {
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
        setSelectedTaskId((prev) => (prev === taskId ? null : prev));
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
            { key: "tasks", label: t("adsCatalog.tabTasks") },
          ]}
        />

        {tab === "sync" && (
          <div style={sectionStyle}>
            <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>
              {t("adsCatalog.syncSectionTitle")}
            </h2>
            <p style={pageHintTextStyle}>{t("adsCatalog.syncSectionHint")}</p>

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

            <div style={{ display: "flex", gap: 12 }}>
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
                onClick={handleSync}
                disabled={!credentialReady || syncFetcher.state !== "idle"}
                style={{
                  ...buttonPrimary,
                  opacity: !credentialReady ? 0.6 : 1,
                  cursor: !credentialReady ? "not-allowed" : "pointer",
                }}
              >
                {syncFetcher.state === "submitting"
                  ? t("adsCatalog.actionSyncing")
                  : t("adsCatalog.actionSync")}
              </button>
            </div>

            {previewError && (
              <div style={errorBoxStyle}>{previewError}</div>
            )}
            {platform === "google" && previewPlatform === "google" && googleReport && (
              <GmcValidationReport report={googleReport} />
            )}
            {platform === "facebook" && previewPlatform === "facebook" && fbPreview && fbPreview.length > 0 && (
              <pre style={previewPreStyle}>{JSON.stringify(fbPreview, null, 2)}</pre>
            )}
            {syncFetcher.data?.errorMsg && (
              <div style={errorBoxStyle}>{syncFetcher.data.errorMsg}</div>
            )}
          </div>
        )}

        {tab === "credentials" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <GoogleConnectPanels
              credentials={credentials}
              adsLink={adsLink}
              locationSearch={locationSearch}
              languageCode={i18n.language}
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
              locationSearch={locationSearch}
              languageCode={i18n.language}
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
