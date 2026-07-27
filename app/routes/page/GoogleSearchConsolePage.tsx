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
import type { GscSettingsLoaderData } from "../app.settings.google-search-console";
import type { GscStatusResponse } from "../api.gsc.status";

type AuthUrlResponse = { ok: true; authUrl: string } | { ok: false; error: string };
type SiteSelectResponse = { ok: true; siteUrl: string } | { ok: false; error: string };
type DisconnectResponse = { ok: true } | { ok: false; error: string };

type Days = 7 | 28 | 90;

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

function formatPercent(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

function formatPosition(value: number): string {
  return value.toFixed(1);
}

// ─── Connection panel ─────────────────────────────────────────────────────────

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
          <div style={{ fontWeight: 600, fontSize: "0.95rem", color: pageColorTokens.textPrimary }}>
            {t("gsc.title")}
          </div>
          <div style={{ fontSize: "0.82rem", color: pageColorTokens.textSecondary, marginTop: 2 }}>
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

// ─── Site selection panel ─────────────────────────────────────────────────────

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
      <div style={{ fontWeight: 600, fontSize: "0.95rem", color: pageColorTokens.textPrimary }}>
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

// ─── Connected status bar ─────────────────────────────────────────────────────

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
        padding: "1rem 1.25rem",
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
            background: "#00a67c",
            flexShrink: 0,
          }}
        />
        <span style={{ fontWeight: 600, fontSize: "0.875rem", color: pageColorTokens.textPrimary }}>
          {siteUrl}
        </span>
        <span
          style={{
            fontSize: "0.78rem",
            color: "#00a67c",
            background: "#edfaf5",
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

// ─── Analytics table ──────────────────────────────────────────────────────────

function AnalyticsTable({ data }: { data: GscStatusResponse }) {
  const { t } = useTranslation();

  if (!data.ok) {
    return (
      <div
        style={{
          padding: "1rem",
          background: pageColorTokens.surface,
          border: `1px solid ${pageColorTokens.border}`,
          borderRadius: pageColorTokens.radiusCard,
          color: pageColorTokens.textSecondary,
          fontSize: "0.875rem",
        }}
      >
        {t("gsc.dataError")}: {data.error}
      </div>
    );
  }

  if (!data.connected) return null;

  const { rows, startDate, endDate } = data.analytics;

  const thStyle: React.CSSProperties = {
    padding: "0.5rem 0.75rem",
    textAlign: "left",
    fontSize: "0.78rem",
    fontWeight: 600,
    color: pageColorTokens.textSecondary,
    borderBottom: `1px solid ${pageColorTokens.border}`,
    whiteSpace: "nowrap",
  };
  const tdStyle: React.CSSProperties = {
    padding: "0.5rem 0.75rem",
    fontSize: "0.85rem",
    color: pageColorTokens.textPrimary,
    borderBottom: `1px solid ${pageColorTokens.divider}`,
  };
  const tdNumStyle: React.CSSProperties = { ...tdStyle, textAlign: "right" };

  return (
    <div
      style={{
        background: pageColorTokens.surface,
        border: `1px solid ${pageColorTokens.border}`,
        borderRadius: pageColorTokens.radiusCard,
        overflow: "hidden",
      }}
    >
      <div
        style={{
          padding: "0.75rem 1.25rem",
          fontSize: "0.82rem",
          color: pageColorTokens.textSecondary,
          borderBottom: `1px solid ${pageColorTokens.divider}`,
        }}
      >
        {startDate} – {endDate}
      </div>
      {rows.length === 0 ? (
        <div
          style={{
            padding: "2rem",
            textAlign: "center",
            color: pageColorTokens.textSecondary,
            fontSize: "0.875rem",
          }}
        >
          {t("gsc.noData")}
        </div>
      ) : (
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                <th style={thStyle}>{t("gsc.colQuery")}</th>
                <th style={{ ...thStyle, textAlign: "right" }}>{t("gsc.colClicks")}</th>
                <th style={{ ...thStyle, textAlign: "right" }}>{t("gsc.colImpressions")}</th>
                <th style={{ ...thStyle, textAlign: "right" }}>{t("gsc.colCtr")}</th>
                <th style={{ ...thStyle, textAlign: "right" }}>{t("gsc.colPosition")}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, i) => (
                <tr key={i} style={{ background: i % 2 === 1 ? pageColorTokens.surfaceEvenRow : undefined }}>
                  <td style={tdStyle}>{row.query}</td>
                  <td style={tdNumStyle}>{row.clicks.toLocaleString()}</td>
                  <td style={tdNumStyle}>{row.impressions.toLocaleString()}</td>
                  <td style={tdNumStyle}>{formatPercent(row.ctr)}</td>
                  <td style={tdNumStyle}>{formatPosition(row.position)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ─── Day range selector ───────────────────────────────────────────────────────

function DaysSelector({ days, onChange }: { days: Days; onChange: (d: Days) => void }) {
  const { t } = useTranslation();
  const options: Days[] = [7, 28, 90];
  return (
    <div style={{ display: "flex", gap: "0.5rem" }}>
      {options.map((d) => (
        <button
          key={d}
          onClick={() => onChange(d)}
          style={{
            padding: "0.35rem 0.85rem",
            borderRadius: 20,
            border: `1px solid ${days === d ? "#4285f4" : pageColorTokens.border}`,
            background: days === d ? "#e8f0fe" : "transparent",
            color: days === d ? "#4285f4" : pageColorTokens.textSecondary,
            fontWeight: days === d ? 600 : 400,
            fontSize: "0.82rem",
            cursor: "pointer",
          }}
        >
          {t("gsc.days", { count: d })}
        </button>
      ))}
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export function GoogleSearchConsolePage() {
  const { t } = useTranslation();
  const { isMobile } = useResponsiveLayout();
  const [searchParams] = useSearchParams();
  const loaderData = useLoaderData<GscSettingsLoaderData>();

  const [connected, setConnected] = useState(loaderData.connected);
  const [siteUrl, setSiteUrl] = useState<string | null>(loaderData.siteUrl);
  const [hasPending, setHasPending] = useState(loaderData.hasPending);
  const [pendingSites, setPendingSites] = useState(loaderData.pendingSites);
  const [days, setDays] = useState<Days>(7);
  const [authBanner, setAuthBanner] = useState<AuthBanner | null>(null);

  const authFetcher = useFetcher<AuthUrlResponse>();
  const siteFetcher = useFetcher<SiteSelectResponse>();
  const disconnectFetcher = useFetcher<DisconnectResponse>();
  const statusFetcher = useFetcher<GscStatusResponse>();

  const statusFetcherRef = useRef(statusFetcher);
  statusFetcherRef.current = statusFetcher;

  // URL params from OAuth callback
  const gscAuth = searchParams.get("gscAuth");

  useEffect(() => {
    if (!gscAuth) return;

    const reason = searchParams.get("reason");
    const errorCode = searchParams.get("errorCode");

    if (gscAuth === "select") {
      setHasPending(true);
    } else if (gscAuth === "success") {
      const urlSite = searchParams.get("siteUrl");
      if (urlSite) {
        setConnected(true);
        setSiteUrl(urlSite);
        setHasPending(false);
        setAuthBanner({ tone: "ok", text: t("gsc.authSuccess", { siteUrl: urlSite }) });
      }
    } else if (gscAuth === "error") {
      if (errorCode === "no_verified_sites") {
        setAuthBanner({ tone: "error", text: t("gsc.authNoVerifiedSites") });
      } else {
        setAuthBanner({ tone: "error", text: reason || t("gsc.authError") });
      }
    } else if (gscAuth === "cancelled") {
      setAuthBanner({ tone: "error", text: t("gsc.authCancelled") });
    }

    cleanGscOAuthParams();
  }, [gscAuth, searchParams, t]);

  // Fetch analytics when connected
  useEffect(() => {
    if (connected && siteUrl) {
      statusFetcherRef.current.load(`/api/gsc/status?days=${days}`);
    }
  }, [connected, siteUrl, days]);

  // Reload page data after site selection
  useEffect(() => {
    if (siteFetcher.data?.ok) {
      setConnected(true);
      setSiteUrl(siteFetcher.data.siteUrl);
      setHasPending(false);
      setPendingSites([]);
    }
  }, [siteFetcher.data]);

  // Reload after disconnect
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
    authFetcher.load("/api/gsc/auth-url");
  }, [authFetcher]);

  useEffect(() => {
    if (authFetcher.data?.ok && authFetcher.data.authUrl) {
      window.open(authFetcher.data.authUrl, "_top");
    } else if (authFetcher.data && !authFetcher.data.ok) {
      setAuthBanner({ tone: "error", text: authFetcher.data.error });
    }
  }, [authFetcher.data]);

  const handleSiteSelect = useCallback(
    (selectedSiteUrl: string) => {
      siteFetcher.submit(
        JSON.stringify({ siteUrl: selectedSiteUrl }),
        {
          method: "POST",
          action: "/api/gsc/sites",
          encType: "application/json",
        },
      );
    },
    [siteFetcher],
  );

  const handleDisconnect = useCallback(() => {
    disconnectFetcher.submit({}, { method: "POST", action: "/api/gsc/disconnect" });
  }, [disconnectFetcher]);

  const connectingAuth = authFetcher.state === "loading";
  const disconnecting = disconnectFetcher.state !== "idle";
  const selectingLoading = siteFetcher.state !== "idle";
  const analyticsLoading = statusFetcher.state !== "idle";

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
                authBanner.tone === "ok" ? pageColorTokens.brandGreenDeep : pageColorTokens.critical
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

        {!connected && !hasPending && (
          <NotConnectedPanel onConnect={handleConnect} />
        )}

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

            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                flexWrap: "wrap",
                gap: "0.5rem",
              }}
            >
              <div
                style={{
                  fontWeight: 600,
                  fontSize: "0.9rem",
                  color: pageColorTokens.textPrimary,
                }}
              >
                {t("gsc.topQueriesTitle")}
              </div>
              <DaysSelector days={days} onChange={setDays} />
            </div>

            {analyticsLoading ? (
              <div
                style={{
                  padding: "2rem",
                  textAlign: "center",
                  color: pageColorTokens.textSecondary,
                  fontSize: "0.875rem",
                  background: pageColorTokens.surface,
                  border: `1px solid ${pageColorTokens.border}`,
                  borderRadius: pageColorTokens.radiusCard,
                }}
              >
                {t("gsc.loadingData")}
              </div>
            ) : statusFetcher.data ? (
              <AnalyticsTable data={statusFetcher.data} />
            ) : null}
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
