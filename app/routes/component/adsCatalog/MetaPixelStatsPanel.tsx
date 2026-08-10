import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router";
import { useTranslation } from "react-i18next";
import {
  pageColorTokens,
  pageHintTextStyle,
} from "../../page/pageUiStyles";

type StatsRow = { value: string; count: number };

type StatsResponse = {
  ok?: boolean;
  configured?: boolean;
  pixelId?: string;
  tokenSource?: "meta_ads_oauth" | "catalog_oauth" | null;
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
              <th style={{ textAlign: "left", padding: "6px 8px", borderBottom: `1px solid ${pageColorTokens.divider}` }}>
                Event
              </th>
              <th style={{ textAlign: "right", padding: "6px 8px", borderBottom: `1px solid ${pageColorTokens.divider}` }}>
                Count
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.value}>
                <td style={{ padding: "6px 8px", borderBottom: `1px solid ${pageColorTokens.divider}` }}>
                  {row.value}
                </td>
                <td style={{ padding: "6px 8px", textAlign: "right", borderBottom: `1px solid ${pageColorTokens.divider}` }}>
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

export function MetaPixelStatsPanel({
  locationSearch,
  enabled,
}: {
  locationSearch: string;
  enabled: boolean;
}) {
  const { t, i18n } = useTranslation();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [stats, setStats] = useState<StatsResponse | null>(null);

  const load = useCallback(async () => {
    if (!enabled) return;
    setLoading(true);
    setError("");
    try {
      const resp = await fetch(`/api/ads-catalog/meta-pixel-stats${locationSearch}`);
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
  }, [enabled, locationSearch, t]);

  useEffect(() => {
    void load();
  }, [load]);

  if (!enabled) {
    return (
      <div style={cardStyle}>
        <p style={{ margin: 0, fontSize: 14 }}>{t("metaPixelData.statsNeedPixel")}</p>
      </div>
    );
  }

  const tokenSourceLabel =
    stats?.tokenSource === "meta_ads_oauth"
      ? t("metaPixelData.tokenSourceMetaAds")
      : stats?.tokenSource === "catalog_oauth"
        ? t("metaPixelData.tokenSourceCatalog")
        : t("metaPixelData.none");

  return (
    <div style={cardStyle}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "flex-start" }}>
        <div>
          <h3 style={{ margin: 0, fontSize: 15 }}>{t("metaPixelData.sectionStats")}</h3>
          <p style={{ margin: "6px 0 0", ...pageHintTextStyle }}>{t("metaPixelData.statsHint")}</p>
        </div>
        <button type="button" style={secondaryBtn} disabled={loading} onClick={() => void load()}>
          {loading ? t("metaPixelData.statsLoading") : t("metaPixelData.statsRefresh")}
        </button>
      </div>

      {loading && !stats ? (
        <p style={pageHintTextStyle}>{t("metaPixelData.statsLoading")}</p>
      ) : null}

      {error ? (
        <p style={{ margin: 0, color: pageColorTokens.criticalText, fontSize: 13 }}>{error}</p>
      ) : null}

      {stats?.permissionError ? (
        <div style={{ fontSize: 13, color: pageColorTokens.criticalText }}>
          <p style={{ margin: 0 }}>{t("metaPixelData.statsPermissionError")}</p>
          {stats.permissionError !== "no_token" ? (
            <p style={{ margin: "6px 0 0", color: pageColorTokens.textSecondary }}>{stats.permissionError}</p>
          ) : null}
          {stats.needsMetaAdsConnect ? (
            <p style={{ margin: "8px 0 0" }}>
              <Link to={`/app/ads-catalog${locationSearch}`}>{t("metaPixelData.connectMetaAds")}</Link>
            </p>
          ) : null}
        </div>
      ) : null}

      {stats && !stats.permissionError ? (
        <>
          <p style={{ margin: 0, fontSize: 13, color: pageColorTokens.textSecondary }}>
            {t("metaPixelData.statsWindow", {
              days: stats.windowDays ?? 7,
              window: formatWindow(stats.from, stats.to, i18n.language),
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
                  ? new Date(stats.metadata.lastFiredTime).toLocaleString(i18n.language)
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
            <HourlyFireChart points={stats.hourlyFires ?? []} locale={i18n.language} />
          </div>
        </>
      ) : null}
    </div>
  );
}
