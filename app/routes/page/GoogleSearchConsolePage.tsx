import { useCallback, useEffect, useState } from "react";
import { useFetcher, useLoaderData, useRevalidator, useSearchParams } from "react-router";
import { useTranslation } from "react-i18next";
import { useOAuthPopup } from "../../hooks/useOAuthPopup";
import { useResponsiveLayout } from "../../hooks/useResponsiveLayout";
import {
  PageHeaderNav,
  mobilePageContentStyle,
  pageColorTokens,
  pageContentStyle,
} from "./pageUiStyles";
import type { GscSettingsLoaderData } from "../app.settings.google-search-console";
import { GscPerformanceView } from "./GscPerformanceView";

type SiteSelectResponse = { ok: true; siteUrl: string } | { ok: false; error: string };
type DisconnectResponse = { ok: true } | { ok: false; error: string };
type AuthBanner = { tone: "ok" | "error"; text: string };

const GSC_OAUTH_QUERY_KEYS = ["gscAuth", "reason", "errorCode", "siteUrl"] as const;

function cleanGscOAuthParams() {
  if (typeof window === "undefined") return;
  const params = new URLSearchParams(window.location.search);
  let changed = false;
  for (const key of GSC_OAUTH_QUERY_KEYS) {
    if (params.has(key)) {
      params.delete(key);
      changed = true;
    }
  }
  if (!changed) return;
  const query = params.toString();
  const nextSearch = query ? `?${query}` : "";
  window.history.replaceState(null, "", `${window.location.pathname}${nextSearch}`);
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
            background: "#e8f0fe",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
          }}
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
            <path
              d="M21 21l-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0z"
              stroke="#4285f4"
              strokeWidth="2"
              strokeLinecap="round"
            />
          </svg>
        </div>
        <div>
          <div
            style={{ fontWeight: 600, fontSize: "0.95rem", color: pageColorTokens.textPrimary }}
          >
            {t("gsc.title")}
          </div>
          <div
            style={{ fontSize: "0.82rem", color: pageColorTokens.textSecondary, marginTop: 2 }}
          >
            {t("gsc.notConnectedHint")}
          </div>
        </div>
      </div>
      <p style={{ fontSize: "0.875rem", color: pageColorTokens.textSecondary, margin: 0 }}>
        {t("gsc.description")}
      </p>
      <button
        onClick={onConnect}
        style={{
          alignSelf: "flex-start",
          padding: "0.5rem 1.25rem",
          borderRadius: 8,
          border: "none",
          background: "#4285f4",
          color: "#fff",
          fontWeight: 600,
          fontSize: "0.875rem",
          cursor: "pointer",
        }}
      >
        {t("gsc.connectBtn")}
      </button>
    </div>
  );
}

function SiteSelectPanel({
  sites,
  onSelect,
  loading,
}: {
  sites: Array<{ siteUrl: string; permissionLevel: string }>;
  onSelect: (siteUrl: string) => void;
  loading: boolean;
}) {
  const { t } = useTranslation();
  const [selected, setSelected] = useState(sites[0]?.siteUrl ?? "");

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
        style={{ fontWeight: 600, fontSize: "0.95rem", color: pageColorTokens.textPrimary }}
      >
        {t("gsc.selectSiteTitle")}
      </div>
      <p style={{ fontSize: "0.875rem", color: pageColorTokens.textSecondary, margin: 0 }}>
        {t("gsc.selectSiteHint")}
      </p>
      <select
        value={selected}
        onChange={(e) => setSelected(e.target.value)}
        style={{
          padding: "0.5rem 0.75rem",
          borderRadius: 6,
          border: `1px solid ${pageColorTokens.border}`,
          fontSize: "0.875rem",
          color: pageColorTokens.textPrimary,
          background: pageColorTokens.surface,
        }}
      >
        {sites.map((s) => (
          <option key={s.siteUrl} value={s.siteUrl}>
            {s.siteUrl}
          </option>
        ))}
      </select>
      <button
        disabled={!selected || loading}
        onClick={() => onSelect(selected)}
        style={{
          alignSelf: "flex-start",
          padding: "0.5rem 1.25rem",
          borderRadius: 8,
          border: "none",
          background: selected ? "#4285f4" : pageColorTokens.border,
          color: selected ? "#fff" : pageColorTokens.textSecondary,
          fontWeight: 600,
          fontSize: "0.875rem",
          cursor: selected ? "pointer" : "default",
        }}
      >
        {loading ? t("gsc.confirming") : t("gsc.confirmBtn")}
      </button>
    </div>
  );
}

function ConnectedBar({
  siteUrl,
  onDisconnect,
  disconnecting,
}: {
  siteUrl: string;
  onDisconnect: () => void;
  disconnecting: boolean;
}) {
  const { t } = useTranslation();
  return (
    <div
      style={{
        background: pageColorTokens.surface,
        border: `1px solid ${pageColorTokens.border}`,
        borderRadius: pageColorTokens.radiusCard,
        padding: "0.85rem 1.25rem",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: "1rem",
        flexWrap: "wrap",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: "0.6rem" }}>
        <div
          style={{
            width: 8,
            height: 8,
            borderRadius: "50%",
            background: pageColorTokens.brandGreen,
            flexShrink: 0,
          }}
        />
        <span
          style={{ fontWeight: 600, fontSize: "0.875rem", color: pageColorTokens.textPrimary }}
        >
          {siteUrl}
        </span>
        <span
          style={{
            fontSize: "0.78rem",
            color: pageColorTokens.brandGreenDeep,
            background: pageColorTokens.brandGreenLight,
            borderRadius: 4,
            padding: "1px 6px",
          }}
        >
          {t("gsc.connected")}
        </span>
      </div>
      <button
        onClick={onDisconnect}
        disabled={disconnecting}
        style={{
          padding: "0.4rem 1rem",
          borderRadius: 6,
          border: `1px solid ${pageColorTokens.border}`,
          background: "transparent",
          color: disconnecting ? pageColorTokens.textSecondary : pageColorTokens.textPrimary,
          fontSize: "0.82rem",
          cursor: disconnecting ? "default" : "pointer",
        }}
      >
        {disconnecting ? t("gsc.disconnecting") : t("gsc.disconnectBtn")}
      </button>
    </div>
  );
}

// ─── Main Page ─────────────────────────────────────────────────────────────────

export function GoogleSearchConsolePage() {
  const { t } = useTranslation();
  const { isMobile } = useResponsiveLayout();
  const [searchParams] = useSearchParams();
  const loaderData = useLoaderData<GscSettingsLoaderData>();
  const revalidator = useRevalidator();

  const [connected, setConnected] = useState(loaderData.connected);
  const [siteUrl, setSiteUrl] = useState<string | null>(loaderData.siteUrl);
  const [hasPending, setHasPending] = useState(loaderData.hasPending);
  const [pendingSites, setPendingSites] = useState(loaderData.pendingSites);
  const [authBanner, setAuthBanner] = useState<AuthBanner | null>(null);
  const [oauthResolving, setOauthResolving] = useState(false);

  const gscOAuth = useOAuthPopup("gsc_oauth");
  const siteFetcher = useFetcher<SiteSelectResponse>();
  const disconnectFetcher = useFetcher<DisconnectResponse>();

  useEffect(() => {
    setConnected(loaderData.connected);
    setSiteUrl(loaderData.siteUrl);
    setHasPending(loaderData.hasPending);
    setPendingSites(loaderData.pendingSites);
  }, [loaderData]);

  const applyGscAuthResult = useCallback(
    (result: {
      gscAuth?: string;
      siteUrl?: string;
      errorCode?: string;
      reason?: string;
    }) => {
      if (result.gscAuth === "success") {
        if (result.siteUrl) {
          setConnected(true);
          setSiteUrl(result.siteUrl);
          setHasPending(false);
          setAuthBanner({ tone: "ok", text: t("gsc.authSuccess", { siteUrl: result.siteUrl }) });
        }
        setOauthResolving(true);
        void revalidator.revalidate();
        return;
      }
      if (result.gscAuth === "select") {
        setHasPending(true);
        setOauthResolving(true);
        void revalidator.revalidate();
        return;
      }
      if (result.gscAuth === "error") {
        if (result.errorCode === "no_verified_sites") {
          setAuthBanner({ tone: "error", text: t("gsc.authNoVerifiedSites") });
        } else {
          setAuthBanner({ tone: "error", text: result.reason || t("gsc.authError") });
        }
        return;
      }
      if (result.gscAuth === "cancelled") {
        setAuthBanner({ tone: "error", text: t("gsc.authCancelled") });
      }
    },
    [revalidator, t],
  );

  useEffect(() => {
    const gscAuth = searchParams.get("gscAuth");
    if (!gscAuth) return;
    cleanGscOAuthParams();
    applyGscAuthResult({
      gscAuth,
      siteUrl: searchParams.get("siteUrl") ?? undefined,
      errorCode: searchParams.get("errorCode") ?? undefined,
      reason: searchParams.get("reason") ?? undefined,
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

  useEffect(() => {
    if (siteFetcher.data?.ok) {
      setConnected(true);
      setSiteUrl((siteFetcher.data as { ok: true; siteUrl: string }).siteUrl);
      setHasPending(false);
      setPendingSites([]);
    }
  }, [siteFetcher.data]);

  useEffect(() => {
    if (disconnectFetcher.data?.ok) {
      setConnected(false);
      setSiteUrl(null);
      setHasPending(false);
      setPendingSites([]);
    }
  }, [disconnectFetcher.data]);

  const handleConnect = useCallback(() => {
    setAuthBanner(null);
    const search = window.location.search ?? "";
    const host = new URLSearchParams(search).get("host") ?? "";
    void (async () => {
      try {
        await gscOAuth.startOAuth(`/api/gsc/auth-url?host=${encodeURIComponent(host)}`, (data) => {
          applyGscAuthResult({
            gscAuth: data.gscAuth,
            siteUrl: data.siteUrl,
            errorCode: data.errorCode,
            reason: data.reason,
          });
        });
      } catch (error) {
        setAuthBanner({
          tone: "error",
          text: error instanceof Error ? error.message : t("gsc.authError"),
        });
      }
    })();
  }, [applyGscAuthResult, gscOAuth, t]);

  const handleSiteSelect = useCallback(
    (selectedSiteUrl: string) => {
      siteFetcher.submit(JSON.stringify({ siteUrl: selectedSiteUrl }), {
        method: "POST",
        action: "/api/gsc/sites",
        encType: "application/json",
      });
    },
    [siteFetcher],
  );

  const handleDisconnect = useCallback(() => {
    disconnectFetcher.submit({}, { method: "POST", action: "/api/gsc/disconnect" });
  }, [disconnectFetcher]);

  const disconnecting = disconnectFetcher.state !== "idle";
  const selectingLoading = siteFetcher.state !== "idle";
  const connectingAuth = gscOAuth.redirecting || oauthResolving;

  return (
    <div style={isMobile ? mobilePageContentStyle : pageContentStyle}>
      <PageHeaderNav
        title={t("gsc.title")}
        subtitle={t("gsc.subtitle")}
        backLabel={t("settingsShell.back")}
        fallbackPath="/app/settings"
      />

      <div style={{ display: "flex", flexDirection: "column", gap: "0.85rem" }}>
        {authBanner && (
          <div
            style={{
              padding: "0.75rem 1rem",
              background:
                authBanner.tone === "ok"
                  ? pageColorTokens.brandGreenLight
                  : pageColorTokens.criticalBg,
              border: `1px solid ${
                authBanner.tone === "ok"
                  ? pageColorTokens.brandGreenDeep
                  : pageColorTokens.critical
              }`,
              borderRadius: 8,
              fontSize: "0.875rem",
              color:
                authBanner.tone === "ok"
                  ? pageColorTokens.brandGreenDeep
                  : pageColorTokens.criticalText,
              lineHeight: 1.5,
            }}
          >
            {authBanner.text}
          </div>
        )}

        {!connected && !hasPending && !connectingAuth && <NotConnectedPanel onConnect={handleConnect} />}

        {hasPending && !connected && (
          <SiteSelectPanel
            sites={pendingSites}
            onSelect={handleSiteSelect}
            loading={selectingLoading}
          />
        )}

        {connected && siteUrl && (
          <>
            <ConnectedBar
              siteUrl={siteUrl}
              onDisconnect={handleDisconnect}
              disconnecting={disconnecting}
            />
            <GscPerformanceView />
          </>
        )}

        {connectingAuth && (
          <div style={{ fontSize: "0.82rem", color: pageColorTokens.textSecondary }}>
            {t("gsc.redirecting")}
          </div>
        )}
      </div>
    </div>
  );
}
