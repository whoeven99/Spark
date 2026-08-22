import { useCallback, useEffect, useRef, useState } from "react";
import { useFetcher, useLoaderData, useRevalidator, useSearchParams } from "react-router";
import { useTranslation } from "react-i18next";
import { useOAuthPopup } from "../../hooks/useOAuthPopup";
import { useResponsiveLayout } from "../../hooks/useResponsiveLayout";
import {
  PageHeaderNav,
  PageMetricCard,
  PageSectionHeader,
  PageSurface,
  mobilePageContentStyle,
  pageColorTokens,
  pageContentStyle,
} from "./pageUiStyles";
import type { Ga4SettingsLoaderData } from "../app.settings.google-analytics";
import { Ga4PerformanceView } from "./Ga4PerformanceView";

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
  loading = false,
  showHeader = false,
}: {
  properties: Array<{ propertyId: string; propertyName: string; accountName?: string; accountId?: string }>;
  activeId: string;
  onSelect: (propertyId: string) => void;
  loading?: boolean;
  showHeader?: boolean;
}) {
  const { t } = useTranslation();
  if (properties.length === 0) return null;

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
  const [expanded, setExpanded] = useState(false);

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

  const dualPanel = (
    <div
      style={{
        border: `1px solid ${pageColorTokens.border}`,
        borderRadius: 10,
        overflow: "hidden",
        display: "flex",
        minHeight: 160,
        maxHeight: 280,
        background: pageColorTokens.surface,
        opacity: loading ? 0.65 : 1,
        pointerEvents: loading ? "none" : "auto",
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

  if (!showHeader) return dualPanel;

  const activeNumId = activeProperty ? extractNumericId(activeProperty.propertyId) : "";

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
      <div
        style={{
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "space-between",
          gap: "0.75rem",
        }}
      >
        <div style={{ minWidth: 0 }}>
          <div style={{ fontWeight: 600, fontSize: "0.95rem", color: pageColorTokens.textPrimary }}>
            {t("ga4.selectPropertyTitle")}
          </div>
          {!expanded && activeProperty && (
            <div style={{ fontSize: "0.82rem", color: pageColorTokens.textSecondary, marginTop: 4 }}>
              {activeProperty.propertyName}
              {activeNumId ? ` (${activeNumId})` : ""}
            </div>
          )}
        </div>
        <button
          type="button"
          onClick={() => setExpanded((value) => !value)}
          style={{
            padding: "0.35rem 0.85rem",
            borderRadius: 8,
            border: `1px solid ${pageColorTokens.border}`,
            background: "transparent",
            color: pageColorTokens.textBody,
            fontSize: "0.8rem",
            fontWeight: 600,
            cursor: "pointer",
            flexShrink: 0,
          }}
        >
          {expanded ? t("ga4.togglePropertyCollapse") : t("ga4.togglePropertyExpand")}
        </button>
      </div>
      {expanded && (
        <>
          <p style={{ fontSize: "0.875rem", color: pageColorTokens.textSecondary, margin: 0 }}>
            {t("ga4.switchPropertyHint")}
          </p>
          {dualPanel}
        </>
      )}
    </div>
  );
}

function ConnectedHeader({
  onDisconnect,
  disconnecting,
}: {
  onDisconnect: () => void;
  disconnecting: boolean;
}) {
  const { t } = useTranslation();

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
      </div>
      <div style={{ display: "flex", gap: "0.5rem", flexShrink: 0 }}>
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

function ConnectionStatusBadge({
  label,
  tone,
}: {
  label: string;
  tone: "connected" | "pending" | "inactive";
}) {
  const toneStyle =
    tone === "connected"
      ? {
          color: pageColorTokens.brandGreenDeep,
          background: pageColorTokens.brandGreenLight,
          borderColor: pageColorTokens.brandGreenGlow,
        }
      : tone === "pending"
        ? {
            color: pageColorTokens.warning,
            background: pageColorTokens.warningBg,
            borderColor: "rgba(185, 137, 0, 0.18)",
          }
        : {
            color: pageColorTokens.textSecondary,
            background: pageColorTokens.surfaceMuted,
            borderColor: pageColorTokens.border,
          };

  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        padding: "0.3rem 0.75rem",
        borderRadius: "999px",
        fontSize: "0.8rem",
        fontWeight: 700,
        border: `1px solid ${toneStyle.borderColor}`,
        color: toneStyle.color,
        background: toneStyle.background,
      }}
    >
      {label}
    </span>
  );
}

// ─── Main page ─────────────────────────────────────────────────────────────────

export function GoogleAnalyticsPage() {
  const { t } = useTranslation();
  const { isMobile } = useResponsiveLayout();
  const [searchParams] = useSearchParams();
  const returnTo = searchParams.get("returnTo")?.trim() || undefined;
  const loaderData = useLoaderData<Ga4SettingsLoaderData>();
  const revalidator = useRevalidator();

  const [connected, setConnected] = useState(loaderData.connected);
  const [properties, setProperties] = useState(loaderData.properties);
  const [allProperties, setAllProperties] = useState(loaderData.allProperties);
  const [hasPending, setHasPending] = useState(loaderData.hasPending);
  const [pendingProperties, setPendingProperties] = useState(loaderData.pendingProperties);
  const [banner, setBanner] = useState<AuthBanner | null>(null);
  const [oauthResolving, setOauthResolving] = useState(false);
  const [activePropertyId, setActivePropertyId] = useState<string>(
    () => loaderData.properties[0]?.propertyId ?? "",
  );

  const ga4OAuth = useOAuthPopup("ga4_oauth");
  const propertySelectFetcher = useFetcher<PropertySelectResponse>();
  const disconnectFetcher = useFetcher<DisconnectResponse>();

  const propertySelectIntentRef = useRef<"pending" | "switch">("pending");

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

  const applyGa4AuthResult = useCallback(
    (result: {
      ga4Auth?: string;
      propertyName?: string;
      errorCode?: string;
      reason?: string;
    }) => {
      if (result.ga4Auth === "success") {
        setBanner({
          tone: "ok",
          text: t("ga4.authSuccess", { propertyName: result.propertyName ?? "" }),
        });
        setOauthResolving(true);
        void revalidator.revalidate();
        return;
      }
      if (result.ga4Auth === "select") {
        setHasPending(true);
        setOauthResolving(true);
        void revalidator.revalidate();
        return;
      }
      if (result.ga4Auth === "cancelled") {
        setBanner({ tone: "error", text: t("ga4.authCancelled") });
        return;
      }
      if (result.ga4Auth === "error") {
        if (result.errorCode === "no_properties") {
          setBanner({ tone: "error", text: t("ga4.authNoProperties") });
        } else {
          setBanner({
            tone: "error",
            text: `${t("ga4.authError")}${result.reason ? ` (${result.reason})` : ""}`,
          });
        }
      }
    },
    [revalidator, t],
  );

  // Handle OAuth return params（非 popup 模式下的 URL 参数回调）
  useEffect(() => {
    const ga4Auth = searchParams.get("ga4Auth");
    if (!ga4Auth) return;
    cleanGa4OAuthParams();
    applyGa4AuthResult({
      ga4Auth,
      propertyName: searchParams.get("propertyName") ?? undefined,
      errorCode: searchParams.get("errorCode") ?? undefined,
      reason: searchParams.get("reason") ?? undefined,
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 弹窗授权完成后，等 loader 同步 connected / pending 再结束 resolving，避免闪回「未连接」
  useEffect(() => {
    if (!oauthResolving) return;
    if (loaderData.connected || loaderData.hasPending) {
      setOauthResolving(false);
    }
  }, [loaderData.connected, loaderData.hasPending, oauthResolving]);

  useEffect(() => {
    if (!oauthResolving || revalidator.state !== "idle") return;
    if (loaderData.connected || loaderData.hasPending) return;
    const timer = window.setTimeout(() => setOauthResolving(false), 500);
    return () => window.clearTimeout(timer);
  }, [oauthResolving, revalidator.state, loaderData.connected, loaderData.hasPending]);

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
      if (propertySelectIntentRef.current === "pending") {
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
      }
    } else {
      setBanner({ tone: "error", text: propertySelectFetcher.data.error });
      if (propertySelectIntentRef.current === "switch" && properties[0]) {
        setActivePropertyId(properties[0].propertyId);
      }
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
    setBanner(null);
    const search = window.location.search ?? "";
    const host = new URLSearchParams(search).get("host") ?? "";
    void (async () => {
      try {
        await ga4OAuth.startOAuth(`/api/ga4/auth-url?host=${encodeURIComponent(host)}`, (data) => {
          applyGa4AuthResult({
            ga4Auth: data.ga4Auth,
            propertyName: data.propertyName,
            errorCode: data.errorCode,
            reason: data.reason,
          });
        });
      } catch (error) {
        setBanner({
          tone: "error",
          text: error instanceof Error ? error.message : t("ga4.authError"),
        });
      }
    })();
  }, [applyGa4AuthResult, ga4OAuth, t]);

  const handlePropertySelect = useCallback(
    (selectedPropertyIds: string[]) => {
      propertySelectIntentRef.current = "pending";
      propertySelectFetcher.submit(
        { propertyIds: selectedPropertyIds },
        { method: "POST", action: "/api/ga4/properties", encType: "application/json" },
      );
    },
    [propertySelectFetcher],
  );

  const handlePropertySwitch = useCallback(
    (propertyId: string) => {
      if (propertyId === activePropertyId) return;
      setActivePropertyId(propertyId);
      propertySelectIntentRef.current = "switch";
      propertySelectFetcher.submit(
        { propertyIds: [propertyId] },
        { method: "POST", action: "/api/ga4/properties", encType: "application/json" },
      );
    },
    [activePropertyId, propertySelectFetcher],
  );

  const handleDisconnect = useCallback(() => {
    disconnectFetcher.submit({}, { method: "POST", action: "/api/ga4/disconnect" });
  }, [disconnectFetcher]);

  const isSelectLoading = propertySelectFetcher.state !== "idle";
  const isDisconnecting = disconnectFetcher.state !== "idle";

  // allProperties 类型需满足 PropertySelectPanel 的 accountName: string 要求
  const allPropertiesForPanel = allProperties.map((p) => ({
    ...p,
    accountName: p.accountName ?? "",
  }));
  const selectorProperties =
    allPropertiesForPanel.length > 0
      ? allPropertiesForPanel
      : properties.map((p) => ({ ...p, accountName: p.accountName ?? "" }));
  const overviewStatus = connected
    ? t("settingsShell.statusConnected")
    : hasPending
      ? t("settingsShell.statusPending")
      : t("settingsShell.statusNeedsSetup");
  const overviewPropertyCount = connected ? properties.length : pendingProperties.length;
  const overviewAccountCount = new Set(
    (connected ? selectorProperties : pendingProperties)
      .map((property) => property.accountName || property.accountId || "")
      .filter(Boolean),
  ).size;
  const activeProperty =
    properties.find((property) => property.propertyId === activePropertyId) ?? properties[0] ?? null;
  const connectionTone = connected ? "connected" : hasPending ? "pending" : "inactive";
  const overviewFooter = connected && activeProperty
    ? t("ga4.overviewCurrentProperty", { propertyName: activeProperty.propertyName })
    : hasPending
      ? t("ga4.overviewPendingHint", { count: pendingProperties.length })
      : t("ga4.overviewNeedsSetupHint");
  return (
    <div style={isMobile ? mobilePageContentStyle : pageContentStyle}>
      <PageHeaderNav
        title={t("ga4.title")}
        subtitle={t("ga4.subtitle")}
        backLabel={returnTo ? "返回上一级" : t("settingsShell.back")}
        fallbackPath={returnTo ?? "/app/settings"}
        returnTo={returnTo}
      />

      <PageSurface>
        <PageSectionHeader
          title={t("ga4.overviewTitle")}
          subtitle={t("ga4.overviewSubtitle")}
        />
        <PageMetricCard
          metrics={[
            { label: t("ga4.overviewStatus"), value: overviewStatus },
            { label: t("ga4.overviewProperties"), value: String(overviewPropertyCount) },
            { label: t("ga4.overviewAccounts"), value: String(overviewAccountCount) },
          ]}
          footer={<span style={{ fontSize: "0.82rem", color: pageColorTokens.textSecondary }}>{overviewFooter}</span>}
        />
      </PageSurface>

      <PageSurface>
        <PageSectionHeader
          title={t("ga4.connectionSectionTitle")}
          subtitle={t("ga4.connectionSectionSubtitle")}
          badge={<ConnectionStatusBadge label={overviewStatus} tone={connectionTone} />}
        />

        <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
          {banner ? <AuthBannerView banner={banner} onDismiss={() => setBanner(null)} /> : null}

          {(ga4OAuth.redirecting || oauthResolving) ? (
            <div style={{ fontSize: "0.875rem", color: pageColorTokens.textSecondary }}>
              {t("ga4.redirecting")}
            </div>
          ) : null}

          {!connected && !hasPending && !ga4OAuth.redirecting && !oauthResolving ? (
            <NotConnectedPanel onConnect={handleConnect} />
          ) : null}

          {!connected && hasPending ? (
            <PropertySelectPanel
              properties={pendingProperties}
              onSelect={handlePropertySelect}
              loading={isSelectLoading}
            />
          ) : null}

          {connected && properties.length > 0 ? (
            <>
              <ConnectedHeader
                onDisconnect={handleDisconnect}
                disconnecting={isDisconnecting}
              />
              <PropertySwitcher
                properties={selectorProperties}
                activeId={activePropertyId}
                onSelect={handlePropertySwitch}
                loading={isSelectLoading}
                showHeader
              />
            </>
          ) : null}
        </div>
      </PageSurface>

      {connected && properties.length > 0 && (
        <>
          <PageSurface>
            <PageSectionHeader
              title={t("ga4.performanceSectionTitle")}
              subtitle={t("ga4.performanceSectionSubtitle")}
            />
            <Ga4PerformanceView propertyId={activePropertyId} />
          </PageSurface>
        </>
      )}
    </div>
  );
}
