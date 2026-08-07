import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useLoaderData, useNavigate, useRevalidator } from "react-router";
import { useTranslation } from "react-i18next";
import { useEmbeddedLocationSearch } from "../../hooks/useEmbeddedLocationSearch";
import {
  PageHeaderNav,
  pageColorTokens,
  pageContentStyle,
  pageHintTextStyle,
} from "./pageUiStyles";
import {
  buildGoogleRemarketingThemeEditorUrl,
  buildShopifyCustomerEventsUrl,
  GOOGLE_REMARKETING_CORE_EVENTS,
  GOOGLE_REMARKETING_FIELD_GROUPS,
} from "../../lib/googleRemarketing";
import type { GooglePixelDataLoaderData } from "../app.ads.google-pixel.data";
import { GoogleAdsPerformancePanel } from "../component/googlePixel/GoogleAdsPerformancePanel";

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

function formatTime(value: string | null | undefined, empty: string): string {
  if (!value) return empty;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
}

function formatCustomerId(id: string): string {
  const digits = id.replace(/\D/g, "");
  if (digits.length !== 10) return id || "—";
  return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`;
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

export function GooglePixelDataPage() {
  const { t } = useTranslation();
  const data = useLoaderData<GooglePixelDataLoaderData>();
  const navigate = useNavigate();
  const revalidator = useRevalidator();
  const locationSearch = useEmbeddedLocationSearch();
  const [busy, setBusy] = useState(false);
  const [hint, setHint] = useState("");
  const [error, setError] = useState("");
  const [embed, setEmbed] = useState(data.embed);

  useEffect(() => {
    setEmbed(data.embed);
  }, [data.embed]);

  const themeEditorUrl = useMemo(
    () =>
      buildGoogleRemarketingThemeEditorUrl({
        shopDomain: data.shopDomain,
        apiKey: data.shopifyApiKey,
      }),
    [data.shopDomain, data.shopifyApiKey],
  );
  const customerEventsUrl = useMemo(
    () => buildShopifyCustomerEventsUrl(data.shopDomain),
    [data.shopDomain],
  );

  const refreshEmbed = useCallback(async () => {
    setBusy(true);
    setError("");
    try {
      const resp = await fetch(`/api/ads-catalog/google-embed-status${locationSearch}`);
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
      setError(reason instanceof Error ? reason.message : t("googlePixelData.refreshFailed"));
    } finally {
      setBusy(false);
    }
  }, [locationSearch, t]);

  async function copyScript() {
    if (!data.customPixelScript) return;
    try {
      await navigator.clipboard.writeText(data.customPixelScript);
      setHint(t("adsCatalog.googleRemarketing.pixelCopied"));
    } catch {
      setHint(t("adsCatalog.googleRemarketing.pixelCopyFailed"));
    }
  }

  async function confirmCustomPixel() {
    if (!data.config) return;
    setBusy(true);
    setError("");
    try {
      const resp = await fetch(`/api/ads-catalog/google-remarketing${locationSearch}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tagId: data.config.tagId,
          source: data.config.source,
          enabledEvents: data.config.enabledEvents,
          enabledFieldGroups: data.config.enabledFieldGroups,
          pixelName: data.config.pixelName,
          conversionLabel: data.config.conversionLabel,
          enhancedConversions: data.config.enhancedConversions,
          customPixelConfirmed: true,
        }),
      });
      const json = (await resp.json()) as { ok?: boolean; error?: string };
      if (!resp.ok || !json.ok) {
        throw new Error(json.error || t("googlePixelData.confirmFailed"));
      }
      revalidator.revalidate();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : t("googlePixelData.confirmFailed"));
    } finally {
      setBusy(false);
    }
  }

  async function resetCustomPixel() {
    setBusy(true);
    setError("");
    try {
      const resp = await fetch(`/api/ads-catalog/google-remarketing${locationSearch}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ operation: "reset_custom_pixel" }),
      });
      const json = (await resp.json()) as { ok?: boolean; error?: string };
      if (!resp.ok || !json.ok) {
        throw new Error(json.error || t("googlePixelData.resetFailed"));
      }
      revalidator.revalidate();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : t("googlePixelData.resetFailed"));
    } finally {
      setBusy(false);
    }
  }

  if (!data.config) {
    return (
      <div style={pageContentStyle}>
        <PageHeaderNav
          title={t("googlePixelData.pageTitle")}
          subtitle={t("googlePixelData.pageSubtitle")}
          backLabel={t("googlePixelData.back")}
          fallbackPath="/app/ads-catalog"
          preserveSearch
        />
        <div style={cardStyle}>
          <p style={{ margin: 0, fontSize: 14 }}>{t("googlePixelData.emptyBody")}</p>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <Link to={`/app/ads/google-pixel${locationSearch}`} style={primaryBtn}>
              {t("adsCatalog.googlePixelSetup")}
            </Link>
            <Link to={`/app/ads-catalog${locationSearch}`} style={secondaryBtn}>
              {t("googlePixelData.back")}
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const config = data.config;
  const embedTone = embed.unavailable ? "muted" : embed.enabled ? "ok" : "critical";
  const embedLabel = embed.unavailable
    ? t("googlePixelData.embedUnavailable")
    : embed.enabled
      ? t("googlePixelData.embedEnabled")
      : t("googlePixelData.embedDisabled");
  const syncTone =
    config.metafieldSyncStatus === "synced"
      ? "ok"
      : config.metafieldSyncStatus === "failed"
        ? "critical"
        : "muted";
  const syncLabel =
    config.metafieldSyncStatus === "synced"
      ? t("googlePixelData.syncSynced")
      : config.metafieldSyncStatus === "failed"
        ? t("googlePixelData.syncFailed")
        : t("googlePixelData.syncUnknown");

  return (
    <div style={pageContentStyle}>
      <PageHeaderNav
        title={t("googlePixelData.pageTitle")}
        subtitle={t("googlePixelData.pageSubtitle")}
        backLabel={t("googlePixelData.back")}
        fallbackPath="/app/ads-catalog"
        preserveSearch
      />

      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
        <Link to={`/app/ads/google-pixel${locationSearch}`} style={primaryBtn}>
          {t("googlePixelData.editWizard")}
        </Link>
        <a href={themeEditorUrl} target="_blank" rel="noreferrer" style={secondaryBtn}>
          {t("adsCatalog.googleRemarketing.openThemeEditor")}
        </a>
        <Link to={`/app/settings/ads-insights${locationSearch}`} style={secondaryBtn}>
          {t("googlePixelData.openInsights")}
        </Link>
      </div>

      <GoogleAdsPerformancePanel enabled={data.adsConnected} />

      <div style={cardStyle}>
        <h3 style={{ margin: 0, fontSize: 15 }}>{t("googlePixelData.sectionOverview")}</h3>
        <DataRow label={t("googlePixelData.pixelName")} value={config.pixelName || "—"} />
        <DataRow label={t("googlePixelData.tagId")} value={config.tagId} strong />
        <DataRow
          label={t("googlePixelData.conversionLabel")}
          value={config.conversionLabel || t("googlePixelData.none")}
        />
        <DataRow
          label={t("googlePixelData.source")}
          value={
            config.source === "manual"
              ? t("googlePixelData.sourceManual")
              : t("googlePixelData.sourceAuto")
          }
        />
        <DataRow
          label={t("googlePixelData.confirmedAt")}
          value={formatTime(config.confirmedAt, t("googlePixelData.none"))}
        />
        <DataRow
          label={t("googlePixelData.enhanced")}
          value={
            config.enhancedConversions
              ? t("googlePixelData.enhancedOn")
              : t("googlePixelData.enhancedOff")
          }
        />
      </div>

      <div style={cardStyle}>
        <h3 style={{ margin: 0, fontSize: 15 }}>{t("googlePixelData.sectionAccount")}</h3>
        <DataRow
          label={t("googlePixelData.adsConnected")}
          value={
            data.adsConnected ? t("googlePixelData.yes") : t("googlePixelData.no")
          }
        />
        <DataRow
          label={t("googlePixelData.customerId")}
          value={formatCustomerId(data.customerId)}
        />
        <DataRow
          label={t("googlePixelData.loginCustomerId")}
          value={
            data.loginCustomerId
              ? formatCustomerId(data.loginCustomerId)
              : t("googlePixelData.none")
          }
        />
        <DataRow
          label={t("googlePixelData.credentialUpdatedAt")}
          value={formatTime(data.credentialUpdatedAt, t("googlePixelData.none"))}
        />
      </div>

      <div style={cardStyle}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center" }}>
          <h3 style={{ margin: 0, fontSize: 15 }}>{t("googlePixelData.sectionRuntime")}</h3>
          <button type="button" style={secondaryBtn} disabled={busy} onClick={() => void refreshEmbed()}>
            {t("googlePixelData.refreshEmbed")}
          </button>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ fontSize: 13 }}>{t("googlePixelData.appEmbed")}</span>
          <StatusPill tone={embedTone}>{embedLabel}</StatusPill>
        </div>
        <p style={{ ...pageHintTextStyle, margin: 0 }}>
          {t("googlePixelData.embedCheckedAt", {
            time: formatTime(embed.checkedAt, t("googlePixelData.none")),
          })}
        </p>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ fontSize: 13 }}>{t("googlePixelData.metafieldSync")}</span>
          <StatusPill tone={syncTone}>{syncLabel}</StatusPill>
        </div>
        <DataRow
          label={t("googlePixelData.metafieldSyncedAt")}
          value={formatTime(config.metafieldSyncUpdatedAt, t("googlePixelData.none"))}
        />
        {config.metafieldSyncError ? (
          <p style={{ margin: 0, color: pageColorTokens.critical, fontSize: 13 }}>
            {config.metafieldSyncError}
          </p>
        ) : null}
      </div>

      <div style={cardStyle}>
        <h3 style={{ margin: 0, fontSize: 15 }}>{t("googlePixelData.sectionEvents")}</h3>
        <EventChecklist
          all={[...GOOGLE_REMARKETING_CORE_EVENTS]}
          enabled={config.enabledEvents}
          labelOf={(value) => t(`adsCatalog.googleRemarketing.events.${value}`)}
        />
        <p style={pageHintTextStyle}>{t("googlePixelData.purchaseNote")}</p>
      </div>

      <div style={cardStyle}>
        <h3 style={{ margin: 0, fontSize: 15 }}>{t("googlePixelData.sectionFields")}</h3>
        <EventChecklist
          all={[...GOOGLE_REMARKETING_FIELD_GROUPS]}
          enabled={config.enabledFieldGroups}
          labelOf={(value) => t(`adsCatalog.googleRemarketing.fields.${value}`)}
        />
      </div>

      <div style={cardStyle}>
        <h3 style={{ margin: 0, fontSize: 15 }}>{t("googlePixelData.sectionCustomPixel")}</h3>
        <p style={{ margin: 0, fontSize: 13 }}>
          {config.customPixelConfirmedAt
            ? t("adsCatalog.googleRemarketing.pixelConfirmed", {
                time: formatTime(config.customPixelConfirmedAt, t("googlePixelData.none")),
              })
            : t("adsCatalog.googleRemarketing.pixelUnconfirmed")}
        </p>
        {data.customPixelScript ? (
          <textarea
            readOnly
            value={data.customPixelScript}
            rows={10}
            style={{ width: "100%", fontFamily: "monospace", fontSize: 12, boxSizing: "border-box" }}
          />
        ) : (
          <p style={pageHintTextStyle}>{t("adsCatalog.googleRemarketing.pixelNeedsConfig")}</p>
        )}
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <button type="button" style={primaryBtn} disabled={busy || !data.customPixelScript} onClick={() => void copyScript()}>
            {t("adsCatalog.googleRemarketing.copyPixel")}
          </button>
          <a href={customerEventsUrl} target="_blank" rel="noreferrer" style={secondaryBtn}>
            {t("adsCatalog.googleRemarketing.openCustomerEvents")}
          </a>
          <button type="button" style={secondaryBtn} disabled={busy} onClick={() => void confirmCustomPixel()}>
            {t("adsCatalog.googleRemarketing.confirmPixelInstalled")}
          </button>
          <button type="button" style={secondaryBtn} disabled={busy || !config.customPixelConfirmedAt} onClick={() => void resetCustomPixel()}>
            {t("adsCatalog.googleRemarketing.resetPixelConfirmation")}
          </button>
        </div>
      </div>

      <div style={cardStyle}>
        <h3 style={{ margin: 0, fontSize: 15 }}>{t("googlePixelData.sectionLimits")}</h3>
        <p style={{ margin: 0, fontSize: 13, lineHeight: 1.6 }}>{t("googlePixelData.limitsBody")}</p>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <button
            type="button"
            style={secondaryBtn}
            onClick={() => navigate(`/app/settings/ads-insights${locationSearch}`)}
          >
            {t("googlePixelData.openInsights")}
          </button>
        </div>
      </div>

      {hint ? <div style={pageHintTextStyle}>{hint}</div> : null}
      {error ? <div style={{ color: pageColorTokens.critical, fontSize: 13 }}>{error}</div> : null}
    </div>
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
      <span
        style={{
          fontWeight: strong ? 700 : 600,
          color: strong ? pageColorTokens.brandGreenDeep : pageColorTokens.textPrimary,
          textAlign: "right",
          wordBreak: "break-all",
        }}
      >
        {value}
      </span>
    </div>
  );
}

function EventChecklist({
  all,
  enabled,
  labelOf,
}: {
  all: string[];
  enabled: string[];
  labelOf: (value: string) => string;
}) {
  const { t } = useTranslation();
  const enabledSet = new Set(enabled);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {all.map((value) => {
        const on = enabledSet.has(value);
        return (
          <div key={value} style={{ display: "flex", justifyContent: "space-between", gap: 12, fontSize: 13 }}>
            <span>{labelOf(value)}</span>
            <StatusPill tone={on ? "ok" : "muted"}>
              {on ? t("googlePixelData.on") : t("googlePixelData.off")}
            </StatusPill>
          </div>
        );
      })}
    </div>
  );
}
