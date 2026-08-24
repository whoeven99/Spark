import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router";
import { useTranslation } from "react-i18next";
import { useOAuthPopup } from "../../../hooks/useOAuthPopup";
import {
  pageColorTokens,
  pageHintTextStyle,
} from "../../page/pageUiStyles";

type StatsMode = "auto" | "manual";

type StatsRow = { value: string; count: number };

type StatsResponse = {
  ok?: boolean;
  mode?: StatsMode;
  configured?: boolean;
  pixelId?: string;
  tokenSource?: "meta_ads_oauth" | "catalog_oauth" | "manual_oauth" | null;
  needsMetaAdsConnect?: boolean;
  permissionError?: string | null;
  windowDays?: number;
  from?: number;
  to?: number;
  metadata?: {
    pixelId: string;
    name: string;
    lastFiredTime: string | null;
    isUnavailable: boolean | null;
    eventTimeMin: number | null;
    eventTimeMax: number | null;
    creationTime: string | null;
  } | null;
  eventTotals?: StatsRow[];
  eventTotalsWeb?: StatsRow[];
  eventTotalsServer?: StatsRow[];
  hourlyFires?: Array<{ hour: string; count: number }>;
};

const cardStyle = {
  border: `1px solid ${pageColorTokens.border}`,
  borderRadius: pageColorTokens.radiusCard,
  padding: 20,
  background: pageColorTokens.surface,
  boxShadow: pageColorTokens.shadowCard,
  display: "flex",
  flexDirection: "column" as const,
  gap: 14,
};

const secondaryBtn = {
  padding: "8px 14px",
  borderRadius: 8,
  background: "#fff",
  color: pageColorTokens.textPrimary,
  border: `1px solid ${pageColorTokens.borderSubtle}`,
  fontSize: 13,
  fontWeight: 600,
  cursor: "pointer",
};

const primaryBtn = {
  padding: "8px 14px",
  borderRadius: 8,
  background: pageColorTokens.brandGreen,
  color: "#fff",
  border: "none",
  fontSize: 13,
  fontWeight: 700,
  cursor: "pointer",
};

function withModeSearch(locationSearch: string, mode: StatsMode): string {
  const params = new URLSearchParams(
    locationSearch.startsWith("?") ? locationSearch.slice(1) : locationSearch,
  );
  params.set("mode", mode);
  const qs = params.toString();
  return qs ? `?${qs}` : "";
}

function formatWindow(from: number | undefined, to: number | undefined, locale: string): string {
  if (!from || !to) return "—";
  const start = new Date(from).toLocaleString(locale);
  const end = new Date(to).toLocaleString(locale);
  return `${start} ~ ${end}`;
}

function formatHourLabel(hour: string, locale: string): string {
  const parsed = new Date(hour);
  if (Number.isNaN(parsed.getTime())) return hour;
  return parsed.toLocaleString(locale, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function HourlyFireChart({
  points,
  locale,
}: {
  points: Array<{ hour: string; count: number }>;
  locale: string;
}) {
  const max = Math.max(1, ...points.map((p) => p.count));
  if (points.length === 0) {
    return <p style={pageHintTextStyle}>—</p>;
  }

  return (
    <div style={{ display: "flex", alignItems: "flex-end", gap: 3, height: 120, overflowX: "auto" }}>
      {points.map((point) => {
        const height = Math.max(4, Math.round((point.count / max) * 100));
        return (
          <div
            key={point.hour}
            title={`${formatHourLabel(point.hour, locale)}: ${point.count}`}
            style={{
              flex: "1 0 12px",
              minWidth: 12,
              maxWidth: 24,
              height: `${height}%`,
              background: pageColorTokens.brandGreen,
              borderRadius: 4,
              opacity: 0.85,
            }}
          />
        );
      })}
    </div>
  );
}

function EventTable({
  title,
  rows,
  emptyLabel,
}: {
  title: string;
  rows: StatsRow[];
  emptyLabel: string;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <h4 style={{ margin: 0, fontSize: 14, fontWeight: 700 }}>{title}</h4>
      {rows.length === 0 ? (
        <p style={{ margin: 0, ...pageHintTextStyle }}>{emptyLabel}</p>
      ) : (
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <thead>
            <tr>
              <th
                style={{
                  textAlign: "left",
                  padding: "6px 8px",
                  borderBottom: `1px solid ${pageColorTokens.divider}`,
                }}
              >
                Event
              </th>
              <th
                style={{
                  textAlign: "right",
                  padding: "6px 8px",
                  borderBottom: `1px solid ${pageColorTokens.divider}`,
                }}
              >
                Count
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.value}>
                <td
                  style={{
                    padding: "6px 8px",
                    borderBottom: `1px solid ${pageColorTokens.divider}`,
                  }}
                >
                  {row.value}
                </td>
                <td
                  style={{
                    padding: "6px 8px",
                    textAlign: "right",
                    borderBottom: `1px solid ${pageColorTokens.divider}`,
                  }}
                >
                  {row.count.toLocaleString()}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

function ModeTab({
  active,
  label,
  onClick,
}: {
  active: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        padding: "8px 14px",
        borderRadius: 8,
        border: `1px solid ${active ? pageColorTokens.brandGreen : pageColorTokens.borderSubtle}`,
        background: active ? pageColorTokens.brandGreenLight : "#fff",
        color: active ? pageColorTokens.brandGreenDeep : pageColorTokens.textPrimary,
        fontSize: 13,
        fontWeight: active ? 700 : 600,
        cursor: "pointer",
      }}
    >
      {label}
    </button>
  );
}

function StatsBody({
  stats,
  error,
  loading,
  locale,
  locationSearch,
  t,
}: {
  stats: StatsResponse | null;
  error: string;
  loading: boolean;
  locale: string;
  locationSearch: string;
  t: (key: string, options?: Record<string, unknown>) => string;
}) {
  const tokenSourceLabel =
    stats?.tokenSource === "meta_ads_oauth"
      ? t("metaPixelData.tokenSourceMetaAds")
      : stats?.tokenSource === "catalog_oauth"
        ? t("metaPixelData.tokenSourceCatalog")
        : stats?.tokenSource === "manual_oauth"
          ? t("metaPixelData.tokenSourceManual")
          : t("metaPixelData.none");

  if (loading && !stats) {
    return <p style={pageHintTextStyle}>{t("metaPixelData.statsLoading")}</p>;
  }

  if (error) {
    return <p style={{ margin: 0, color: pageColorTokens.criticalText, fontSize: 13 }}>{error}</p>;
  }

  if (stats?.permissionError) {
    return (
      <div style={{ fontSize: 13, color: pageColorTokens.criticalText }}>
        <p style={{ margin: 0 }}>
          {stats.permissionError === "manual_not_connected"
            ? t("metaPixelData.manualNotConnected")
            : t("metaPixelData.statsPermissionError")}
        </p>
        {stats.permissionError !== "no_token" && stats.permissionError !== "manual_not_connected" ? (
          <p style={{ margin: "6px 0 0", color: pageColorTokens.textSecondary }}>
            {stats.permissionError}
          </p>
        ) : null}
        {stats.needsMetaAdsConnect ? (
          <p style={{ margin: "8px 0 0" }}>
            <Link to={`/app/settings/connections/meta${locationSearch}`}>{t("metaPixelData.connectMetaAds")}</Link>
          </p>
        ) : null}
      </div>
    );
  }

  if (!stats) return null;

  return (
    <>
      <p style={{ margin: 0, fontSize: 13, color: pageColorTokens.textSecondary }}>
        {t("metaPixelData.statsWindow", {
          days: stats.windowDays ?? 7,
          window: formatWindow(stats.from, stats.to, locale),
        })}
      </p>
      <p style={{ margin: 0, fontSize: 13 }}>
        {t("metaPixelData.tokenSource")}: {tokenSourceLabel}
      </p>

      {stats.metadata ? (
        <div style={{ display: "grid", gap: 6, fontSize: 13 }}>
          <div>
            <strong>{t("metaPixelData.metaPixelName")}:</strong> {stats.metadata.name}
          </div>
          <div>
            <strong>{t("metaPixelData.lastFiredTime")}:</strong>{" "}
            {stats.metadata.lastFiredTime
              ? new Date(stats.metadata.lastFiredTime).toLocaleString(locale)
              : t("metaPixelData.none")}
          </div>
          <div>
            <strong>{t("metaPixelData.isUnavailable")}:</strong>{" "}
            {stats.metadata.isUnavailable === null
              ? t("metaPixelData.none")
              : stats.metadata.isUnavailable
                ? t("metaPixelData.yes")
                : t("metaPixelData.no")}
          </div>
        </div>
      ) : null}

      <div style={{ display: "grid", gap: 16 }}>
        <EventTable
          title={t("metaPixelData.eventTotals")}
          rows={stats.eventTotals ?? []}
          emptyLabel={t("metaPixelData.statsEmpty")}
        />
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
          <EventTable
            title={t("metaPixelData.eventTotalsWeb")}
            rows={stats.eventTotalsWeb ?? []}
            emptyLabel={t("metaPixelData.statsEmpty")}
          />
          <EventTable
            title={t("metaPixelData.eventTotalsServer")}
            rows={stats.eventTotalsServer ?? []}
            emptyLabel={t("metaPixelData.statsEmpty")}
          />
        </div>
      </div>

      <div>
        <h4 style={{ margin: "0 0 8px", fontSize: 14, fontWeight: 700 }}>
          {t("metaPixelData.hourlyFires")}
        </h4>
        <HourlyFireChart points={stats.hourlyFires ?? []} locale={locale} />
      </div>
    </>
  );
}

export function MetaPixelStatsPanel({
  locationSearch,
  enabled,
  manualAuthConnected,
  manualAuthUpdatedAt,
  onManualAuthChanged,
}: {
  locationSearch: string;
  enabled: boolean;
  manualAuthConnected: boolean;
  manualAuthUpdatedAt: string | null;
  onManualAuthChanged: () => void;
}) {
  const { t, i18n } = useTranslation();
  const [mode, setMode] = useState<StatsMode>("auto");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [stats, setStats] = useState<StatsResponse | null>(null);
  const [manualConnected, setManualConnected] = useState(manualAuthConnected);
  const [manualUpdatedAt, setManualUpdatedAt] = useState(manualAuthUpdatedAt);
  const [authBusy, setAuthBusy] = useState(false);
  const manualOAuth = useOAuthPopup("meta_pixel_data_oauth");

  useEffect(() => {
    setManualConnected(manualAuthConnected);
    setManualUpdatedAt(manualAuthUpdatedAt);
  }, [manualAuthConnected, manualAuthUpdatedAt]);

  const load = useCallback(async () => {
    if (!enabled) return;
    if (mode === "manual" && !manualConnected) {
      setStats(null);
      setError("");
      return;
    }
    setLoading(true);
    setError("");
    try {
      const resp = await fetch(
        `/api/ads-catalog/meta-pixel-stats${withModeSearch(locationSearch, mode)}`,
      );
      const json = (await resp.json()) as StatsResponse & { message?: string };
      if (!resp.ok) {
        throw new Error(json.message || t("metaPixelData.statsLoadFailed"));
      }
      setStats(json);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : t("metaPixelData.statsLoadFailed"));
    } finally {
      setLoading(false);
    }
  }, [enabled, locationSearch, mode, manualConnected, t]);

  useEffect(() => {
    void load();
  }, [load]);

  async function startManualAuth() {
    setAuthBusy(true);
    try {
      await manualOAuth.startOAuth(
        `/api/ads-catalog/meta-pixel-data-auth-url${locationSearch}`,
        (data) => {
          if (data.metaPixelDataAuth === "success") {
            setManualConnected(true);
            setManualUpdatedAt(new Date().toISOString());
            onManualAuthChanged();
            void load();
          } else if (data.metaPixelDataAuth === "error") {
            setError(data.reason || t("metaPixelData.manualAuthFailed"));
          }
        },
      );
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : t("metaPixelData.manualAuthFailed"));
    } finally {
      setAuthBusy(false);
    }
  }

  async function disconnectManualAuth() {
    setAuthBusy(true);
    setError("");
    try {
      const resp = await fetch(`/api/ads-catalog/meta-pixel-data-disconnect${locationSearch}`, {
        method: "POST",
      });
      const json = (await resp.json().catch(() => ({}))) as { ok?: boolean };
      if (!resp.ok || !json.ok) {
        throw new Error(t("metaPixelData.manualDisconnectFailed"));
      }
      setManualConnected(false);
      setManualUpdatedAt(null);
      setStats(null);
      onManualAuthChanged();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : t("metaPixelData.manualDisconnectFailed"));
    } finally {
      setAuthBusy(false);
    }
  }

  if (!enabled) {
    return (
      <div style={cardStyle}>
        <p style={{ margin: 0, fontSize: 14 }}>{t("metaPixelData.statsNeedPixel")}</p>
      </div>
    );
  }

  const modeHint =
    mode === "auto" ? t("metaPixelData.statsHintAuto") : t("metaPixelData.statsHintManual");

  return (
    <div style={cardStyle}>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
        <ModeTab
          active={mode === "auto"}
          label={t("metaPixelData.modeAuto")}
          onClick={() => setMode("auto")}
        />
        <ModeTab
          active={mode === "manual"}
          label={t("metaPixelData.modeManual")}
          onClick={() => setMode("manual")}
        />
      </div>

      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "flex-start" }}>
        <div>
          <h3 style={{ margin: 0, fontSize: 15 }}>
            {mode === "auto"
              ? t("metaPixelData.sectionStatsAuto")
              : t("metaPixelData.sectionStatsManual")}
          </h3>
          <p style={{ margin: "6px 0 0", ...pageHintTextStyle }}>{modeHint}</p>
        </div>
        <button
          type="button"
          style={secondaryBtn}
          disabled={loading || (mode === "manual" && !manualConnected)}
          onClick={() => void load()}
        >
          {loading ? t("metaPixelData.statsLoading") : t("metaPixelData.statsRefresh")}
        </button>
      </div>

      {mode === "manual" ? (
        <div
          style={{
            padding: 12,
            borderRadius: 8,
            background: pageColorTokens.surfaceMuted,
            fontSize: 13,
            display: "flex",
            flexDirection: "column",
            gap: 10,
          }}
        >
          <p style={{ margin: 0, ...pageHintTextStyle }}>{t("metaPixelData.manualAuthHint")}</p>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
            <span>
              {manualConnected
                ? t("metaPixelData.manualAuthConnected")
                : t("metaPixelData.manualAuthDisconnected")}
            </span>
            {manualConnected && manualUpdatedAt ? (
              <span style={pageHintTextStyle}>
                {t("metaPixelData.manualAuthUpdatedAt", {
                  time: new Date(manualUpdatedAt).toLocaleString(i18n.language),
                })}
              </span>
            ) : null}
          </div>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            {!manualConnected ? (
              <button
                type="button"
                style={primaryBtn}
                disabled={authBusy || manualOAuth.redirecting}
                onClick={() => void startManualAuth()}
              >
                {authBusy || manualOAuth.redirecting
                  ? t("metaPixelData.manualAuthBusy")
                  : t("metaPixelData.manualAuthConnect")}
              </button>
            ) : (
              <button
                type="button"
                style={secondaryBtn}
                disabled={authBusy}
                onClick={() => void disconnectManualAuth()}
              >
                {t("metaPixelData.manualAuthDisconnect")}
              </button>
            )}
          </div>
        </div>
      ) : null}

      <StatsBody
        stats={stats}
        error={error}
        loading={loading}
        locale={i18n.language}
        locationSearch={locationSearch}
        t={t}
      />
    </div>
  );
}
