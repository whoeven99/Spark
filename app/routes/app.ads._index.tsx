/**
 * 广告总览：分析是主线，未连接时先引导接入。
 *
 * 两条和数据链路相关的约定：
 * - 未连接时**不渲染任何 0 值指标**。`Spend $0 / ROAS —` 会被商户读成「这个应用没数据」，
 *   而真实状态是「还没授权」。
 * - `buildAdsOverview` 是纯库内聚合，不回源；而落库只发生在有人真的拉过一次平台数据。
 *   因此这一页对「已连接但库里没快照」的渠道自动触发一次 `/api/ads-insights`，
 *   否则商户授权完回到这里仍然是空的。快照过期（30 分钟 TTL）时也顺带静默刷新，
 *   顺便把授权失效暴露出来——库内聚合永远看不到凭证已经不能用了。
 */
import { useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties, ReactNode } from "react";
import type { HeadersFunction, LoaderFunctionArgs } from "react-router";
import { Link, useFetcher, useLoaderData, useRevalidator } from "react-router";
import { useTranslation } from "react-i18next";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import {
  buildAdsOverview,
  type AdsOverviewPlatform,
  type AdsOverviewTotals,
} from "../server/adsInsights/overview.server";
import { parseRangeDays } from "../server/adsInsights/dateRange.server";
import {
  buildAdsHubCatalogPath,
  buildAdsHubConnectPath,
  isAdsHubCapabilityVisible,
} from "../lib/adsHubNav";
import { useEmbeddedLocationSearch } from "../hooks/useEmbeddedLocationSearch";
import { AdsSpendTrendChart } from "./component/adsHub/AdsSpendTrendChart";
import { pageColorTokens } from "./page/pageUiStyles";

const DEFAULT_RANGE_DAYS = 30;
const RANGE_OPTIONS = [7, 30] as const;

const PLATFORM_LABELS: Record<string, string> = {
  meta: "Meta",
  google: "Google",
  tiktok: "TikTok",
};

/** 未连接时也要把三个渠道摆出来，因此 loader 失败也有一份兜底结构。 */
const FALLBACK_PLATFORMS: AdsOverviewPlatform[] = ["meta", "google", "tiktok"].map(
  (platform) => ({
    platform: platform as AdsOverviewPlatform["platform"],
    connected: false,
    catalogConnected: false,
    adsConnected: false,
    connectionState: "missing",
    accountId: null,
    accountName: null,
    currencyCode: null,
    totals: null,
    snapshot: null,
    entityCounts: { campaign: 0, adSet: 0, ad: 0 },
  }),
);

type SyncResponse =
  | { ok: true; degraded?: { reason: string; message: string } | null }
  | { ok: false; reason?: string; message?: string; platform?: string };

function appendSearch(path: string, search: string): string {
  const q = search.startsWith("?") ? search.slice(1) : search;
  if (!q) return path;
  const [base, existing] = path.split("?");
  if (!existing) return `${base}?${q}`;
  return `${base}?${existing}&${q}`;
}

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const url = new URL(request.url);
  const rangeParam = url.searchParams.get("range");
  const rangeDays = rangeParam ? parseRangeDays(rangeParam) : DEFAULT_RANGE_DAYS;
  try {
    const overview = await buildAdsOverview({ shop: session.shop, rangeDays });
    return { overview, rangeDays, error: null as string | null };
  } catch (error) {
    console.error("[AdsHub] overview failed:", error);
    return {
      overview: null,
      rangeDays,
      error: error instanceof Error ? error.message : "overview_failed",
    };
  }
};

export default function AppAdsIndex() {
  const { t } = useTranslation();
  const { overview, rangeDays, error } = useLoaderData<typeof loader>();
  const locationSearch = useEmbeddedLocationSearch();
  const revalidator = useRevalidator();
  const syncFetcher = useFetcher<SyncResponse>();

  const platforms = overview?.platforms ?? FALLBACK_PLATFORMS;
  const adsConnected = platforms.filter((p) => p.adsConnected);
  // 只连了商品目录不会产生任何投放数据，所以这一页仍按「还没接入」处理。
  const hasAdsAccount = adsConnected.length > 0;
  const adsMissing = platforms.filter((p) => !p.adsConnected);

  /**
   * 从未同步过的渠道要显示同步中；快照过期的只做静默刷新。
   * 用字符串做 memo 依赖，否则每次渲染都是新数组，effect 会被无谓地唤醒。
   */
  const firstSyncKey = adsConnected
    .filter((p) => !p.snapshot)
    .map((p) => p.platform)
    .join(",");
  const syncQueueKey = adsConnected
    .filter((p) => !p.snapshot || p.snapshot.stale)
    .map((p) => p.platform)
    .join(",");
  const firstSyncPlatforms = useMemo(
    () => (firstSyncKey ? firstSyncKey.split(",") : []),
    [firstSyncKey],
  );
  const syncQueue = useMemo(
    () => (syncQueueKey ? syncQueueKey.split(",") : []),
    [syncQueueKey],
  );

  const [activeSync, setActiveSync] = useState<string | null>(null);
  const [reauthPlatforms, setReauthPlatforms] = useState<string[]>([]);
  /** 拉失败的渠道 → 平台返回的原文，首页黄条要看得见，不能只写「没拉到」。 */
  const [failedPlatforms, setFailedPlatforms] = useState<
    Array<{ platform: string; message: string }>
  >([]);
  // 拉完就不再显示「同步中」：账户本来没投放时，拉成功了库里也不会有快照。
  const [finishedPlatforms, setFinishedPlatforms] = useState<string[]>([]);
  // 拉过一次就不再重试：拉失败或账户本来就没投放时，库里依然没有快照。
  const attemptedRef = useRef<Set<string>>(new Set());
  const handledDataRef = useRef<SyncResponse | null>(null);

  useEffect(() => {
    if (activeSync || syncFetcher.state !== "idle") return;
    const next = syncQueue.find((platform) => !attemptedRef.current.has(platform));
    if (!next) return;
    attemptedRef.current.add(next);
    setActiveSync(next);
    const params = new URLSearchParams(
      locationSearch.startsWith("?") ? locationSearch.slice(1) : locationSearch,
    );
    params.set("platform", next);
    params.set("range", String(rangeDays));
    syncFetcher.load(`/api/ads-insights?${params.toString()}`);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- fetcher 每次渲染都是新引用，排除后才不会自触发
  }, [activeSync, syncQueue, syncFetcher.state, locationSearch, rangeDays]);

  useEffect(() => {
    if (!activeSync || syncFetcher.state !== "idle") return;
    const data = syncFetcher.data;
    // 新一轮 load 发出前 fetcher 仍持有上一次的响应，靠引用比对避免错认。
    if (!data || data === handledDataRef.current) return;
    handledDataRef.current = data;
    const platform = activeSync;
    setActiveSync(null);
    setFinishedPlatforms((prev) => (prev.includes(platform) ? prev : [...prev, platform]));

    const reauthRequired = data.ok
      ? data.degraded?.reason === "reauth_required"
      : data.reason === "reauth_required";
    if (reauthRequired) {
      setReauthPlatforms((prev) => (prev.includes(platform) ? prev : [...prev, platform]));
    } else if (!data.ok) {
      const message =
        (!data.ok && data.message?.trim()) || t("adsHub.overview.syncFailedGeneric");
      setFailedPlatforms((prev) =>
        prev.some((item) => item.platform === platform)
          ? prev
          : [...prev, { platform, message }],
      );
    }
    revalidator.revalidate();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 同上
  }, [activeSync, syncFetcher.data, syncFetcher.state]);

  const syncingNow = firstSyncPlatforms.filter(
    (platform) => !finishedPlatforms.includes(platform),
  );
  const totals = overview?.totals ?? null;
  const hasVolume = Boolean(totals && totals.spend > 0);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20, maxWidth: 960 }}>
      <div>
        <h1
          style={{
            margin: 0,
            fontSize: 22,
            fontWeight: 700,
            color: pageColorTokens.textPrimary,
          }}
        >
          {t("adsHub.overview.title")}
        </h1>
        <p style={{ margin: "6px 0 0", fontSize: 13, color: pageColorTokens.textSecondary }}>
          {hasAdsAccount
            ? t("adsHub.overview.subtitleRange", { days: rangeDays })
            : t("adsHub.overview.subtitleEmpty")}
        </p>
      </div>

      {error ? (
        <Notice tone="critical">{t("adsHub.overview.loadError")}</Notice>
      ) : null}

      {reauthPlatforms.map((platform) => (
        <Notice key={platform} tone="warning">
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <div style={{ fontWeight: 600 }}>
              {t("adsHub.overview.reauthTitle", { platform: PLATFORM_LABELS[platform] ?? platform })}
            </div>
            <div>{t("adsHub.overview.reauthBody")}</div>
            <Link
              to={buildAdsHubConnectPath(platform, locationSearch)}
              style={{
                fontSize: 13,
                fontWeight: 600,
                color: pageColorTokens.brandBlue,
                textDecoration: "none",
              }}
            >
              {t("adsHub.overview.reauthAction")}
            </Link>
          </div>
        </Notice>
      ))}

      {failedPlatforms.map((item) => (
        <Notice key={item.platform} tone="warning">
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <div style={{ fontWeight: 600 }}>
              {t("adsHub.overview.syncFailedTitle", {
                platform: PLATFORM_LABELS[item.platform] ?? item.platform,
              })}
            </div>
            <div>{item.message}</div>
            <div style={{ color: pageColorTokens.textSecondary }}>
              {t("adsHub.overview.syncFailedHint")}
            </div>
          </div>
        </Notice>
      ))}

      {!hasAdsAccount ? (
        <ConnectGuide platforms={platforms} locationSearch={locationSearch} />
      ) : (
        <>
          {syncingNow.length > 0 ? (
            <Notice tone="info">
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <div style={{ fontWeight: 600 }}>
                  {t("adsHub.overview.syncingTitle", {
                    platforms: syncingNow
                      .map((platform) => PLATFORM_LABELS[platform] ?? platform)
                      .join(" / "),
                  })}
                </div>
                <div>{t("adsHub.overview.syncingBody")}</div>
              </div>
            </Notice>
          ) : null}

          <RangeTabs current={rangeDays} locationSearch={locationSearch} />

          <MetricRow
            totals={totals}
            currencyCode={overview?.currencyCode ?? null}
            pending={syncingNow.length > 0 && !hasVolume}
            connectedCount={adsConnected.length}
          />

          {overview?.mixedCurrency ? (
            <div style={{ fontSize: 12, color: pageColorTokens.textFootnote }}>
              {t("adsHub.overview.mixedCurrency")}
            </div>
          ) : null}

          {!hasVolume && syncingNow.length === 0 ? (
            <div style={{ fontSize: 13, color: pageColorTokens.textSecondary }}>
              {t("adsHub.overview.noSpend", { days: rangeDays })}
            </div>
          ) : null}

          {hasVolume && overview ? (
            <>
              <AdsSpendTrendChart
                series={overview.paidSeries}
                dateStart={overview.dateStart}
                dateEnd={overview.dateEnd}
                currencyCode={overview.mixedCurrency ? null : overview.currencyCode}
              />
              <ChannelTable platforms={adsConnected} />
            </>
          ) : null}

          {adsMissing.length > 0 ? (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
              <span style={{ fontSize: 13, color: pageColorTokens.textSecondary }}>
                {t("adsHub.overview.connectMore", {
                  platforms: adsMissing
                    .map((p) => PLATFORM_LABELS[p.platform] ?? p.platform)
                    .join(" / "),
                })}
              </span>
              <Link
                to={buildAdsHubConnectPath(adsMissing[0]?.platform, locationSearch)}
                style={{
                  fontSize: 13,
                  fontWeight: 600,
                  color: pageColorTokens.brandBlue,
                  textDecoration: "none",
                }}
              >
                {t("adsHub.overview.connectNow")}
              </Link>
            </div>
          ) : null}

          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            <HubButton
              to={appendSearch("/app/ads/performance", locationSearch)}
              label={t("adsHub.overview.ctaPerformance")}
              primary
            />
            {isAdsHubCapabilityVisible("sync") ? (
              <HubButton
                to={appendSearch(buildAdsHubCatalogPath({ tab: "sync" }), locationSearch)}
                label={t("adsHub.overview.ctaSync")}
              />
            ) : null}
            {isAdsHubCapabilityVisible("create") ? (
              <HubButton
                to={appendSearch("/app/ads/create", locationSearch)}
                label={t("adsHub.overview.ctaCreate")}
              />
            ) : null}
          </div>
        </>
      )}
    </div>
  );
}

function ConnectGuide({
  platforms,
  locationSearch,
}: {
  platforms: AdsOverviewPlatform[];
  locationSearch: string;
}) {
  const { t } = useTranslation();
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div
        style={{
          border: `1px solid ${pageColorTokens.border}`,
          borderRadius: pageColorTokens.radiusCard,
          background: pageColorTokens.surface,
          overflow: "hidden",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 12,
            padding: "14px 16px",
            borderBottom: `1px solid ${pageColorTokens.borderSubtle}`,
          }}
        >
          <div style={{ fontSize: 14, fontWeight: 700, color: pageColorTokens.textPrimary }}>
            {t("adsHub.overview.emptyTitle")}
          </div>
          <div style={{ fontSize: 12, color: pageColorTokens.textFootnote }}>
            {t("adsHub.overview.emptyEffort")}
          </div>
        </div>

        {platforms.map((platform, index) => (
          <div
            key={platform.platform}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 12,
              padding: "14px 16px",
              borderTop: index === 0 ? "none" : `1px solid ${pageColorTokens.divider}`,
            }}
          >
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 14, fontWeight: 600, color: pageColorTokens.textPrimary }}>
                {PLATFORM_LABELS[platform.platform] ?? platform.platform}
              </div>
              <div
                style={{
                  marginTop: 2,
                  fontSize: 12,
                  color: pageColorTokens.textSecondary,
                  lineHeight: 1.5,
                }}
              >
                {platform.catalogConnected
                  ? t("adsHub.overview.catalogOnly")
                  : t(`adsHub.overview.channelValue.${platform.platform}`)}
              </div>
            </div>
            <Link
              to={buildAdsHubConnectPath(platform.platform, locationSearch)}
              style={{
                flexShrink: 0,
                padding: "8px 14px",
                borderRadius: pageColorTokens.radiusControl,
                background:
                  platform.platform === "google"
                    ? pageColorTokens.brandGreen
                    : pageColorTokens.surface,
                color:
                  platform.platform === "google" ? "#fff" : pageColorTokens.textPrimary,
                border:
                  platform.platform === "google"
                    ? "none"
                    : `1px solid ${pageColorTokens.borderInput}`,
                fontSize: 13,
                fontWeight: 600,
                textDecoration: "none",
              }}
            >
              {platform.catalogConnected
                ? t("adsHub.overview.connectAdsAccount")
                : t("adsHub.overview.connectNow")}
            </Link>
          </div>
        ))}

        <div
          style={{
            padding: "10px 16px",
            background: pageColorTokens.surfaceMuted,
            borderTop: `1px solid ${pageColorTokens.divider}`,
            fontSize: 12,
            lineHeight: 1.5,
            color: pageColorTokens.textFootnote,
          }}
        >
          {t("adsHub.overview.scopeNote")}
        </div>
      </div>

      <div
        style={{
          border: `1px solid ${pageColorTokens.border}`,
          borderRadius: pageColorTokens.radiusCard,
          background: pageColorTokens.surface,
          padding: 16,
          display: "flex",
          flexDirection: "column",
          gap: 8,
        }}
      >
        <div style={{ fontSize: 13, fontWeight: 600, color: pageColorTokens.textPrimary }}>
          {t("adsHub.overview.previewTitle")}
        </div>
        <ul
          style={{
            margin: 0,
            paddingLeft: 18,
            fontSize: 13,
            lineHeight: 1.7,
            color: pageColorTokens.textSecondary,
          }}
        >
          <li>{t("adsHub.overview.previewItemMetrics")}</li>
          <li>{t("adsHub.overview.previewItemStructure")}</li>
          <li>{t("adsHub.overview.previewItemAttribution")}</li>
        </ul>
      </div>
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
  return (
    <div style={{ display: "flex", gap: 6 }}>
      {RANGE_OPTIONS.map((days) => {
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
  connectedCount,
}: {
  totals: AdsOverviewTotals | null;
  currencyCode: string | null;
  pending: boolean;
  connectedCount: number;
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
      <Metric
        label={t("adsHub.overview.platformsConnected")}
        value={String(connectedCount)}
      />
    </div>
  );
}

function ChannelTable({ platforms }: { platforms: AdsOverviewPlatform[] }) {
  const { t } = useTranslation();
  const headerStyle: CSSProperties = {
    padding: "10px 12px",
    fontSize: 12,
    fontWeight: 600,
    color: pageColorTokens.textFootnote,
    textAlign: "right",
  };
  const cellStyle: CSSProperties = {
    padding: "12px",
    fontSize: 13,
    color: pageColorTokens.textPrimary,
    textAlign: "right",
    borderTop: `1px solid ${pageColorTokens.divider}`,
  };
  return (
    <div
      style={{
        border: `1px solid ${pageColorTokens.border}`,
        borderRadius: pageColorTokens.radiusCard,
        background: pageColorTokens.surface,
        overflowX: "auto",
      }}
    >
      <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 520 }}>
        <thead>
          <tr>
            <th style={{ ...headerStyle, textAlign: "left" }}>
              {t("adsHub.overview.tableChannel")}
            </th>
            <th style={headerStyle}>{t("adsHub.overview.spend")}</th>
            <th style={headerStyle}>{t("adsHub.overview.roas")}</th>
            <th style={headerStyle}>{t("adsHub.overview.conversionValue")}</th>
            <th style={headerStyle}>{t("adsHub.overview.ctr")}</th>
          </tr>
        </thead>
        <tbody>
          {platforms.map((platform) => (
            <tr key={platform.platform}>
              <td style={{ ...cellStyle, textAlign: "left", fontWeight: 600 }}>
                {PLATFORM_LABELS[platform.platform] ?? platform.platform}
                {platform.accountName || platform.accountId ? (
                  <div
                    style={{
                      marginTop: 2,
                      fontSize: 12,
                      fontWeight: 400,
                      color: pageColorTokens.textFootnote,
                    }}
                  >
                    {platform.accountName || platform.accountId}
                  </div>
                ) : null}
              </td>
              <td style={cellStyle}>
                {platform.totals
                  ? formatMoney(platform.totals.spend, platform.currencyCode)
                  : "—"}
              </td>
              <td style={cellStyle}>
                {platform.totals?.roas != null ? `${platform.totals.roas.toFixed(1)}x` : "—"}
              </td>
              <td style={cellStyle}>
                {platform.totals
                  ? formatMoney(platform.totals.conversionsValue, platform.currencyCode)
                  : "—"}
              </td>
              <td style={cellStyle}>
                {platform.totals?.ctr != null ? `${platform.totals.ctr.toFixed(1)}%` : "—"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Notice({
  tone,
  children,
}: {
  tone: "critical" | "warning" | "info";
  children: ReactNode;
}) {
  const palette =
    tone === "critical"
      ? { background: pageColorTokens.criticalBg, color: pageColorTokens.criticalText }
      : tone === "warning"
        ? { background: pageColorTokens.warningBg, color: pageColorTokens.textPrimary }
        : { background: pageColorTokens.brandBlueLight, color: pageColorTokens.textPrimary };
  return (
    <div
      style={{
        padding: 14,
        borderRadius: pageColorTokens.radiusCard,
        border: `1px solid ${pageColorTokens.border}`,
        fontSize: 13,
        lineHeight: 1.5,
        ...palette,
      }}
    >
      {children}
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div
      style={{
        minWidth: 140,
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

function HubButton({
  to,
  label,
  primary,
}: {
  to: string;
  label: string;
  primary?: boolean;
}) {
  return (
    <Link
      to={to}
      style={{
        display: "inline-block",
        padding: "10px 16px",
        borderRadius: pageColorTokens.radiusControl,
        background: primary ? pageColorTokens.brandGreen : pageColorTokens.surface,
        color: primary ? "#fff" : pageColorTokens.textPrimary,
        border: primary ? "none" : `1px solid ${pageColorTokens.borderSubtle}`,
        fontSize: 13,
        fontWeight: 700,
        textDecoration: "none",
      }}
    >
      {label}
    </Link>
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

export const headers: HeadersFunction = (headersArgs) => boundary.headers(headersArgs);
