/**
 * 广告总览：左选渠道、右看该渠道数据；全未授权时右栏示意。
 *
 * 数据链路：
 * - 未接入渠道不渲染 0 值指标（用 — / 示意）。
 * - buildAdsOverview 纯库内聚合；已接入但无快照时自动拉 /api/ads-insights。
 */
import { useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import type { HeadersFunction, LoaderFunctionArgs } from "react-router";
import { Link, useFetcher, useLoaderData, useRevalidator } from "react-router";
import { useTranslation } from "react-i18next";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import {
  getGoogleAdsPending,
  getGoogleMerchantPending,
  getMetaAdsPending,
  getMetaCatalogPending,
  getTiktokCatalogPending,
} from "../server/adsCatalog/credentialStore.server";
import {
  buildAdsOverview,
  type AdsOverviewPlatform,
} from "../server/adsInsights/overview.server";
import { parseRangeDays } from "../server/adsInsights/dateRange.server";
import {
  buildAdsHubCatalogPath,
  buildAdsHubConnectPath,
  isAdsHubCapabilityVisible,
} from "../lib/adsHubNav";
import { useEmbeddedLocationSearch } from "../hooks/useEmbeddedLocationSearch";
import {
  AdsOverviewWorkspace,
  type AdsOverviewBindingPending,
} from "./component/adsHub/AdsOverviewWorkspace";
import { pageColorTokens } from "./page/pageUiStyles";

const DEFAULT_RANGE_DAYS = 30;

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
    series: [],
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

const EMPTY_BINDING_PENDING: AdsOverviewBindingPending = {
  google: false,
  meta: false,
  tiktok: false,
};

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const url = new URL(request.url);
  const rangeParam = url.searchParams.get("range");
  const rangeDays = rangeParam ? parseRangeDays(rangeParam) : DEFAULT_RANGE_DAYS;
  try {
    const overview = await buildAdsOverview({ shop: session.shop, rangeDays });
    // 未绑广告账户的渠道仍可能停在 OAuth pending，已接入其它渠道时也要读。
    const [gmcPending, adsPending, metaPending, metaAdsPending, tiktokPending] =
      await Promise.all([
        getGoogleMerchantPending(session.shop),
        getGoogleAdsPending(session.shop),
        getMetaCatalogPending(session.shop),
        getMetaAdsPending(session.shop),
        getTiktokCatalogPending(session.shop),
      ]);
    const bindingPending: AdsOverviewBindingPending = {
      google: Boolean(gmcPending?.accounts.length || adsPending?.accounts.length),
      meta: Boolean(metaPending?.accounts.length || metaAdsPending?.accounts.length),
      tiktok: Boolean(tiktokPending),
    };
    return { overview, rangeDays, bindingPending, error: null as string | null };
  } catch (error) {
    console.error("[AdsHub] overview failed:", error);
    return {
      overview: null,
      rangeDays,
      bindingPending: EMPTY_BINDING_PENDING,
      error: error instanceof Error ? error.message : "overview_failed",
    };
  }
};

export default function AppAdsIndex() {
  const { t } = useTranslation();
  const { overview, rangeDays, bindingPending, error } = useLoaderData<typeof loader>();
  const locationSearch = useEmbeddedLocationSearch();
  const revalidator = useRevalidator();
  const syncFetcher = useFetcher<SyncResponse>();

  const platforms = overview?.platforms ?? FALLBACK_PLATFORMS;
  const adsConnected = platforms.filter((p) => p.adsConnected);
  // 只连了商品目录不会产生任何投放数据，所以这一页仍按「还没接入」处理。
  const hasAdsAccount = adsConnected.length > 0;

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

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20, width: "100%" }}>
      {/* hub 顶栏已有「广告分析」；这里只保留当前 tab 的一句说明 */}
      <p
        style={{
          margin: 0,
          fontSize: 13,
          color: pageColorTokens.textSecondary,
          lineHeight: 1.45,
        }}
      >
        {hasAdsAccount
          ? t("adsHub.overview.subtitleRange", { days: rangeDays })
          : t("adsHub.overview.leadEmpty")}
      </p>

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

      {hasAdsAccount && syncingNow.length > 0 ? (
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

      <AdsOverviewWorkspace
        platforms={platforms}
        bindingPending={bindingPending}
        locationSearch={locationSearch}
        rangeDays={rangeDays}
        dateStart={overview?.dateStart ?? ""}
        dateEnd={overview?.dateEnd ?? ""}
        syncingPlatforms={syncingNow}
        onAuthSettled={() => revalidator.revalidate()}
      />

      {hasAdsAccount ? (
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
      ) : null}
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

