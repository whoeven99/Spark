/**
 * 总览主区：左渠道轨 +（全未授权示意 | 已授权渠道总览）。
 * 「授权」含 OAuth 待绑定 / 目录已连 / 广告已接入；未授权渠道不可选中。
 */
import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { Link } from "react-router";
import { useTranslation } from "react-i18next";
import { useOAuthPopup, type OAuthPopupMessage } from "../../../hooks/useOAuthPopup";
import { useResponsiveLayout } from "../../../hooks/useResponsiveLayout";
import {
  resolveAdsCatalogAuthResult,
  type AdsCatalogAuthBanner,
} from "../../../lib/adsCatalogOAuthResult";
import { buildAdsHubConnectPath } from "../../../lib/adsHubNav";
import type {
  AdsOverviewPlatform,
  AdsOverviewSeriesPoint,
  AdsOverviewTotals,
} from "../../../server/adsInsights/overview.server";
import { pageColorTokens } from "../../page/pageUiStyles";
import { AdsEmptyPreview } from "./AdsEmptyPreview";
import { AdsSpendTrendChart } from "./AdsSpendTrendChart";

export type AdsOverviewBindingPending = {
  google: boolean;
  meta: boolean;
  tiktok: boolean;
};

type PlatformKey = AdsOverviewPlatform["platform"];

const PLATFORM_LABELS: Record<string, string> = {
  meta: "Meta",
  google: "Google",
  tiktok: "TikTok",
};

const PLATFORM_ORDER: PlatformKey[] = ["meta", "google", "tiktok"];

type ChannelPhase = "unauthorized" | "pending_bind" | "catalog_only" | "connected";

function resolvePhase(
  platform: AdsOverviewPlatform,
  bindingPending: AdsOverviewBindingPending,
): ChannelPhase {
  if (platform.adsConnected) return "connected";
  if (bindingPending[platform.platform]) return "pending_bind";
  if (platform.catalogConnected) return "catalog_only";
  return "unauthorized";
}

function isSelectable(phase: ChannelPhase): boolean {
  return phase !== "unauthorized";
}

function hasAnyAuthorization(
  platforms: AdsOverviewPlatform[],
  bindingPending: AdsOverviewBindingPending,
): boolean {
  return platforms.some(
    (p) => p.connected || bindingPending[p.platform],
  );
}

function pickDefaultPlatform(
  platforms: AdsOverviewPlatform[],
  bindingPending: AdsOverviewBindingPending,
): PlatformKey | null {
  const byKey = new Map(platforms.map((p) => [p.platform, p]));
  for (const key of PLATFORM_ORDER) {
    const p = byKey.get(key);
    if (p?.adsConnected) return key;
  }
  for (const key of PLATFORM_ORDER) {
    const p = byKey.get(key);
    if (!p) continue;
    const phase = resolvePhase(p, bindingPending);
    if (phase === "pending_bind" || phase === "catalog_only") return key;
  }
  return null;
}

const primaryBtn: CSSProperties = {
  padding: "10px 16px",
  borderRadius: pageColorTokens.radiusControl,
  background: pageColorTokens.brandGreen,
  color: "#fff",
  border: "none",
  fontSize: 13,
  fontWeight: 700,
  cursor: "pointer",
  width: "fit-content",
};

const pill = (tone: "ok" | "warn" | "muted"): CSSProperties => {
  const palette =
    tone === "ok"
      ? { bg: pageColorTokens.brandGreenLight, color: pageColorTokens.brandGreenDeep }
      : tone === "warn"
        ? { bg: "#fff7e0", color: "#8a6d00" }
        : { bg: pageColorTokens.surfaceMuted, color: pageColorTokens.textSecondary };
  return {
    display: "inline-flex",
    alignItems: "center",
    padding: "2px 8px",
    borderRadius: 999,
    fontSize: 12,
    fontWeight: 700,
    background: palette.bg,
    color: palette.color,
  };
};

type WorkspaceProps = {
  platforms: AdsOverviewPlatform[];
  bindingPending: AdsOverviewBindingPending;
  locationSearch: string;
  rangeDays: number;
  dateStart: string;
  dateEnd: string;
  syncingPlatforms: string[];
  onAuthSettled: () => void;
};

export function AdsOverviewWorkspace({
  platforms,
  bindingPending,
  locationSearch,
  rangeDays,
  dateStart,
  dateEnd,
  syncingPlatforms,
  onAuthSettled,
}: WorkspaceProps) {
  const { t } = useTranslation();
  const { width } = useResponsiveLayout();
  const sideBySide = width >= 960;
  const anyAuth = hasAnyAuthorization(platforms, bindingPending);
  const platformMap = useMemo(
    () => new Map(platforms.map((p) => [p.platform, p])),
    [platforms],
  );

  const [selected, setSelected] = useState<PlatformKey | null>(() =>
    pickDefaultPlatform(platforms, bindingPending),
  );

  useEffect(() => {
    const next = pickDefaultPlatform(platforms, bindingPending);
    setSelected((prev) => {
      if (prev) {
        const p = platformMap.get(prev);
        if (p && isSelectable(resolvePhase(p, bindingPending))) return prev;
      }
      return next;
    });
  }, [platforms, bindingPending, platformMap]);

  const selectedPlatform = selected ? platformMap.get(selected) ?? null : null;
  const selectedPhase = selectedPlatform
    ? resolvePhase(selectedPlatform, bindingPending)
    : null;

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: sideBySide ? "minmax(260px, 320px) minmax(0, 1fr)" : "1fr",
        alignItems: "start",
        gap: sideBySide ? 20 : 12,
      }}
    >
      <ChannelRail
        platforms={platforms}
        bindingPending={bindingPending}
        selected={selected}
        anyAuth={anyAuth}
        sideBySide={sideBySide}
        locationSearch={locationSearch}
        onSelect={setSelected}
        onAuthSettled={onAuthSettled}
      />

      <div style={{ display: "flex", flexDirection: "column", gap: 14, minWidth: 0 }}>
        {!anyAuth ? (
          <AdsEmptyPreview />
        ) : selectedPlatform && selectedPhase ? (
          <>
            <ChannelStatusBar
              platform={selectedPlatform}
              phase={selectedPhase}
              locationSearch={locationSearch}
            />
            <ChannelOverviewPanel
              platform={selectedPlatform}
              phase={selectedPhase}
              rangeDays={rangeDays}
              dateStart={dateStart}
              dateEnd={dateEnd}
              syncing={syncingPlatforms.includes(selectedPlatform.platform)}
              locationSearch={locationSearch}
            />
          </>
        ) : (
          <div style={{ fontSize: 13, color: pageColorTokens.textSecondary }}>
            {t("adsHub.overview.pickAuthorizedChannel")}
          </div>
        )}
      </div>
    </div>
  );
}

function ChannelRail({
  platforms,
  bindingPending,
  selected,
  anyAuth,
  sideBySide,
  locationSearch,
  onSelect,
  onAuthSettled,
}: {
  platforms: AdsOverviewPlatform[];
  bindingPending: AdsOverviewBindingPending;
  selected: PlatformKey | null;
  anyAuth: boolean;
  sideBySide: boolean;
  locationSearch: string;
  onSelect: (key: PlatformKey) => void;
  onAuthSettled: () => void;
}) {
  const { t } = useTranslation();
  const [busy, setBusy] = useState(false);
  const [banner, setBanner] = useState<AdsCatalogAuthBanner | null>(null);
  const googleOAuth = useOAuthPopup("google_oauth");
  const metaOAuth = useOAuthPopup("meta_unified_oauth");
  const tiktokOAuth = useOAuthPopup("tiktok_catalog_oauth");
  const anyRedirecting =
    googleOAuth.redirecting || metaOAuth.redirecting || tiktokOAuth.redirecting;
  const disabled = busy || anyRedirecting;

  function applyPopupResult(platform: PlatformKey, data: OAuthPopupMessage) {
    const result =
      platform === "google"
        ? resolveAdsCatalogAuthResult({
            google: data.googleAuth,
            gmc: data.gmcAuth,
            ads: data.adsAuth,
            reason: data.reason,
            gmcReason: data.gmcReason,
            adsReason: data.adsReason,
            t,
          })
        : platform === "meta"
          ? resolveAdsCatalogAuthResult({
              metaUnified: data.metaUnifiedAuth,
              metaCatalog: data.metaCatalog,
              metaAds: data.metaAds,
              metaCapi: data.metaCapi,
              reason: data.reason,
              t,
            })
          : resolveAdsCatalogAuthResult({
              tiktok: data.tiktokAuth,
              reason: data.reason,
              t,
            });
    if (result.action === "none") return;
    if (result.banner) setBanner(result.banner);
    onAuthSettled();
  }

  function startOAuth(platform: PlatformKey) {
    const endpoint =
      platform === "google"
        ? "/api/ads-catalog/google-auth-url"
        : platform === "meta"
          ? "/api/ads-catalog/meta-unified-auth-url"
          : "/api/ads-catalog/tiktok-auth-url";
    const oauth =
      platform === "google" ? googleOAuth : platform === "meta" ? metaOAuth : tiktokOAuth;
    void (async () => {
      setBusy(true);
      setBanner(null);
      try {
        await oauth.startOAuth(`${endpoint}${locationSearch}`, (data) =>
          applyPopupResult(platform, data),
        );
      } catch (e) {
        alert(e instanceof Error ? e.message : t("adsCatalog.authError"));
      } finally {
        setBusy(false);
      }
    })();
  }

  const ordered = PLATFORM_ORDER.map(
    (key) => platforms.find((p) => p.platform === key)!,
  ).filter(Boolean);

  return (
    <div
      style={{
        border: `1px solid ${pageColorTokens.border}`,
        borderRadius: pageColorTokens.radiusCard,
        background: pageColorTokens.surface,
        overflow: "hidden",
        position: sideBySide ? "sticky" : "static",
        top: sideBySide ? 16 : undefined,
      }}
    >
      <div
        style={{
          padding: "12px 16px",
          borderBottom: `1px solid ${pageColorTokens.borderSubtle}`,
        }}
      >
        <div style={{ fontSize: 14, fontWeight: 700, color: pageColorTokens.textPrimary }}>
          {t("adsHub.overview.emptyTitle")}
        </div>
        <div style={{ marginTop: 4, fontSize: 12, color: pageColorTokens.textFootnote }}>
          {anyAuth
            ? t("adsHub.overview.channelRailHintAuthorized")
            : t("adsHub.overview.emptyEffort")}
        </div>
      </div>

      {banner ? (
        <div
          style={{
            padding: "10px 16px",
            background:
              banner.tone === "ok" ? pageColorTokens.brandGreenLight : "#fdecec",
            color:
              banner.tone === "ok" ? pageColorTokens.brandGreenDeep : "#c0392b",
            borderBottom: `1px solid ${pageColorTokens.divider}`,
            fontSize: 13,
            lineHeight: 1.45,
          }}
        >
          {banner.text}
        </div>
      ) : null}

      {ordered.map((platform) => {
        const phase = resolvePhase(platform, bindingPending);
        const selectable = isSelectable(phase);
        const active = selected === platform.platform;
        const accent = phase === "pending_bind" || phase === "catalog_only";

        return (
          <div
            key={platform.platform}
            role={selectable ? "button" : undefined}
            tabIndex={selectable ? 0 : undefined}
            onClick={() => {
              if (selectable) onSelect(platform.platform);
            }}
            onKeyDown={(e) => {
              if (!selectable) return;
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onSelect(platform.platform);
              }
            }}
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 8,
              padding: "12px 16px",
              borderTop: `1px solid ${pageColorTokens.divider}`,
              borderLeft: accent
                ? `3px solid ${pageColorTokens.brandGreen}`
                : active
                  ? `3px solid ${pageColorTokens.brandGreenGlow}`
                  : "3px solid transparent",
              background: active ? pageColorTokens.brandGreenLight : "transparent",
              cursor: selectable ? "pointer" : "default",
              opacity: phase === "unauthorized" && anyAuth ? 0.72 : 1,
            }}
          >
            <div
              style={{
                display: "flex",
                flexWrap: "wrap",
                alignItems: "center",
                gap: 6,
              }}
            >
              <span style={{ fontSize: 14, fontWeight: 700, color: pageColorTokens.textPrimary }}>
                {PLATFORM_LABELS[platform.platform]}
              </span>
              {phase === "connected" ? (
                <span style={pill("ok")}>{t("adsHub.overview.statusAuthConnected")}</span>
              ) : null}
              {phase === "pending_bind" ? (
                <>
                  <span style={pill("ok")}>{t("adsHub.overview.statusAuthDone")}</span>
                  <span style={pill("warn")}>{t("adsHub.overview.statusPendingBind")}</span>
                </>
              ) : null}
              {phase === "catalog_only" ? (
                <span style={pill("warn")}>{t("adsHub.overview.statusCatalogOnly")}</span>
              ) : null}
              {phase === "unauthorized" ? (
                <span style={pill("muted")}>{t("adsHub.overview.statusUnauthorized")}</span>
              ) : null}
            </div>

            <div style={{ fontSize: 12, color: pageColorTokens.textSecondary, lineHeight: 1.45 }}>
              {phase === "connected"
                ? platform.accountName ||
                  platform.accountId ||
                  t("adsHub.overview.connectedAccountFallback")
                : phase === "pending_bind"
                  ? t("adsHub.overview.finishBindingHint")
                  : phase === "catalog_only"
                    ? t("adsHub.overview.catalogOnly")
                    : t(`adsHub.overview.inlineAuthHint.${platform.platform}`)}
            </div>

            {phase === "unauthorized" ? (
              <button
                type="button"
                style={{
                  ...primaryBtn,
                  opacity: disabled ? 0.65 : 1,
                  cursor: disabled ? "not-allowed" : "pointer",
                }}
                disabled={disabled}
                onClick={(e) => {
                  e.stopPropagation();
                  startOAuth(platform.platform);
                }}
              >
                {t(`adsHub.overview.inlineAuthButton.${platform.platform}`)}
              </button>
            ) : null}

            {phase === "pending_bind" || phase === "catalog_only" ? (
              <Link
                to={buildAdsHubConnectPath(platform.platform, locationSearch)}
                onClick={(e) => e.stopPropagation()}
                style={{ ...primaryBtn, textDecoration: "none", display: "inline-flex" }}
              >
                {phase === "catalog_only"
                  ? t("adsHub.overview.connectAdsAccount")
                  : t("adsHub.overview.finishBinding")}
              </Link>
            ) : null}

            {phase === "connected" ? (
              <Link
                to={buildAdsHubConnectPath(platform.platform, locationSearch)}
                onClick={(e) => e.stopPropagation()}
                style={{
                  fontSize: 12,
                  fontWeight: 600,
                  color: pageColorTokens.brandBlue,
                  textDecoration: "none",
                  width: "fit-content",
                }}
              >
                {t("adsHub.overview.manageConnection")}
              </Link>
            ) : null}
          </div>
        );
      })}

      <div
        style={{
          padding: "8px 16px",
          background: pageColorTokens.surfaceMuted,
          borderTop: `1px solid ${pageColorTokens.divider}`,
          fontSize: 12,
          lineHeight: 1.5,
          color: pageColorTokens.textFootnote,
        }}
      >
        {t("adsHub.overview.advancedConnectNote")}{" "}
        <Link
          to={buildAdsHubConnectPath(undefined, locationSearch)}
          style={{ color: pageColorTokens.brandBlue, fontWeight: 600, textDecoration: "none" }}
        >
          {t("adsHub.nav.connect")}
        </Link>
      </div>
    </div>
  );
}

function ChannelStatusBar({
  platform,
  phase,
  locationSearch,
}: {
  platform: AdsOverviewPlatform;
  phase: ChannelPhase;
  locationSearch: string;
}) {
  const { t } = useTranslation();
  const label = PLATFORM_LABELS[platform.platform] ?? platform.platform;

  return (
    <div
      style={{
        display: "flex",
        flexWrap: "wrap",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 12,
        padding: "12px 16px",
        borderRadius: pageColorTokens.radiusCard,
        border: `1px solid ${pageColorTokens.border}`,
        background: pageColorTokens.surface,
        borderLeft:
          phase === "pending_bind" || phase === "catalog_only"
            ? `4px solid ${pageColorTokens.brandGreen}`
            : undefined,
      }}
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 6, minWidth: 0 }}>
        <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 16, fontWeight: 700, color: pageColorTokens.textPrimary }}>
            {label}
          </span>
          {phase === "connected" ? (
            <span style={pill("ok")}>{t("adsHub.overview.statusAuthConnected")}</span>
          ) : null}
          {phase === "pending_bind" ? (
            <>
              <span style={pill("ok")}>{t("adsHub.overview.statusAuthDone")}</span>
              <span style={pill("warn")}>{t("adsHub.overview.statusPendingBind")}</span>
            </>
          ) : null}
          {phase === "catalog_only" ? (
            <span style={pill("warn")}>{t("adsHub.overview.statusCatalogOnly")}</span>
          ) : null}
        </div>
        <div style={{ fontSize: 12, color: pageColorTokens.textSecondary, lineHeight: 1.45 }}>
          {phase === "connected"
            ? t("adsHub.overview.channelOverviewLiveHint")
            : phase === "pending_bind"
              ? t("adsHub.overview.finishBindingHint")
              : t("adsHub.overview.catalogOnly")}
        </div>
      </div>

      {phase === "pending_bind" || phase === "catalog_only" ? (
        <Link
          to={buildAdsHubConnectPath(platform.platform, locationSearch)}
          style={{ ...primaryBtn, textDecoration: "none", display: "inline-flex" }}
        >
          {phase === "catalog_only"
            ? t("adsHub.overview.connectAdsAccount")
            : t("adsHub.overview.finishBinding")}
        </Link>
      ) : null}
    </div>
  );
}

function ChannelOverviewPanel({
  platform,
  phase,
  rangeDays,
  dateStart,
  dateEnd,
  syncing,
  locationSearch,
}: {
  platform: AdsOverviewPlatform;
  phase: ChannelPhase;
  rangeDays: number;
  dateStart: string;
  dateEnd: string;
  syncing: boolean;
  locationSearch: string;
}) {
  const { t } = useTranslation();
  const live = phase === "connected";
  const totals = live ? platform.totals : null;
  const hasVolume = Boolean(totals && totals.spend > 0);
  const series: AdsOverviewSeriesPoint[] = live ? platform.series : [];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      {live ? (
        <RangeTabs current={rangeDays} locationSearch={locationSearch} />
      ) : null}

      <MetricRow
        totals={totals}
        currencyCode={platform.currencyCode}
        pending={live && syncing && !hasVolume}
      />

      {live && !hasVolume && !syncing ? (
        <div style={{ fontSize: 13, color: pageColorTokens.textSecondary }}>
          {t("adsHub.overview.noSpend", { days: rangeDays })}
        </div>
      ) : null}

      {live && hasVolume ? (
        <AdsSpendTrendChart
          series={series}
          dateStart={dateStart}
          dateEnd={dateEnd}
          currencyCode={platform.currencyCode}
        />
      ) : null}

      {!live ? (
        <div
          style={{
            border: `1px dashed ${pageColorTokens.borderInput}`,
            borderRadius: pageColorTokens.radiusCard,
            background: pageColorTokens.surfaceMuted,
            padding: "28px 20px",
            textAlign: "center",
            color: pageColorTokens.textSecondary,
            fontSize: 13,
            lineHeight: 1.5,
          }}
        >
          {t("adsHub.overview.trendAfterBind")}
        </div>
      ) : null}
    </div>
  );
}

function RangeTabs({
  current,
  locationSearch,
}: {
  current: number;
  locationSearch: string;
}) {
  const { t } = useTranslation();
  const options = [7, 30] as const;
  return (
    <div style={{ display: "flex", gap: 6 }}>
      {options.map((days) => {
        const params = new URLSearchParams(
          locationSearch.startsWith("?") ? locationSearch.slice(1) : locationSearch,
        );
        params.set("range", String(days));
        const active = days === current;
        return (
          <Link
            key={days}
            to={`/app/ads?${params.toString()}`}
            style={{
              padding: "5px 12px",
              borderRadius: pageColorTokens.radiusControl,
              fontSize: 13,
              fontWeight: active ? 600 : 500,
              textDecoration: "none",
              color: active ? pageColorTokens.brandGreenDeep : pageColorTokens.textBody,
              background: active ? pageColorTokens.brandGreenLight : pageColorTokens.surface,
              border: `1px solid ${active ? "transparent" : pageColorTokens.border}`,
            }}
          >
            {t("adsHub.overview.rangeDays", { days })}
          </Link>
        );
      })}
    </div>
  );
}

function MetricRow({
  totals,
  currencyCode,
  pending,
}: {
  totals: AdsOverviewTotals | null;
  currencyCode: string | null;
  pending: boolean;
}) {
  const { t } = useTranslation();
  const placeholder = pending ? t("adsHub.overview.syncingValue") : "—";
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 12 }}>
      <Metric
        label={t("adsHub.overview.spend")}
        value={
          totals && totals.spend > 0 ? formatMoney(totals.spend, currencyCode) : placeholder
        }
      />
      <Metric
        label={t("adsHub.overview.roas")}
        value={totals?.roas != null ? `${totals.roas.toFixed(1)}x` : placeholder}
      />
      <Metric
        label={t("adsHub.overview.conversionValue")}
        value={
          totals && totals.conversionsValue > 0
            ? formatMoney(totals.conversionsValue, currencyCode)
            : placeholder
        }
      />
      <Metric
        label={t("adsHub.overview.ctr")}
        value={totals?.ctr != null ? `${totals.ctr.toFixed(1)}%` : placeholder}
      />
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div
      style={{
        minWidth: 140,
        flex: "1 1 140px",
        padding: "12px 16px",
        border: `1px solid ${pageColorTokens.border}`,
        borderRadius: pageColorTokens.radiusCard,
        background: pageColorTokens.surface,
      }}
    >
      <div style={{ fontSize: 12, color: pageColorTokens.textSecondary }}>{label}</div>
      <div
        style={{
          marginTop: 4,
          fontSize: 20,
          fontWeight: 700,
          color: pageColorTokens.textPrimary,
        }}
      >
        {value}
      </div>
    </div>
  );
}

function formatMoney(amount: number, currency: string | null | undefined): string {
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency: currency && currency.length === 3 ? currency : "USD",
      maximumFractionDigits: 0,
    }).format(amount);
  } catch {
    return `$${Math.round(amount)}`;
  }
}
