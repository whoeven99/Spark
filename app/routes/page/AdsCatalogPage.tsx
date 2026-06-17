import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { useFetcher, useLoaderData, useLocation, useRevalidator } from "react-router";
import { useTranslation } from "react-i18next";
import type { loader } from "../app.ads-catalog";
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
import {
  GoogleFeedFilters,
  parseList,
  type GoogleFiltersValue,
} from "../component/adsCatalog/GoogleFeedFilters";
import { GmcValidationReport } from "../component/adsCatalog/GmcValidationReport";
import { GmcReviewDetailModal } from "../component/adsCatalog/GmcReviewDetailModal";
import type {
  CredentialsView,
  FeedValidationReportView,
  GmcReviewProductView,
} from "../component/adsCatalog/types";
import type { AITaskItem, AITaskStatus } from "../../lib/aiTaskTypes";

type Tab = "sync" | "credentials" | "tasks";
type Platform = "facebook" | "google";

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
  products?: GmcReviewProductView[];
  lastCheckedAt?: string | null;
  adsLink?: { bound: boolean; customerId: string | null; linked: boolean | null };
}

export function AdsCatalogPage() {
  const { t, i18n } = useTranslation();
  const location = useLocation();
  const loaderData = useLoaderData<typeof loader>();
  const revalidator = useRevalidator();
  const credentials = loaderData.credentials as unknown as CredentialsView;

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
  const [authBanner, setAuthBanner] = useState<{ tone: "ok" | "error"; text: string } | null>(null);

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

  // Load GMC status (suspension banner, ads link, review list) on mount.
  useEffect(() => {
    statusFetcher.load(`/api/ads-catalog/google-status${location.search}`);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Surface OAuth callback outcome and route to the right tab.
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const gmc = params.get("gmcAuth");
    const ads = params.get("adsAuth");
    const reason = params.get("reason");
    if (gmc === "select" || ads === "select") {
      setTab("credentials");
      revalidator.revalidate();
    } else if (gmc === "success" || ads === "success") {
      setAuthBanner({ tone: "ok", text: t("adsCatalog.authSuccess") });
      setTab("credentials");
      revalidator.revalidate();
    } else if (gmc === "error" || ads === "error") {
      setAuthBanner({ tone: "error", text: reason || t("adsCatalog.authError") });
      setTab("credentials");
    } else if (gmc === "cancelled" || ads === "cancelled") {
      setAuthBanner({ tone: "error", text: t("adsCatalog.authCancelled") });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.search]);

  useEffect(() => {
    if (syncFetcher.state === "idle" && syncFetcher.data?.success) {
      setTab("tasks");
      revalidator.revalidate();
      statusFetcher.load(`/api/ads-catalog/google-status${location.search}`);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [syncFetcher.data, syncFetcher.state]);

  useEffect(() => {
    if (previewFetcher.state === "idle" && previewFetcher.data) {
      if (previewFetcher.data.ok) {
        setPreviewError(null);
        if (previewFetcher.data.platform === "google") {
          setGoogleReport(previewFetcher.data.report ?? null);
          setFbPreview(null);
        } else {
          setFbPreview(previewFetcher.data.preview ?? []);
          setGoogleReport(null);
        }
      } else {
        setPreviewError(previewFetcher.data.error ?? "Preview failed");
        setGoogleReport(null);
        setFbPreview(null);
      }
    }
  }, [previewFetcher.data, previewFetcher.state]);

  useEffect(() => {
    setTasks(loaderData.initialTaskPage.tasks);
  }, [loaderData.initialTaskPage.tasks]);

  const selectedTask = useMemo(
    () => tasks.find((task) => task.id === selectedTaskId) ?? null,
    [selectedTaskId, tasks],
  );

  const credentialReady =
    platform === "facebook"
      ? credentials.facebook.configured
      : credentials.googleMerchant.connected;

  function buildSyncBody(): Record<string, unknown> {
    const body: Record<string, unknown> = { platform };
    if (productIds.length > 0) body.productIds = productIds;
    if (platform === "google") {
      body.contentLanguage = filters.contentLanguage;
      body.targetCountry = filters.targetCountry;
      if (filters.googleProductCategory.trim()) {
        body.googleProductCategory = filters.googleProductCategory.trim();
      }
      body.filters = {
        tags: parseList(filters.tags),
        productTypes: parseList(filters.productTypes),
        vendors: parseList(filters.vendors),
        inStockOnly: filters.inStockOnly,
      };
    }
    return body;
  }

  function handlePreview() {
    const body = buildSyncBody();
    body.limit = 5;
    setPreviewError(null);
    previewFetcher.submit(body, {
      method: "POST",
      encType: "application/json",
      action: `/api/ads-catalog/preview${location.search}`,
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
    syncFetcher.submit(buildSyncBody(), {
      method: "POST",
      encType: "application/json",
      action: `/api/ads-catalog/sync${location.search}`,
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
      const resp = await fetch(`/api/ai-task${location.search}`, {
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
    setRefreshingStatus(true);
    try {
      await fetch(`/api/ads-catalog/google-status${location.search}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      statusFetcher.load(`/api/ads-catalog/google-status${location.search}`);
    } finally {
      setRefreshingStatus(false);
    }
  }

  return (
    <PageSurface title={t("adsCatalog.pageTitle")} subtitle={t("adsCatalog.pageSubtitle")}>
      <PageHeaderNav />
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
              <div style={{ display: "flex", gap: 12, marginTop: 6 }}>
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

            {platform === "google" && (
              <GoogleFeedFilters value={filters} onChange={setFilters} />
            )}

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
            {googleReport && <GmcValidationReport report={googleReport} />}
            {fbPreview && fbPreview.length > 0 && (
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
              locationSearch={location.search}
              languageCode={i18n.language}
              onChanged={() => {
                revalidator.revalidate();
                statusFetcher.load(`/api/ads-catalog/google-status${location.search}`);
              }}
            />
            <FacebookCredentialPanel
              credentials={credentials}
              locationSearch={location.search}
              languageCode={i18n.language}
              onSaved={() => revalidator.revalidate()}
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
                  {t("adsCatalog.reviewBadge", { count: disapprovedCount })}
                </span>
                <button type="button" style={buttonSecondary} onClick={() => setReviewOpen(true)}>
                  {t("common.viewDetail")}
                </button>
              </div>
            )}
            {selectedTask ? (
              <AdsCatalogTaskDetailPage
                task={selectedTask}
                locationSearch={location.search}
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
                  locationSearch={location.search}
                  onDelete={() => void handleDelete(task.id)}
                  onOpenDetail={() => setSelectedTaskId(task.id)}
                  onOpenReview={() => setReviewOpen(true)}
                  onTaskUpdated={handleTaskUpdated}
                  deleting={deletingId === task.id}
                />
              ))
            )}
          </div>
        )}
      </div>

      {reviewOpen && (
        <GmcReviewDetailModal
          products={reviewProducts}
          lastCheckedAt={googleStatus?.lastCheckedAt ?? null}
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

// ─── Facebook credential panel (manual, unchanged behavior) ──────────────────

function FacebookCredentialPanel(props: {
  credentials: CredentialsView;
  locationSearch: string;
  languageCode: string;
  onSaved: () => void;
}) {
  const { credentials, locationSearch, languageCode, onSaved } = props;
  const { t } = useTranslation();
  const [fb, setFb] = useState({
    accessToken: "",
    catalogId: credentials.facebook.fields.catalogId,
    businessId: credentials.facebook.fields.businessId,
    apiVersion: credentials.facebook.fields.apiVersion,
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState(false);

  async function submit(verify: boolean) {
    setSaving(true);
    setError(null);
    setOk(false);
    try {
      const resp = await fetch(`/api/ads-catalog/credentials${locationSearch}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ platform: "facebook", verify, facebook: fb }),
      });
      const data = (await resp.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!resp.ok || !data.ok) {
        setError(data.error ?? t("adsCatalog.credSaveFailed"));
        return;
      }
      setOk(true);
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={sectionStyle}>
      <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700 }}>
        {t("adsCatalog.credFacebookTitle")}
      </h3>
      <p style={pageHintTextStyle}>{t("adsCatalog.credFacebookHint")}</p>
      {credentials.facebook.configured && (
        <div style={pageHintTextStyle}>
          {t("adsCatalog.credCurrent", {
            token: credentials.facebook.fields.accessTokenMasked,
            catalogId: credentials.facebook.fields.catalogId,
            updatedAt: credentials.facebook.updatedAt
              ? new Intl.DateTimeFormat(languageCode).format(new Date(credentials.facebook.updatedAt))
              : "—",
          })}
        </div>
      )}
      <input
        style={inputStyle}
        placeholder={t("adsCatalog.credAccessTokenPlaceholder")}
        value={fb.accessToken}
        onChange={(e) => setFb({ ...fb, accessToken: e.target.value })}
      />
      <input
        style={inputStyle}
        placeholder={t("adsCatalog.credCatalogIdPlaceholder")}
        value={fb.catalogId}
        onChange={(e) => setFb({ ...fb, catalogId: e.target.value })}
      />
      <input
        style={inputStyle}
        placeholder={t("adsCatalog.credBusinessIdPlaceholder")}
        value={fb.businessId}
        onChange={(e) => setFb({ ...fb, businessId: e.target.value })}
      />
      <input
        style={inputStyle}
        placeholder={t("adsCatalog.credApiVersionPlaceholder")}
        value={fb.apiVersion}
        onChange={(e) => setFb({ ...fb, apiVersion: e.target.value })}
      />
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
        <button
          type="button"
          disabled={saving}
          style={{ ...buttonPrimary, opacity: saving ? 0.55 : 1 }}
          onClick={() => void submit(true)}
        >
          {saving ? t("adsCatalog.credSaving") : t("adsCatalog.credSaveAndVerify")}
        </button>
        <button
          type="button"
          disabled={saving}
          style={{ ...buttonSecondary, opacity: saving ? 0.55 : 1 }}
          onClick={() => void submit(false)}
        >
          {saving ? t("adsCatalog.credSaving") : t("adsCatalog.credSave")}
        </button>
      </div>
      {error && <div style={errorBoxStyle}>{error}</div>}
      {ok && (
        <div
          style={{
            background: pageColorTokens.brandGreenLight,
            color: pageColorTokens.brandGreenDeep,
            padding: 10,
            borderRadius: pageColorTokens.radiusControl,
            fontSize: 13,
          }}
        >
          {t("adsCatalog.credSavedOk")}
        </div>
      )}
    </div>
  );
}
