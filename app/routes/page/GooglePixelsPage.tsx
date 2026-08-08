import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useLoaderData, useRevalidator } from "react-router";
import { useTranslation } from "react-i18next";
import { useEmbeddedLocationSearch } from "../../hooks/useEmbeddedLocationSearch";
import {
  GOOGLE_PIXEL_SETUP_EVENTS,
  type GooglePixelEventConversions,
  type GooglePixelSetupEvent,
} from "../../lib/googlePixelEvents";
import {
  buildGoogleRemarketingThemeEditorUrl,
  buildShopifyCustomerEventsUrl,
} from "../../lib/googleRemarketing";
import {
  PageHeaderNav,
  pageColorTokens,
  pageContentStyle,
  pageHintTextStyle,
} from "./pageUiStyles";
import type { GooglePixelLoaderData } from "../app.ads.google-pixel._index";
import { GoogleAdsPerformancePanel } from "../component/googlePixel/GoogleAdsPerformancePanel";
import { GooglePixelSetupModal } from "../component/googlePixel/GooglePixelSetupModal";

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
};

function formatCustomerId(id: string): string {
  const digits = id.replace(/\D/g, "");
  if (digits.length !== 10) return id || "—";
  return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`;
}

function eventTone(event: GooglePixelSetupEvent): { bg: string; color: string } {
  switch (event) {
    case "page_view":
      return { bg: "#fff7d6", color: "#8a6d00" };
    case "add_to_cart":
      return { bg: "#ffe8d6", color: "#9a3412" };
    case "begin_checkout":
      return { bg: "#e0f2fe", color: "#0369a1" };
    case "purchase":
      return { bg: "#dcfce7", color: "#166534" };
    default:
      return { bg: "#ede9fe", color: "#5b21b6" };
  }
}

export function GooglePixelsPage() {
  const { t } = useTranslation();
  const data = useLoaderData<GooglePixelLoaderData>();
  const revalidator = useRevalidator();
  const locationSearch = useEmbeddedLocationSearch();
  const [setupOpen, setSetupOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [hint, setHint] = useState("");
  const [customPixelScript, setCustomPixelScript] = useState(data.customPixelScript ?? "");
  const [embed, setEmbed] = useState(data.embed);

  useEffect(() => {
    setEmbed(data.embed);
    setCustomPixelScript(data.customPixelScript ?? "");
  }, [data.customPixelScript, data.embed]);

  const defaultPixelName = useMemo(() => {
    const handle = data.shopDomain.replace(/\.myshopify\.com$/i, "");
    return data.config?.pixelName || handle;
  }, [data.config?.pixelName, data.shopDomain]);

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
    } finally {
      setBusy(false);
    }
  }, [locationSearch]);

  async function toggleEnhanced(enabled: boolean) {
    if (!data.config) return;
    setBusy(true);
    setError("");
    try {
      const resp = await fetch(`/api/ads-catalog/google-remarketing${locationSearch}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ operation: "update_settings", enhancedConversions: enabled }),
      });
      const json = (await resp.json()) as { ok?: boolean; error?: string };
      if (!resp.ok || !json.ok) throw new Error(json.error || t("googlePixelOnboarding.saveFailed"));
      revalidator.revalidate();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : t("googlePixelOnboarding.saveFailed"));
    } finally {
      setBusy(false);
    }
  }

  async function toggleEvent(event: GooglePixelSetupEvent, disabled: boolean) {
    setBusy(true);
    setError("");
    try {
      const resp = await fetch(`/api/ads-catalog/google-remarketing${locationSearch}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ operation: "toggle_event", event, disabled }),
      });
      const json = (await resp.json()) as { ok?: boolean; error?: string };
      if (!resp.ok || !json.ok) throw new Error(json.error || t("googlePixelOnboarding.saveFailed"));
      revalidator.revalidate();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : t("googlePixelOnboarding.saveFailed"));
    } finally {
      setBusy(false);
    }
  }

  async function copyScript() {
    if (!customPixelScript) return;
    try {
      await navigator.clipboard.writeText(customPixelScript);
      setHint(t("adsCatalog.googleRemarketing.pixelCopied"));
    } catch {
      setHint(t("adsCatalog.googleRemarketing.pixelCopyFailed"));
    }
  }

  const rows = buildPixelRows(data.config?.eventConversions, data.config?.tagId);

  return (
    <div style={pageContentStyle}>
      <PageHeaderNav
        title={t("googlePixel.pageTitle")}
        subtitle={t("googlePixel.pageSubtitle")}
        backLabel={t("googlePixelOnboarding.back")}
        fallbackPath="/app/ads-catalog"
        preserveSearch
      />

      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <button type="button" style={primaryBtn} onClick={() => setSetupOpen(true)}>
          {t("googlePixel.setupPixel")}
        </button>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <a href={themeEditorUrl} target="_blank" rel="noreferrer" style={secondaryBtn}>
            {t("adsCatalog.googleRemarketing.openThemeEditor")}
          </a>
          <Link to={`/app/settings/ads-insights${locationSearch}`} style={secondaryBtn}>
            {t("googlePixelData.openInsights")}
          </Link>
        </div>
      </div>

      <div style={cardStyle}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center" }}>
          <strong style={{ fontSize: 14 }}>{t("googlePixel.recommendations")}</strong>
        </div>
        <SettingToggle
          label={t("googlePixelOnboarding.enhancedTitle")}
          hint={t("googlePixelOnboarding.enhancedBody")}
          enabled={Boolean(data.config?.enhancedConversions)}
          disabled={!data.config || busy}
          onToggle={(enabled) => void toggleEnhanced(enabled)}
        />
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
          <span style={{ fontSize: 13 }}>{t("googlePixelData.appEmbed")}</span>
          <StatusPill tone={embed.unavailable ? "muted" : embed.enabled ? "ok" : "critical"}>
            {embed.unavailable
              ? t("googlePixelData.embedUnavailable")
              : embed.enabled
                ? t("googlePixelData.embedEnabled")
                : t("googlePixelData.embedDisabled")}
          </StatusPill>
          <button type="button" style={secondaryBtn} disabled={busy} onClick={() => void refreshEmbed()}>
            {t("googlePixelOnboarding.refreshStatus")}
          </button>
        </div>
      </div>

      {rows.length === 0 ? (
        <div style={cardStyle}>
          <p style={{ margin: 0, fontSize: 14 }}>{t("adsCatalog.googlePixelNotConfigured")}</p>
          <button type="button" style={primaryBtn} onClick={() => setSetupOpen(true)}>
            {t("googlePixel.setupPixel")}
          </button>
        </div>
      ) : (
        <div style={cardStyle}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center" }}>
            <strong style={{ fontSize: 15 }}>
              {data.customerName || t("googlePixel.setup.accountFallback")} ({formatCustomerId(data.customerId)})
            </strong>
          </div>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr style={{ textAlign: "left", borderBottom: `1px solid ${pageColorTokens.divider}` }}>
                  <th style={{ padding: "8px 6px" }}>{t("googlePixel.table.name")}</th>
                  <th style={{ padding: "8px 6px" }}>{t("googlePixel.table.event")}</th>
                  <th style={{ padding: "8px 6px" }}>{t("googlePixel.table.conversionId")}</th>
                  <th style={{ padding: "8px 6px" }}>{t("googlePixel.table.label")}</th>
                  <th style={{ padding: "8px 6px" }}>{t("googlePixel.table.status")}</th>
                  <th style={{ padding: "8px 6px" }}>{t("googlePixel.table.actions")}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => {
                  const tone = eventTone(row.event);
                  return (
                    <tr key={row.event} style={{ borderBottom: `1px solid ${pageColorTokens.divider}` }}>
                      <td style={{ padding: "10px 6px" }}>{row.name}</td>
                      <td style={{ padding: "10px 6px" }}>
                        <span
                          style={{
                            padding: "2px 8px",
                            borderRadius: 999,
                            background: tone.bg,
                            color: tone.color,
                            fontWeight: 700,
                            fontSize: 12,
                          }}
                        >
                          {t(`googlePixel.setup.events.${row.event}`)}
                        </span>
                      </td>
                      <td style={{ padding: "10px 6px" }}>{row.tagId}</td>
                      <td style={{ padding: "10px 6px", wordBreak: "break-all" }}>{row.label}</td>
                      <td style={{ padding: "10px 6px" }}>
                        <StatusPill tone={row.disabled ? "muted" : "ok"}>
                          {row.disabled ? t("googlePixel.statusDisabled") : t("googlePixel.statusHealthy")}
                        </StatusPill>
                      </td>
                      <td style={{ padding: "10px 6px" }}>
                        <button
                          type="button"
                          style={secondaryBtn}
                          disabled={busy}
                          onClick={() => void toggleEvent(row.event, !row.disabled)}
                        >
                          {row.disabled ? t("googlePixel.enable") : t("googlePixel.disable")}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {customPixelScript ? (
        <div style={cardStyle}>
          <strong>{t("adsCatalog.googleRemarketing.experimentalTitle")}</strong>
          <p style={{ margin: 0, fontSize: 13 }}>{t("adsCatalog.googleRemarketing.experimentalWarning")}</p>
          <textarea
            readOnly
            value={customPixelScript}
            rows={8}
            style={{ width: "100%", fontFamily: "monospace", boxSizing: "border-box" }}
          />
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <button type="button" style={primaryBtn} onClick={() => void copyScript()}>
              {t("adsCatalog.googleRemarketing.copyPixel")}
            </button>
            <a href={customerEventsUrl} target="_blank" rel="noreferrer" style={secondaryBtn}>
              {t("adsCatalog.googleRemarketing.openCustomerEvents")}
            </a>
          </div>
        </div>
      ) : null}

      <GoogleAdsPerformancePanel enabled={data.connected} />

      <GooglePixelSetupModal
        open={setupOpen}
        onClose={() => setSetupOpen(false)}
        connected={data.connected}
        shopDomain={data.shopDomain}
        shopifyApiKey={data.shopifyApiKey}
        customerId={data.customerId}
        customerName={data.customerName}
        defaultPixelName={defaultPixelName}
        onConnected={() => revalidator.revalidate()}
        onSaved={({ customPixelScript: script }) => {
          if (script) {
            setCustomPixelScript(script);
            void navigator.clipboard.writeText(script).then(
              () => setHint(t("adsCatalog.googleRemarketing.pixelCopied")),
              () => setHint(t("adsCatalog.googleRemarketing.pixelCopyFailed")),
            );
          }
          revalidator.revalidate();
          setHint((prev) => prev || t("googlePixel.setup.saved"));
        }}
      />

      {hint ? <div style={pageHintTextStyle}>{hint}</div> : null}
      {error ? <div style={{ color: pageColorTokens.critical, fontSize: 13 }}>{error}</div> : null}
    </div>
  );
}

function buildPixelRows(
  eventConversions: GooglePixelEventConversions | undefined,
  tagId: string | undefined,
) {
  if (!eventConversions || !tagId) return [];
  return GOOGLE_PIXEL_SETUP_EVENTS.filter((event) => eventConversions[event]?.label).map((event) => {
    const entry = eventConversions[event]!;
    return {
      event,
      name: entry.name,
      tagId,
      label: entry.label,
      disabled: Boolean(entry.disabled),
    };
  });
}

function StatusPill({
  tone,
  children,
}: {
  tone: "ok" | "muted" | "critical";
  children: string;
}) {
  const palette =
    tone === "ok"
      ? { bg: pageColorTokens.brandGreenLight, color: pageColorTokens.brandGreenDeep }
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

function SettingToggle(props: {
  label: string;
  hint: string;
  enabled: boolean;
  disabled?: boolean;
  onToggle: (enabled: boolean) => void;
}) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center" }}>
      <div>
        <div style={{ fontSize: 13, fontWeight: 600 }}>{props.label}</div>
        <div style={{ ...pageHintTextStyle, marginTop: 4 }}>{props.hint}</div>
      </div>
      <button
        type="button"
        style={props.enabled ? primaryBtn : secondaryBtn}
        disabled={props.disabled}
        onClick={() => props.onToggle(!props.enabled)}
      >
        {props.enabled ? "ON" : "OFF"}
      </button>
    </div>
  );
}
