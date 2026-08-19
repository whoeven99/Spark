import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useLoaderData, useRevalidator } from "react-router";
import { useTranslation } from "react-i18next";
import { useEmbeddedLocationSearch } from "../../hooks/useEmbeddedLocationSearch";
import {
  buildMetaEventsManagerUrl,
  buildMetaPixelThemeEditorUrl,
  META_PIXEL_ALL_EVENTS,
  type MetaPixelEventName,
} from "../../lib/metaPixelEvents";
import type { MetaPixelDataLoaderData } from "../app.ads.meta-pixel.data";
import { MetaPixelStatsPanel } from "../component/adsCatalog/MetaPixelStatsPanel";
import {
  PageHeaderNav,
  pageColorTokens,
  pageContentStyle,
  pageHintTextStyle,
} from "./pageUiStyles";

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

const primaryBtn = {
  padding: "10px 16px",
  borderRadius: 8,
  background: pageColorTokens.brandGreen,
  color: "#fff",
  border: "none",
  fontSize: 13,
  fontWeight: 700,
  cursor: "pointer",
  textDecoration: "none" as const,
  display: "inline-block",
};

const secondaryBtn = {
  padding: "10px 16px",
  borderRadius: 8,
  background: "#fff",
  color: pageColorTokens.textPrimary,
  border: `1px solid ${pageColorTokens.borderSubtle}`,
  fontSize: 13,
  fontWeight: 600,
  cursor: "pointer",
  textDecoration: "none" as const,
  display: "inline-block",
};

const rowStyle = {
  display: "flex",
  justifyContent: "space-between",
  gap: 16,
  alignItems: "flex-start",
  fontSize: 13,
  padding: "8px 0",
  borderBottom: `1px solid ${pageColorTokens.divider}`,
};

function formatTime(value: string | null | undefined, empty: string, locale: string): string {
  if (!value) return empty;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString(locale);
}

function StatusPill({
  tone,
  children,
}: {
  tone: "ok" | "warn" | "critical" | "muted";
  children: string;
}) {
  const palette =
    tone === "ok"
      ? { bg: pageColorTokens.brandGreenLight, color: pageColorTokens.brandGreenDeep }
      : tone === "warn"
        ? { bg: "#fff7e0", color: "#8a6d00" }
        : tone === "critical"
          ? { bg: pageColorTokens.criticalBg, color: pageColorTokens.criticalText }
          : { bg: pageColorTokens.surfaceMuted, color: pageColorTokens.textSecondary };
  return (
    <span
      style={{
        display: "inline-block",
        padding: "2px 8px",
        borderRadius: 999,
        fontSize: 12,
        fontWeight: 700,
        background: palette.bg,
        color: palette.color,
      }}
    >
      {children}
    </span>
  );
}

function DataRow({
  label,
  value,
  strong,
}: {
  label: string;
  value: string;
  strong?: boolean;
}) {
  return (
    <div style={rowStyle}>
      <span style={{ color: pageColorTokens.textSecondary }}>{label}</span>
      <span style={{ fontWeight: strong ? 700 : 500, textAlign: "right" }}>{value}</span>
    </div>
  );
}

const META_EVENT_I18N: Record<MetaPixelEventName, string> = {
  ViewContent: "adsCatalog.metaPixelEventViewContent",
  AddToCart: "adsCatalog.metaPixelEventAddToCart",
  InitiateCheckout: "adsCatalog.metaPixelEventInitiateCheckout",
  Purchase: "adsCatalog.metaPixelEventPurchase",
  PageView: "adsCatalog.metaPixelEventPageView",
  Search: "adsCatalog.metaPixelEventSearch",
};

export function MetaPixelDataPage() {
  const { t, i18n } = useTranslation();
  const data = useLoaderData<MetaPixelDataLoaderData>();
  const revalidator = useRevalidator();
  const locationSearch = useEmbeddedLocationSearch();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [embed, setEmbed] = useState(data.embed);

  useEffect(() => {
    setEmbed(data.embed);
  }, [data.embed]);

  const themeEditorUrl = useMemo(
    () =>
      buildMetaPixelThemeEditorUrl({
        shopDomain: data.shopDomain,
        apiKey: data.shopifyApiKey,
      }),
    [data.shopDomain, data.shopifyApiKey],
  );
  const eventsManagerUrl = useMemo(
    () => buildMetaEventsManagerUrl(data.config?.pixelId),
    [data.config?.pixelId],
  );

  const refreshEmbed = useCallback(async () => {
    setBusy(true);
    setError("");
    try {
      const resp = await fetch(`/api/ads-catalog/meta-embed-status${locationSearch}`);
      const json = (await resp.json()) as {
        enabled?: boolean;
        checkedAt?: string;
        unavailable?: boolean;
      };
      setEmbed({
        enabled: Boolean(json.enabled),
        checkedAt: typeof json.checkedAt === "string" ? json.checkedAt : new Date().toISOString(),
        unavailable: Boolean(json.unavailable),
      });
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : t("metaPixelData.refreshFailed"));
    } finally {
      setBusy(false);
    }
  }, [locationSearch, t]);

  if (!data.config) {
    return (
      <div style={pageContentStyle}>
        <PageHeaderNav
          title={t("metaPixelData.pageTitle")}
          subtitle={t("metaPixelData.pageSubtitle")}
          backLabel={t("metaPixelData.back")}
          fallbackPath="/app/ads-catalog"
          preserveSearch
        />
        <div style={cardStyle}>
          <p style={{ margin: 0, fontSize: 14 }}>{t("metaPixelData.emptyBody")}</p>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <Link to={`/app/ads-catalog${locationSearch}`} style={primaryBtn}>
              {t("metaPixelData.configureInCatalog")}
            </Link>
            <Link to={`/app/ads-catalog${locationSearch}`} style={secondaryBtn}>
              {t("metaPixelData.back")}
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const config = data.config;
  const embedTone = embed.unavailable ? "muted" : embed.enabled ? "ok" : "critical";
  const embedLabel = embed.unavailable
    ? t("metaPixelData.embedUnavailable")
    : embed.enabled
      ? t("metaPixelData.embedEnabled")
      : t("metaPixelData.embedDisabled");

  return (
    <div style={pageContentStyle}>
      <PageHeaderNav
        title={t("metaPixelData.pageTitle")}
        subtitle={t("metaPixelData.pageSubtitle")}
        backLabel={t("metaPixelData.back")}
        fallbackPath="/app/ads-catalog"
        preserveSearch
      />

      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
        <Link to={`/app/ads-catalog${locationSearch}`} style={primaryBtn}>
          {t("metaPixelData.editConfig")}
        </Link>
        {themeEditorUrl ? (
          <a href={themeEditorUrl} target="_blank" rel="noreferrer" style={secondaryBtn}>
            {t("adsCatalog.metaPixelOpenThemeEditor")}
          </a>
        ) : null}
        <a href={eventsManagerUrl} target="_blank" rel="noreferrer" style={secondaryBtn}>
          {t("metaPixelData.openEventsManager")}
        </a>
        <Link to={`/app/insights/charts/performance${locationSearch}`} style={secondaryBtn}>
          {t("metaPixelData.openInsights")}
        </Link>
      </div>

      <MetaPixelStatsPanel
        locationSearch={locationSearch}
        enabled={Boolean(config.pixelId)}
        manualAuthConnected={data.manualAuthConnected}
        manualAuthUpdatedAt={data.manualAuthUpdatedAt}
        onManualAuthChanged={() => revalidator.revalidate()}
      />

      <div style={cardStyle}>
        <h3 style={{ margin: 0, fontSize: 15 }}>{t("metaPixelData.sectionOverview")}</h3>
        <DataRow label={t("metaPixelData.pixelId")} value={config.pixelId} strong />
        <DataRow
          label={t("metaPixelData.catalogId")}
          value={data.catalogId || t("metaPixelData.none")}
        />
        <DataRow
          label={t("metaPixelData.metaAdsConnected")}
          value={data.metaAdsConnected ? t("metaPixelData.yes") : t("metaPixelData.no")}
        />
        {data.metaAdsAdAccountId ? (
          <DataRow label={t("metaPixelData.metaAdsAccount")} value={data.metaAdsAdAccountId} />
        ) : null}
        <DataRow
          label={t("metaPixelData.capiEnabled")}
          value={config.capiEnabled ? t("metaPixelData.on") : t("metaPixelData.off")}
        />
        <DataRow
          label={t("metaPixelData.capiToken")}
          value={config.hasCapiAccessToken ? t("metaPixelData.yes") : t("metaPixelData.no")}
        />
        <DataRow
          label={t("metaPixelData.testEventCode")}
          value={config.testEventCode || t("metaPixelData.none")}
        />
        <DataRow
          label={t("metaPixelData.credentialUpdatedAt")}
          value={formatTime(data.credentialUpdatedAt, t("metaPixelData.none"), i18n.language)}
        />
      </div>

      <div style={cardStyle}>
        <h3 style={{ margin: 0, fontSize: 15 }}>{t("metaPixelData.sectionRuntime")}</h3>
        <div style={rowStyle}>
          <span style={{ color: pageColorTokens.textSecondary }}>{t("metaPixelData.appEmbed")}</span>
          <StatusPill tone={embedTone}>{embedLabel}</StatusPill>
        </div>
        <p style={{ margin: 0, ...pageHintTextStyle }}>
          {t("metaPixelData.embedCheckedAt", {
            time: formatTime(embed.checkedAt, t("metaPixelData.none"), i18n.language),
          })}
        </p>
        <button type="button" style={secondaryBtn} disabled={busy} onClick={() => void refreshEmbed()}>
          {t("metaPixelData.refreshEmbed")}
        </button>
        {error ? (
          <p style={{ margin: 0, color: pageColorTokens.criticalText, fontSize: 13 }}>{error}</p>
        ) : null}
      </div>

      <div style={cardStyle}>
        <h3 style={{ margin: 0, fontSize: 15 }}>{t("metaPixelData.sectionEvents")}</h3>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {META_PIXEL_ALL_EVENTS.map((eventName) => {
            const on = config.enabledEvents.includes(eventName);
            return (
              <div
                key={eventName}
                style={{ display: "flex", justifyContent: "space-between", gap: 12, fontSize: 13 }}
              >
                <span>{t(META_EVENT_I18N[eventName])}</span>
                <StatusPill tone={on ? "ok" : "muted"}>
                  {on ? t("metaPixelData.on") : t("metaPixelData.off")}
                </StatusPill>
              </div>
            );
          })}
        </div>
      </div>

      <div style={cardStyle}>
        <h3 style={{ margin: 0, fontSize: 15 }}>{t("metaPixelData.sectionLimits")}</h3>
        <p style={{ margin: 0, fontSize: 13, lineHeight: 1.5 }}>{t("metaPixelData.limitsBody")}</p>
      </div>
    </div>
  );
}
