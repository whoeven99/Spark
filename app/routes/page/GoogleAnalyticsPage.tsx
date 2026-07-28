import { useCallback, useEffect, useRef, useState } from "react";
import { useFetcher, useLoaderData, useSearchParams } from "react-router";
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
  | { ok: true; properties: Array<{ propertyId: string; propertyName: string }> }
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

function PropertySelectPanel({
  properties,
  onSelect,
  loading,
}: {
  properties: Array<{ propertyId: string; propertyName: string; accountName: string }>;
  onSelect: (propertyIds: string[]) => void;
  loading: boolean;
}) {
  const { t } = useTranslation();
  const [selectedIds, setSelectedIds] = useState<string[]>(
    () => properties.map((property) => property.propertyId),
  );

  const toggleProperty = useCallback((propertyId: string) => {
    setSelectedIds((prev) =>
      prev.includes(propertyId)
        ? prev.filter((id) => id !== propertyId)
        : [...prev, propertyId],
    );
  }, []);

  const toggleAll = useCallback(() => {
    setSelectedIds((prev) =>
      prev.length === properties.length ? [] : properties.map((property) => property.propertyId),
    );
  }, [properties]);

  const allSelected = selectedIds.length === properties.length;

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

      <button
        type="button"
        onClick={toggleAll}
        style={{
          alignSelf: "flex-start",
          padding: "0.35rem 0.75rem",
          borderRadius: 8,
          border: `1px solid ${pageColorTokens.border}`,
          background: "transparent",
          color: pageColorTokens.textSecondary,
          fontSize: "0.78rem",
          fontWeight: 600,
          cursor: "pointer",
        }}
      >
        {allSelected ? t("ga4.deselectAll") : t("ga4.selectAll")}
      </button>

      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: "0.5rem",
          maxHeight: 280,
          overflowY: "auto",
        }}
      >
        {properties.map((property) => {
          const checked = selectedIds.includes(property.propertyId);
          return (
            <label
              key={property.propertyId}
              style={{
                display: "flex",
                alignItems: "flex-start",
                gap: "0.65rem",
                padding: "0.65rem 0.75rem",
                borderRadius: 8,
                border: `1px solid ${checked ? "rgba(52,168,83,0.35)" : pageColorTokens.border}`,
                background: checked ? "rgba(52,168,83,0.06)" : "transparent",
                cursor: "pointer",
              }}
            >
              <input
                type="checkbox"
                checked={checked}
                onChange={() => toggleProperty(property.propertyId)}
                style={{ marginTop: 2 }}
              />
              <span>
                <div style={{ fontWeight: 600, fontSize: "0.875rem", color: pageColorTokens.textPrimary }}>
                  {property.propertyName}
                </div>
                <div style={{ fontSize: "0.78rem", color: pageColorTokens.textSecondary, marginTop: 2 }}>
                  {property.accountName} · {property.propertyId}
                </div>
              </span>
            </label>
          );
        })}
      </div>

      <button
        onClick={() => onSelect(selectedIds)}
        disabled={loading || selectedIds.length === 0}
        style={{
          alignSelf: "flex-start",
          padding: "0.5rem 1.25rem",
          borderRadius: 8,
          border: "none",
          background: loading || selectedIds.length === 0 ? pageColorTokens.surfaceMuted : "#34a853",
          color: loading || selectedIds.length === 0 ? pageColorTokens.textSecondary : "#fff",
          fontWeight: 600,
          fontSize: "0.875rem",
          cursor: loading || selectedIds.length === 0 ? "not-allowed" : "pointer",
        }}
      >
        {loading ? t("ga4.confirming") : t("ga4.confirmBtn")}
      </button>
    </div>
  );
}

function ConnectedHeader({
  properties,
  onDisconnect,
  disconnecting,
}: {
  properties: Array<{ propertyId: string; propertyName: string }>;
  onDisconnect: () => void;
  disconnecting: boolean;
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
                {singleProperty.propertyId}
              </div>
            </>
          ) : (
            <>
              <div style={{ fontWeight: 600, fontSize: "0.9rem", color: pageColorTokens.textPrimary }}>
                {t("ga4.connectedMultiple", { count: properties.length })}
              </div>
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: 4,
                  marginTop: 6,
                  fontSize: "0.78rem",
                  color: pageColorTokens.textSecondary,
                }}
              >
                {properties.map((property) => (
                  <div key={property.propertyId}>
                    {property.propertyName} · {property.propertyId}
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </div>
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

  const [connected, setConnected] = useState(loaderData.connected);
  const [properties, setProperties] = useState(loaderData.properties);
  const [hasPending, setHasPending] = useState(loaderData.hasPending);
  const [pendingProperties, setPendingProperties] = useState(loaderData.pendingProperties);
  const [banner, setBanner] = useState<AuthBanner | null>(null);
  const [redirecting, setRedirecting] = useState(false);

  const authUrlFetcher = useFetcher<AuthUrlResponse>();
  const propertySelectFetcher = useFetcher<PropertySelectResponse>();
  const disconnectFetcher = useFetcher<DisconnectResponse>();

  const authUrlFetcherRef = useRef(authUrlFetcher);
  authUrlFetcherRef.current = authUrlFetcher;

  const [searchParams] = useSearchParams();

  // Handle OAuth return params
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

  // Handle auth URL response: redirect top-level to Google
  useEffect(() => {
    if (authUrlFetcher.data?.ok && authUrlFetcher.data.authUrl) {
      window.open(authUrlFetcher.data.authUrl, "_top");
    } else if (authUrlFetcher.data && !authUrlFetcher.data.ok) {
      setRedirecting(false);
      setBanner({ tone: "error", text: authUrlFetcher.data.error });
    }
  }, [authUrlFetcher.data]);

  // Handle property selection response
  useEffect(() => {
    if (!propertySelectFetcher.data) return;
    if (propertySelectFetcher.data.ok) {
      const selected = propertySelectFetcher.data.properties;
      setConnected(true);
      setProperties(selected);
      setHasPending(false);
      setPendingProperties([]);
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
      setHasPending(false);
      setPendingProperties([]);
    }
  }, [disconnectFetcher.data]);

  const handleConnect = useCallback(() => {
    setRedirecting(true);
    setBanner(null);
    const search = window.location.search ?? "";
    const host = new URLSearchParams(search).get("host") ?? "";
    authUrlFetcherRef.current.load(`/api/ga4/auth-url?host=${encodeURIComponent(host)}`);
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

  const isSelectLoading = propertySelectFetcher.state !== "idle";
  const isDisconnecting = disconnectFetcher.state !== "idle";

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
          />
          <Ga4PerformanceView />
        </>
      )}
    </div>
  );
}
