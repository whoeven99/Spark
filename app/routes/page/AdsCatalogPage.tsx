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
  pageSelectStyle,
} from "./pageUiStyles";
import { SegmentedPageTabs } from "../component/shared/SegmentedPageTabs";
import { AdsCatalogTaskCard } from "../component/adsCatalog/AdsCatalogTaskCard";
import { AdsCatalogTaskDetailPage } from "../component/adsCatalog/AdsCatalogTaskDetailPage";
import type { AITaskItem, AITaskStatus } from "../../lib/aiTaskTypes";

type Tab = "sync" | "credentials" | "tasks";
type Platform = "facebook" | "google";

interface CredentialsView {
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
  google: {
    configured: boolean;
    updatedAt: string | null;
    fields: {
      accessTokenMasked: string;
      refreshTokenMasked: string;
      clientIdMasked: string;
      clientSecretMasked: string;
      merchantId: string;
    };
  };
}

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

export function AdsCatalogPage() {
  const { t, i18n } = useTranslation();
  const location = useLocation();
  const loaderData = useLoaderData<typeof loader>();
  const revalidator = useRevalidator();

  const [tab, setTab] = useState<Tab>("sync");
  const [platform, setPlatform] = useState<Platform>("facebook");
  const [productIdsRaw, setProductIdsRaw] = useState("");
  const [contentLanguage, setContentLanguage] = useState("en");
  const [targetCountry, setTargetCountry] = useState("US");
  const [tasks, setTasks] = useState<AITaskItem[]>(loaderData.initialTaskPage.tasks);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [previewItems, setPreviewItems] = useState<unknown[] | null>(null);
  const [credentials, setCredentials] = useState<CredentialsView>(loaderData.credentials);

  const syncFetcher = useFetcher<{
    success?: boolean;
    taskId?: string;
    errorMsg?: string;
    productCount?: number;
  }>();
  const previewFetcher = useFetcher<{
    ok?: boolean;
    error?: string;
    preview?: unknown[];
    total?: number;
  }>();
  const [credSavingPlatform, setCredSavingPlatform] = useState<Platform | null>(null);
  const [credSaveError, setCredSaveError] = useState<string | null>(null);
  const [credSaveOk, setCredSaveOk] = useState(false);

  // Drain sync result → refresh tasks
  useEffect(() => {
    if (syncFetcher.state === "idle" && syncFetcher.data?.success) {
      setTab("tasks");
      revalidator.revalidate();
    }
  }, [revalidator, syncFetcher.data, syncFetcher.state]);

  // Drain preview
  useEffect(() => {
    if (previewFetcher.state === "idle" && previewFetcher.data) {
      if (previewFetcher.data.ok) {
        setPreviewError(null);
        setPreviewItems(previewFetcher.data.preview ?? []);
      } else {
        setPreviewError(previewFetcher.data.error ?? "Preview failed");
        setPreviewItems(null);
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

  const productIds = useMemo(
    () =>
      productIdsRaw
        .split(/[,\n\s]+/)
        .map((s) => s.trim())
        .filter(Boolean),
    [productIdsRaw],
  );

  const credentialReady =
    platform === "facebook" ? credentials.facebook.configured : credentials.google.configured;

  function handleSync() {
    const body: Record<string, unknown> = { platform };
    if (productIds.length > 0) body.productIds = productIds;
    if (platform === "google") {
      body.contentLanguage = contentLanguage;
      body.targetCountry = targetCountry;
    }
    syncFetcher.submit(body, {
      method: "POST",
      encType: "application/json",
      action: `/api/ads-catalog/sync${location.search}`,
    });
  }

  function handlePreview() {
    const body: Record<string, unknown> = { platform, limit: 5 };
    if (productIds.length > 0) body.productIds = productIds.slice(0, 20);
    if (platform === "google") {
      body.contentLanguage = contentLanguage;
      body.targetCountry = targetCountry;
    }
    setPreviewError(null);
    previewFetcher.submit(body, {
      method: "POST",
      encType: "application/json",
      action: `/api/ads-catalog/preview${location.search}`,
    });
  }

  function handleTaskUpdated(taskId: string, status: AITaskStatus, result?: Record<string, unknown>) {
    setTasks((prev) =>
      prev.map((t) =>
        t.id === taskId
          ? { ...t, status, result: (result as AITaskItem["result"]) ?? t.result }
          : t,
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

  async function handleCredentialSubmit(payload: Record<string, unknown>) {
    const platform = payload.platform as Platform | undefined;
    setCredSavingPlatform(platform ?? null);
    setCredSaveError(null);
    setCredSaveOk(false);
    try {
      const response = await fetch(`/api/ads-catalog/credentials${location.search}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify(payload),
      });
      const data = (await response.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
        facebook?: CredentialsView["facebook"];
        google?: CredentialsView["google"];
      };
      if (!response.ok || !data.ok) {
        setCredSaveError(data.error ?? t("adsCatalog.credSaveFailed"));
        return;
      }
      if (data.facebook && data.google) {
        setCredentials({ facebook: data.facebook, google: data.google });
      }
      setCredSaveOk(true);
    } catch (e) {
      setCredSaveError(e instanceof Error ? e.message : String(e));
    } finally {
      setCredSavingPlatform(null);
    }
  }

  return (
    <PageSurface
      title={t("adsCatalog.pageTitle")}
      subtitle={t("adsCatalog.pageSubtitle")}
    >
      <PageHeaderNav />
      <div style={pageContentStyle}>
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
                  onClick={() => setPlatform("facebook")}
                  style={platform === "facebook" ? buttonPrimary : buttonSecondary}
                >
                  {t("adsCatalog.platformFacebook")}
                </button>
                <button
                  type="button"
                  onClick={() => setPlatform("google")}
                  style={platform === "google" ? buttonPrimary : buttonSecondary}
                >
                  {t("adsCatalog.platformGoogle")}
                </button>
              </div>
            </div>

            <div>
              <label style={pageFieldLabelStyle}>
                {t("adsCatalog.fieldProductIds")}
              </label>
              <textarea
                rows={3}
                value={productIdsRaw}
                onChange={(e) => setProductIdsRaw(e.target.value)}
                placeholder={t("adsCatalog.fieldProductIdsPlaceholder")}
                style={{ ...inputStyle, fontFamily: "ui-monospace, monospace", marginTop: 6 }}
              />
              <p style={pageHintTextStyle}>{t("adsCatalog.fieldProductIdsHint")}</p>
            </div>

            {platform === "google" && (
              <div style={{ display: "grid", gap: 12, gridTemplateColumns: "1fr 1fr" }}>
                <div>
                  <label style={pageFieldLabelStyle}>
                    {t("adsCatalog.fieldContentLanguage")}
                  </label>
                  <select
                    value={contentLanguage}
                    onChange={(e) => setContentLanguage(e.target.value)}
                    style={{ ...pageSelectStyle, marginTop: 6 }}
                  >
                    {["en", "zh-CN", "es", "fr", "de", "ja", "pt-BR"].map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label style={pageFieldLabelStyle}>
                    {t("adsCatalog.fieldTargetCountry")}
                  </label>
                  <select
                    value={targetCountry}
                    onChange={(e) => setTargetCountry(e.target.value)}
                    style={{ ...pageSelectStyle, marginTop: 6 }}
                  >
                    {["US", "GB", "CA", "AU", "DE", "FR", "JP", "BR"].map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
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
              <div
                style={{
                  background: pageColorTokens.criticalBg,
                  color: pageColorTokens.criticalText,
                  padding: 10,
                  borderRadius: pageColorTokens.radiusControl,
                  fontSize: 13,
                }}
              >
                {previewError}
              </div>
            )}
            {previewItems && previewItems.length > 0 && (
              <pre
                style={{
                  background: pageColorTokens.surfaceMuted,
                  border: `1px solid ${pageColorTokens.border}`,
                  borderRadius: pageColorTokens.radiusControl,
                  padding: 12,
                  fontSize: 12,
                  maxHeight: 320,
                  overflow: "auto",
                }}
              >
                {JSON.stringify(previewItems, null, 2)}
              </pre>
            )}
            {syncFetcher.data?.errorMsg && (
              <div
                style={{
                  background: pageColorTokens.criticalBg,
                  color: pageColorTokens.criticalText,
                  padding: 10,
                  borderRadius: pageColorTokens.radiusControl,
                  fontSize: 13,
                }}
              >
                {syncFetcher.data.errorMsg}
              </div>
            )}
          </div>
        )}

        {tab === "credentials" && (
          <CredentialsTab
            credentials={credentials}
            onSubmit={(payload) => {
              void handleCredentialSubmit(payload);
            }}
            savingPlatform={credSavingPlatform}
            saveError={credSaveError}
            saveOk={credSaveOk}
            t={t}
            languageCode={i18n.language}
          />
        )}

        {tab === "tasks" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {selectedTask ? (
              <AdsCatalogTaskDetailPage
                task={selectedTask}
                locationSearch={location.search}
                onBack={() => setSelectedTaskId(null)}
              />
            ) : tasks.length === 0 ? (
              <div style={{ ...sectionStyle, alignItems: "center", textAlign: "center" }}>
                <p style={{ color: pageColorTokens.textSecondary }}>
                  {t("adsCatalog.tasksEmpty")}
                </p>
              </div>
            ) : (
              tasks.map((task) => (
                <AdsCatalogTaskCard
                  key={task.id}
                  task={task}
                  locationSearch={location.search}
                  onDelete={() => void handleDelete(task.id)}
                  onOpenDetail={() => setSelectedTaskId(task.id)}
                  onTaskUpdated={handleTaskUpdated}
                  deleting={deletingId === task.id}
                />
              ))
            )}
          </div>
        )}
      </div>
    </PageSurface>
  );
}

// ─── Credentials tab ────────────────────────────────────────────────────────

function actionButtonStyle(
  tone: "primary" | "secondary",
  disabled: boolean,
): CSSProperties {
  const base = tone === "primary" ? buttonPrimary : buttonSecondary;
  return {
    ...base,
    opacity: disabled ? 0.55 : 1,
    cursor: disabled ? "not-allowed" : "pointer",
  };
}

function CredentialsTab(props: {
  credentials: CredentialsView;
  onSubmit: (payload: Record<string, unknown>) => void;
  savingPlatform: Platform | null;
  saveError?: string | null;
  saveOk?: boolean;
  t: (key: string, options?: Record<string, unknown>) => string;
  languageCode: string;
}) {
  const { credentials, onSubmit, savingPlatform, saveError, saveOk, t, languageCode } = props;
  const [fb, setFb] = useState({
    accessToken: "",
    catalogId: credentials.facebook.fields.catalogId,
    businessId: credentials.facebook.fields.businessId,
    apiVersion: credentials.facebook.fields.apiVersion,
  });
  const [gg, setGg] = useState({
    accessToken: "",
    refreshToken: "",
    clientId: "",
    clientSecret: "",
    merchantId: credentials.google.fields.merchantId,
  });

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
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
                ? new Intl.DateTimeFormat(languageCode).format(
                    new Date(credentials.facebook.updatedAt),
                  )
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
            disabled={savingPlatform !== null}
            style={actionButtonStyle("primary", savingPlatform !== null)}
            onClick={() => onSubmit({ platform: "facebook", verify: true, facebook: fb })}
          >
            {savingPlatform === "facebook"
              ? t("adsCatalog.credSaving")
              : t("adsCatalog.credSaveAndVerify")}
          </button>
          <button
            type="button"
            disabled={savingPlatform !== null}
            style={actionButtonStyle("secondary", savingPlatform !== null)}
            onClick={() => onSubmit({ platform: "facebook", verify: false, facebook: fb })}
          >
            {savingPlatform === "facebook"
              ? t("adsCatalog.credSaving")
              : t("adsCatalog.credSave")}
          </button>
        </div>
      </div>

      <div style={sectionStyle}>
        <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700 }}>
          {t("adsCatalog.credGoogleTitle")}
        </h3>
        <p style={pageHintTextStyle}>{t("adsCatalog.credGoogleHint")}</p>
        {credentials.google.configured && (
          <div style={pageHintTextStyle}>
            {t("adsCatalog.credCurrentGoogle", {
              token: credentials.google.fields.accessTokenMasked,
              merchantId: credentials.google.fields.merchantId,
              updatedAt: credentials.google.updatedAt
                ? new Intl.DateTimeFormat(languageCode).format(
                    new Date(credentials.google.updatedAt),
                  )
                : "—",
            })}
          </div>
        )}
        <input
          style={inputStyle}
          placeholder={t("adsCatalog.credAccessTokenPlaceholder")}
          value={gg.accessToken}
          onChange={(e) => setGg({ ...gg, accessToken: e.target.value })}
        />
        <input
          style={inputStyle}
          placeholder={t("adsCatalog.credMerchantIdPlaceholder")}
          value={gg.merchantId}
          onChange={(e) => setGg({ ...gg, merchantId: e.target.value })}
        />
        <input
          style={inputStyle}
          placeholder={t("adsCatalog.credRefreshTokenPlaceholder")}
          value={gg.refreshToken}
          onChange={(e) => setGg({ ...gg, refreshToken: e.target.value })}
        />
        <input
          style={inputStyle}
          placeholder={t("adsCatalog.credClientIdPlaceholder")}
          value={gg.clientId}
          onChange={(e) => setGg({ ...gg, clientId: e.target.value })}
        />
        <input
          style={inputStyle}
          placeholder={t("adsCatalog.credClientSecretPlaceholder")}
          value={gg.clientSecret}
          onChange={(e) => setGg({ ...gg, clientSecret: e.target.value })}
          type="password"
        />
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
          <button
            type="button"
            disabled={savingPlatform !== null}
            style={actionButtonStyle("primary", savingPlatform !== null)}
            onClick={() => onSubmit({ platform: "google", verify: true, google: gg })}
          >
            {savingPlatform === "google"
              ? t("adsCatalog.credSaving")
              : t("adsCatalog.credSaveAndVerify")}
          </button>
          <button
            type="button"
            disabled={savingPlatform !== null}
            style={actionButtonStyle("secondary", savingPlatform !== null)}
            onClick={() => onSubmit({ platform: "google", verify: false, google: gg })}
          >
            {savingPlatform === "google"
              ? t("adsCatalog.credSaving")
              : t("adsCatalog.credSave")}
          </button>
        </div>
      </div>

      {saveError && (
        <div
          style={{
            background: pageColorTokens.criticalBg,
            color: pageColorTokens.criticalText,
            padding: 10,
            borderRadius: pageColorTokens.radiusControl,
            fontSize: 13,
          }}
        >
          {saveError}
        </div>
      )}
      {saveOk && (
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
