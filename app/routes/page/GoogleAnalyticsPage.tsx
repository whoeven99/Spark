import { useCallback, useEffect, useRef, useState } from "react";
import { useFetcher, useLoaderData, useRevalidator, useSearchParams } from "react-router";
import { useTranslation } from "react-i18next";
import { useResponsiveLayout } from "../../hooks/useResponsiveLayout";
import {
  PageHeaderNav,
  mobilePageContentStyle,
  pageColorTokens,
  pageContentStyle,
} from "./pageUiStyles";
import type { Ga4SettingsLoaderData } from "../app.settings.google-analytics";
import { Ga4PerformanceView } from "./Ga4PerformanceView";

type AuthUrlResponse = { ok: true; authUrl: string } | { ok: false; error: string };
type PropertySelectResponse =
  | { ok: true; properties: Array<{ propertyId: string; propertyName: string; accountName?: string; accountId?: string }> }
  | { ok: false; error: string };
type DisconnectResponse = { ok: true } | { ok: false; error: string };
type AuthBanner = { tone: "ok" | "error"; text: string };

const GA4_OAUTH_QUERY_KEYS = ["ga4Auth", "reason", "errorCode", "propertyName"] as const;

function cleanGa4OAuthParams() {
  if (typeof window === "undefined") return;
  const params = new URLSearchParams(window.location.search);
  let changed = false;
  for (const key of GA4_OAUTH_QUERY_KEYS) {
    if (params.has(key)) {
      params.delete(key);
      changed = true;
    }
  }
  if (!changed) return;
  const query = params.toString();
  window.history.replaceState(null, "", `${window.location.pathname}${query ? `?${query}` : ""}`);
}

// ─── Connection panels ─────────────────────────────────────────────────────────

function NotConnectedPanel({ onConnect }: { onConnect: () => void }) {
  const { t } = useTranslation();
  return (
    <div
      style={{
        background: pageColorTokens.surface,
        border: `1px solid ${pageColorTokens.border}`,
        borderRadius: pageColorTokens.radiusCard,
        padding: "1.5rem",
        display: "flex",
        flexDirection: "column",
        gap: "1rem",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
        <div
          style={{
            width: 40,
            height: 40,
            borderRadius: 10,
            background: "#e8f5e9",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
          }}
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
            <path d="M3 3h7v7H3zM14 3h7v7h-7zM14 14h7v7h-7zM3 14h7v7H3z" stroke="#34a853" strokeWidth="1.8" strokeLinejoin="round"/>
          </svg>
        </div>
        <div>
          <div style={{ fontWeight: 600, fontSize: "0.95rem", color: pageColorTokens.textPrimary }}>
            {t("ga4.title")}
          </div>
          <div style={{ fontSize: "0.82rem", color: pageColorTokens.textSecondary, marginTop: 2 }}>
            {t("ga4.notConnectedHint")}
          </div>
        </div>
      </div>
      <p style={{ fontSize: "0.875rem", color: pageColorTokens.textSecondary, margin: 0 }}>
        {t("ga4.description")}
      </p>
      <button
        onClick={onConnect}
        style={{
          alignSelf: "flex-start",
          padding: "0.5rem 1.25rem",
          borderRadius: 8,
          border: "none",
          background: "#34a853",
          color: "#fff",
          fontWeight: 600,
          fontSize: "0.875rem",
          cursor: "pointer",
        }}
      >
        {t("ga4.connectBtn")}
      </button>
    </div>
  );
}

function extractNumericId(resourceName: string): string {
  return resourceName.replace(/^(properties|accounts)\//, "");
}

function PropertySelectPanel({
  properties,
  onSelect,
  loading,
  onCancel,
}: {
  properties: Array<{ propertyId: string; propertyName: string; accountName: string; accountId?: string }>;
  onSelect: (propertyIds: string[]) => void;
  loading: boolean;
  onCancel?: () => void;
}) {
  const { t } = useTranslation();

  // 按 accountName 分组，保留顺序
  const accountsMap = new Map<string, { name: string; id: string }>();
  for (const p of properties) {
    if (!accountsMap.has(p.accountName)) {
      accountsMap.set(p.accountName, { name: p.accountName, id: p.accountId ?? "" });
    }
  }
  const accounts = Array.from(accountsMap.values());

  const [selectedAccount, setSelectedAccount] = useState<string>(accounts[0]?.name ?? "");
  const [selectedPropertyId, setSelectedPropertyId] = useState<string>("");

  const accountProperties = properties.filter((p) => p.accountName === selectedAccount);

  const handleAccountClick = useCallback(
    (accountName: string) => {
      setSelectedAccount(accountName);
      const inAccount = properties.filter((p) => p.accountName === accountName);
      if (!inAccount.some((p) => p.propertyId === selectedPropertyId)) {
        setSelectedPropertyId("");
      }
    },
    [properties, selectedPropertyId],
  );

  const colHeaderStyle: React.CSSProperties = {
    padding: "7px 14px",
    fontSize: "0.7rem",
    fontWeight: 700,
    letterSpacing: "0.06em",
    textTransform: "uppercase" as const,
    color: pageColorTokens.textSecondary,
    borderBottom: `1px solid ${pageColorTokens.border}`,
    background: pageColorTokens.surfaceMuted,
    flexShrink: 0,
  };

  return (
    <div
      style={{
        background: pageColorTokens.surface,
        border: `1px solid ${pageColorTokens.border}`,
        borderRadius: pageColorTokens.radiusCard,
        padding: "1.5rem",
        display: "flex",
        flexDirection: "column",
        gap: "1rem",
      }}
    >
      <div style={{ fontWeight: 600, fontSize: "0.95rem", color: pageColorTokens.textPrimary }}>
        {t("ga4.selectPropertyTitle")}
      </div>
      <p style={{ fontSize: "0.875rem", color: pageColorTokens.textSecondary, margin: 0 }}>
        {t("ga4.selectPropertyHint")}
      </p>

      {/* 双面板：左侧账号 / 右侧媒体资源 */}
      <div
        style={{
          display: "flex",
          border: `1px solid ${pageColorTokens.border}`,
          borderRadius: 10,
          overflow: "hidden",
          minHeight: 240,
          maxHeight: 320,
        }}
      >
        {/* 左侧：Analytics 账号列表 */}
        <div
          style={{
            width: 220,
            flexShrink: 0,
            borderRight: `1px solid ${pageColorTokens.border}`,
            display: "flex",
            flexDirection: "column",
            overflowY: "auto",
          }}
        >
          <div style={colHeaderStyle}>{t("ga4.selectAccountLabel")}</div>
          {accounts.map((account) => {
            const active = account.name === selectedAccount;
            return (
              <div
                key={account.name}
                onClick={() => handleAccountClick(account.name)}
                style={{
                  padding: "10px 14px",
                  cursor: "pointer",
                  borderLeft: `3px solid ${active ? "#34a853" : "transparent"}`,
                  background: active ? "rgba(52,168,83,0.06)" : "transparent",
                  userSelect: "none",
                }}
              >
                <div
                  style={{
                    fontWeight: active ? 700 : 500,
                    fontSize: "0.875rem",
                    color: active ? "#2e7d32" : pageColorTokens.textPrimary,
                  }}
                >
                  {account.name}
                </div>
                {account.id && (
                  <div style={{ fontSize: "0.75rem", color: pageColorTokens.textSecondary, marginTop: 2 }}>
                    {account.id}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* 右侧：媒体资源和应用 */}
        <div style={{ flex: 1, display: "flex", flexDirection: "column", overflowY: "auto", minWidth: 0 }}>
          <div style={colHeaderStyle}>{t("ga4.selectPropertyLabel")}</div>
          {accountProperties.length === 0 ? (
            <div
              style={{
                flex: 1,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: pageColorTokens.textSecondary,
                fontSize: "0.84rem",
              }}
            >
              {t("ga4.noData")}
            </div>
          ) : (
            accountProperties.map((property) => {
              const selected = property.propertyId === selectedPropertyId;
              const numId = extractNumericId(property.propertyId);
              return (
                <div
                  key={property.propertyId}
                  onClick={() => setSelectedPropertyId(property.propertyId)}
                  style={{
                    padding: "10px 14px",
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: 8,
                    borderLeft: `3px solid ${selected ? "#34a853" : "transparent"}`,
                    background: selected ? "rgba(52,168,83,0.06)" : "transparent",
                    userSelect: "none",
                  }}
                >
                  <span style={{ minWidth: 0 }}>
                    <div
                      style={{
                        fontWeight: selected ? 700 : 500,
                        fontSize: "0.875rem",
                        color: selected ? "#2e7d32" : pageColorTokens.textPrimary,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {property.propertyName}
                    </div>
                    <div style={{ fontSize: "0.75rem", color: pageColorTokens.textSecondary, marginTop: 2 }}>
                      {numId}
                    </div>
                  </span>
                  {selected && (
                    <span style={{ color: "#34a853", fontWeight: 700, flexShrink: 0, fontSize: "1rem" }}>
                      ✓
                    </span>
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>

      <div style={{ display: "flex", gap: "0.5rem" }}>
        <button
          onClick={() => selectedPropertyId && onSelect([selectedPropertyId])}
          disabled={loading || !selectedPropertyId}
          style={{
            padding: "0.5rem 1.25rem",
            borderRadius: 8,
            border: "none",
            background: loading || !selectedPropertyId ? pageColorTokens.surfaceMuted : "#34a853",
            color: loading || !selectedPropertyId ? pageColorTokens.textSecondary : "#fff",
            fontWeight: 600,
            fontSize: "0.875rem",
            cursor: loading || !selectedPropertyId ? "not-allowed" : "pointer",
          }}
        >
          {loading ? t("ga4.confirming") : t("ga4.confirmBtn")}
        </button>
        {onCancel && (
          <button
            onClick={onCancel}
            disabled={loading}
            style={{
              padding: "0.5rem 1.25rem",
              borderRadius: 8,
              border: `1px solid ${pageColorTokens.border}`,
              background: "transparent",
              color: pageColorTokens.textBody,
              fontWeight: 600,
              fontSize: "0.875rem",
              cursor: loading ? "not-allowed" : "pointer",
            }}
          >
            {t("ga4.cancelBtn")}
          </button>
        )}
      </div>
    </div>
  );
}

function PropertySwitcher({
  properties,
  activeId,
  onSelect,
}: {
  properties: Array<{ propertyId: string; propertyName: string; accountName?: string; accountId?: string }>;
  activeId: string;
  onSelect: (propertyId: string) => void;
}) {
  const { t } = useTranslation();
  if (properties.length <= 1) return null;

  // 按 accountName 分组
  const accountsMap = new Map<string, { name: string; id: string }>();
  for (const p of properties) {
    const key = p.accountName ?? "";
    if (!accountsMap.has(key)) {
      accountsMap.set(key, { name: p.accountName ?? "", id: p.accountId ?? "" });
    }
  }
  const accounts = Array.from(accountsMap.values());
  const hasAccountInfo = accounts.some((a) => a.name !== "");

  const activeProperty = properties.find((p) => p.propertyId === activeId);
  const [selectedAccount, setSelectedAccount] = useState<string>(
    activeProperty?.accountName ?? accounts[0]?.name ?? "",
  );

  useEffect(() => {
    const ap = properties.find((p) => p.propertyId === activeId);
    if (ap) setSelectedAccount(ap.accountName ?? accounts[0]?.name ?? "");
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeId]);

  const accountProperties = properties.filter(
    (p) => (p.accountName ?? "") === selectedAccount,
  );

  const colHeaderStyle: React.CSSProperties = {
    padding: "7px 14px",
    fontSize: "0.7rem",
    fontWeight: 700,
    letterSpacing: "0.06em",
    textTransform: "uppercase" as const,
    color: pageColorTokens.textSecondary,
    borderBottom: `1px solid ${pageColorTokens.border}`,
    background: pageColorTokens.surfaceMuted,
    flexShrink: 0,
  };

  return (
    <div
      style={{
        border: `1px solid ${pageColorTokens.border}`,
        borderRadius: 10,
        overflow: "hidden",
        display: "flex",
        minHeight: 160,
        maxHeight: 280,
        background: pageColorTokens.surface,
      }}
    >
      {/* 左侧账号列表（有账号信息时显示） */}
      {hasAccountInfo && (
        <div
          style={{
            width: 220,
            flexShrink: 0,
            borderRight: `1px solid ${pageColorTokens.border}`,
            display: "flex",
            flexDirection: "column",
            overflowY: "auto",
          }}
        >
          <div style={colHeaderStyle}>{t("ga4.selectAccountLabel")}</div>
          {accounts.map((account) => {
            const active = account.name === selectedAccount;
            return (
              <div
                key={account.name}
                onClick={() => setSelectedAccount(account.name)}
                style={{
                  padding: "10px 14px",
                  cursor: "pointer",
                  borderLeft: `3px solid ${active ? "#34a853" : "transparent"}`,
                  background: active ? "rgba(52,168,83,0.06)" : "transparent",
                  userSelect: "none",
                }}
              >
                <div
                  style={{
                    fontWeight: active ? 700 : 500,
                    fontSize: "0.875rem",
                    color: active ? "#2e7d32" : pageColorTokens.textPrimary,
                  }}
                >
                  {account.name || "—"}
                </div>
                {account.id && (
                  <div style={{ fontSize: "0.75rem", color: pageColorTokens.textSecondary, marginTop: 2 }}>
                    {account.id}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* 右侧媒体资源和应用 */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", overflowY: "auto", minWidth: 0 }}>
        <div style={colHeaderStyle}>{t("ga4.selectPropertyLabel")}</div>
        {accountProperties.map((property) => {
          const selected = property.propertyId === activeId;
          const numId = extractNumericId(property.propertyId);
          return (
            <div
              key={property.propertyId}
              onClick={() => onSelect(property.propertyId)}
              style={{
                padding: "10px 14px",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 8,
                borderLeft: `3px solid ${selected ? "#34a853" : "transparent"}`,
                background: selected ? "rgba(52,168,83,0.06)" : "transparent",
                userSelect: "none",
              }}
            >
              <span style={{ minWidth: 0 }}>
                <div
                  style={{
                    fontWeight: selected ? 700 : 500,
                    fontSize: "0.875rem",
                    color: selected ? "#2e7d32" : pageColorTokens.textPrimary,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {property.propertyName}
                </div>
                <div style={{ fontSize: "0.75rem", color: pageColorTokens.textSecondary, marginTop: 2 }}>
                  {numId}
                </div>
              </span>
              {selected && (
                <span style={{ color: "#34a853", fontWeight: 700, flexShrink: 0, fontSize: "1rem" }}>
                  ✓
                </span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ConnectedHeader({
  properties,
  onDisconnect,
  disconnecting,
  onReselect,
  canReselect,
}: {
  properties: Array<{ propertyId: string; propertyName: string; accountName?: string; accountId?: string }>;
  onDisconnect: () => void;
  disconnecting: boolean;
  onReselect: () => void;
  canReselect: boolean;
}) {
  const { t } = useTranslation();
  const singleProperty = properties.length === 1 ? properties[0] : null;

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        flexWrap: "wrap",
        gap: "0.75rem",
        background: pageColorTokens.surface,
        border: `1px solid ${pageColorTokens.border}`,
        borderRadius: pageColorTokens.radiusCard,
        padding: "1rem 1.25rem",
      }}
    >
      <div style={{ display: "flex", alignItems: "flex-start", gap: "0.75rem", minWidth: 0 }}>
        <div
          style={{
            padding: "0.3rem 0.75rem",
            borderRadius: 20,
            background: "#e8f5e9",
            color: "#2e7d32",
            fontSize: "0.8rem",
            fontWeight: 700,
            border: "1px solid rgba(52,168,83,0.3)",
            flexShrink: 0,
          }}
        >
          {t("ga4.connected")}
        </div>
        <div style={{ minWidth: 0 }}>
          {singleProperty ? (
            <>
              <div style={{ fontWeight: 600, fontSize: "0.9rem", color: pageColorTokens.textPrimary }}>
                {singleProperty.propertyName}
              </div>
              <div style={{ fontSize: "0.78rem", color: pageColorTokens.textSecondary, marginTop: 2 }}>
                {extractNumericId(singleProperty.propertyId)}
              </div>
            </>
          ) : (
            <div style={{ fontWeight: 600, fontSize: "0.9rem", color: pageColorTokens.textPrimary }}>
              {t("ga4.connectedMultiple", { count: properties.length })}
            </div>
          )}
        </div>
      </div>
      <div style={{ display: "flex", gap: "0.5rem", flexShrink: 0 }}>
        {canReselect && (
          <button
            onClick={onReselect}
            style={{
              padding: "0.4rem 1rem",
              borderRadius: 8,
              border: `1px solid ${pageColorTokens.border}`,
              background: "transparent",
              color: pageColorTokens.textBody,
              fontSize: "0.8rem",
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            {t("ga4.reselectBtn")}
          </button>
        )}
        <button
          onClick={onDisconnect}
          disabled={disconnecting}
          style={{
            padding: "0.4rem 1rem",
            borderRadius: 8,
            border: `1px solid ${pageColorTokens.border}`,
            background: "transparent",
            color: disconnecting ? pageColorTokens.textSecondary : pageColorTokens.textBody,
            fontSize: "0.8rem",
            fontWeight: 600,
            cursor: disconnecting ? "not-allowed" : "pointer",
          }}
        >
          {disconnecting ? t("ga4.disconnecting") : t("ga4.disconnectBtn")}
        </button>
      </div>
    </div>
  );
}

function AuthBannerView({ banner, onDismiss }: { banner: AuthBanner; onDismiss: () => void }) {
  return (
    <div
      style={{
        padding: "0.75rem 1rem",
        borderRadius: 8,
        background: banner.tone === "ok" ? "#e8f5e9" : pageColorTokens.criticalBg,
        border: `1px solid ${banner.tone === "ok" ? "rgba(52,168,83,0.35)" : pageColorTokens.critical}`,
        color: banner.tone === "ok" ? "#2e7d32" : pageColorTokens.criticalText,
        fontSize: "0.875rem",
        display: "flex",
        alignItems: "flex-start",
        justifyContent: "space-between",
        gap: "0.75rem",
      }}
    >
      <span>{banner.text}</span>
      <button
        onClick={onDismiss}
        style={{
          background: "none",
          border: "none",
          cursor: "pointer",
          color: "inherit",
          fontSize: "1rem",
          lineHeight: 1,
          padding: 0,
          flexShrink: 0,
        }}
      >
        ✕
      </button>
    </div>
  );
}

// ─── Main page ─────────────────────────────────────────────────────────────────

export function GoogleAnalyticsPage() {
  const { t } = useTranslation();
  const { isMobile } = useResponsiveLayout();
  const loaderData = useLoaderData<Ga4SettingsLoaderData>();
  const revalidator = useRevalidator();

  const [connected, setConnected] = useState(loaderData.connected);
  const [properties, setProperties] = useState(loaderData.properties);
  const [allProperties, setAllProperties] = useState(loaderData.allProperties);
  const [hasPending, setHasPending] = useState(loaderData.hasPending);
  const [pendingProperties, setPendingProperties] = useState(loaderData.pendingProperties);
  const [banner, setBanner] = useState<AuthBanner | null>(null);
  const [redirecting, setRedirecting] = useState(false);
  const [isReselecting, setIsReselecting] = useState(false);
  const [activePropertyId, setActivePropertyId] = useState<string>(
    () => loaderData.properties[0]?.propertyId ?? "",
  );

  const authUrlFetcher = useFetcher<AuthUrlResponse>();
  const propertySelectFetcher = useFetcher<PropertySelectResponse>();
  const disconnectFetcher = useFetcher<DisconnectResponse>();

  const authUrlFetcherRef = useRef(authUrlFetcher);
  authUrlFetcherRef.current = authUrlFetcher;
  const popupRef = useRef<Window | null>(null);

  const [searchParams] = useSearchParams();

  // 同步 loader 数据（revalidation 后更新 state）
  const isFirstMount = useRef(true);
  useEffect(() => {
    if (isFirstMount.current) { isFirstMount.current = false; return; }
    setConnected(loaderData.connected);
    setProperties(loaderData.properties);
    setAllProperties(loaderData.allProperties);
    setHasPending(loaderData.hasPending);
    setPendingProperties(loaderData.pendingProperties);
    if (loaderData.properties[0]) {
      setActivePropertyId(loaderData.properties[0].propertyId);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loaderData]);

  // Handle OAuth return params（非 popup 模式下的 URL 参数回调）
  useEffect(() => {
    const ga4Auth = searchParams.get("ga4Auth");
    if (!ga4Auth) return;
    cleanGa4OAuthParams();

    if (ga4Auth === "success") {
      const name = searchParams.get("propertyName") ?? "";
      setBanner({ tone: "ok", text: t("ga4.authSuccess", { propertyName: name }) });
      if (name) {
        setConnected(true);
      }
    } else if (ga4Auth === "cancelled") {
      setBanner({ tone: "error", text: t("ga4.authCancelled") });
    } else if (ga4Auth === "error") {
      const errorCode = searchParams.get("errorCode");
      if (errorCode === "no_properties") {
        setBanner({ tone: "error", text: t("ga4.authNoProperties") });
      } else {
        const reason = searchParams.get("reason") ?? "";
        setBanner({ tone: "error", text: `${t("ga4.authError")}${reason ? ` (${reason})` : ""}` });
      }
    } else if (ga4Auth === "select") {
      // pending state already set via loader; just show the panel
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Handle auth URL response: 在弹窗中打开 Google 授权页
  useEffect(() => {
    if (authUrlFetcher.data?.ok && authUrlFetcher.data.authUrl) {
      if (popupRef.current && !popupRef.current.closed) {
        popupRef.current.location.href = authUrlFetcher.data.authUrl;
      } else {
        // 弹窗被拦截时降级为 _top 跳转
        window.open(authUrlFetcher.data.authUrl, "_top");
      }
    } else if (authUrlFetcher.data && !authUrlFetcher.data.ok) {
      setRedirecting(false);
      setBanner({ tone: "error", text: authUrlFetcher.data.error });
      try { popupRef.current?.close(); } catch {}
      popupRef.current = null;
    }
  }, [authUrlFetcher.data]);

  // 监听弹窗发来的 postMessage（OAuth 完成信号）
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      const data = event.data as {
        type?: string;
        ga4Auth?: string;
        propertyName?: string;
        errorCode?: string;
        reason?: string;
      } | null;
      if (!data || data.type !== "ga4_oauth") return;

      popupRef.current = null;
      setRedirecting(false);

      if (data.ga4Auth === "success") {
        setBanner({ tone: "ok", text: t("ga4.authSuccess", { propertyName: data.propertyName ?? "" }) });
        revalidator.revalidate();
      } else if (data.ga4Auth === "select") {
        revalidator.revalidate();
      } else if (data.ga4Auth === "cancelled") {
        setBanner({ tone: "error", text: t("ga4.authCancelled") });
      } else if (data.ga4Auth === "error") {
        if (data.errorCode === "no_properties") {
          setBanner({ tone: "error", text: t("ga4.authNoProperties") });
        } else {
          setBanner({ tone: "error", text: `${t("ga4.authError")}${data.reason ? ` (${data.reason})` : ""}` });
        }
      }
    };
    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, [t, revalidator]);

  // 轮询检测弹窗被用户手动关闭（未完成授权）
  useEffect(() => {
    if (!redirecting) return;
    const timer = setInterval(() => {
      if (popupRef.current?.closed) {
        clearInterval(timer);
        popupRef.current = null;
        setRedirecting(false);
      }
    }, 500);
    return () => clearInterval(timer);
  }, [redirecting]);

  // Handle property selection response
  useEffect(() => {
    if (!propertySelectFetcher.data) return;
    if (propertySelectFetcher.data.ok) {
      const selected = propertySelectFetcher.data.properties;
      setConnected(true);
      setProperties(selected);
      setActivePropertyId(selected[0]?.propertyId ?? "");
      setHasPending(false);
      setPendingProperties([]);
      setIsReselecting(false);
      setBanner({
        tone: "ok",
        text:
          selected.length === 1
            ? t("ga4.authSuccess", { propertyName: selected[0].propertyName })
            : t("ga4.authSuccessMultiple", {
                count: selected.length,
                propertyNames: selected.map((property) => property.propertyName).join(", "),
              }),
      });
    } else {
      setBanner({ tone: "error", text: propertySelectFetcher.data.error });
    }
  }, [propertySelectFetcher.data, t]);

  // Handle disconnect response
  useEffect(() => {
    if (!disconnectFetcher.data) return;
    if (disconnectFetcher.data.ok) {
      setConnected(false);
      setProperties([]);
      setAllProperties([]);
      setHasPending(false);
      setPendingProperties([]);
    }
  }, [disconnectFetcher.data]);

  const handleConnect = useCallback(() => {
    setRedirecting(true);
    setBanner(null);
    // 同步打开弹窗（必须在用户点击事件中，否则被浏览器拦截）
    const popup =
      typeof window !== "undefined"
        ? window.open("about:blank", "ga4auth", "popup,width=560,height=680,resizable=yes")
        : null;
    popupRef.current = popup;
    const search = window.location.search ?? "";
    const host = new URLSearchParams(search).get("host") ?? "";
    authUrlFetcherRef.current.load(`/api/ga4/auth-url?host=${encodeURIComponent(host)}&popup=1`);
  }, []);

  const handlePropertySelect = useCallback(
    (selectedPropertyIds: string[]) => {
      propertySelectFetcher.submit(
        { propertyIds: selectedPropertyIds },
        { method: "POST", action: "/api/ga4/properties", encType: "application/json" },
      );
    },
    [propertySelectFetcher],
  );

  const handleDisconnect = useCallback(() => {
    disconnectFetcher.submit({}, { method: "POST", action: "/api/ga4/disconnect" });
  }, [disconnectFetcher]);

  const handleReselect = useCallback(() => {
    setIsReselecting(true);
    setBanner(null);
  }, []);

  const isSelectLoading = propertySelectFetcher.state !== "idle";
  const isDisconnecting = disconnectFetcher.state !== "idle";

  // allProperties 类型需满足 PropertySelectPanel 的 accountName: string 要求
  const allPropertiesForPanel = allProperties.map((p) => ({
    ...p,
    accountName: p.accountName ?? "",
  }));

  return (
    <div style={isMobile ? mobilePageContentStyle : pageContentStyle}>
      <PageHeaderNav
        title={t("ga4.title")}
        subtitle={t("ga4.subtitle")}
        backLabel={t("settingsShell.back")}
        fallbackPath="/app/settings"
      />

      {banner && (
        <AuthBannerView banner={banner} onDismiss={() => setBanner(null)} />
      )}

      {redirecting && (
        <div style={{ fontSize: "0.875rem", color: pageColorTokens.textSecondary }}>
          {t("ga4.redirecting")}
        </div>
      )}

      {!connected && !hasPending && !redirecting && (
        <NotConnectedPanel onConnect={handleConnect} />
      )}

      {!connected && hasPending && (
        <PropertySelectPanel
          properties={pendingProperties}
          onSelect={handlePropertySelect}
          loading={isSelectLoading}
        />
      )}

      {connected && properties.length > 0 && (
        <>
          <ConnectedHeader
            properties={properties}
            onDisconnect={handleDisconnect}
            disconnecting={isDisconnecting}
            onReselect={handleReselect}
            canReselect={allPropertiesForPanel.length > 0}
          />
          {isReselecting ? (
            <PropertySelectPanel
              properties={allPropertiesForPanel}
              onSelect={handlePropertySelect}
              loading={isSelectLoading}
              onCancel={() => setIsReselecting(false)}
            />
          ) : (
            <>
              <PropertySwitcher
                properties={properties}
                activeId={activePropertyId}
                onSelect={setActivePropertyId}
              />
              <Ga4PerformanceView propertyId={activePropertyId} />
            </>
          )}
        </>
      )}
    </div>
  );
}
