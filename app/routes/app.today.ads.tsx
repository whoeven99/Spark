import { useEffect, useMemo, useRef } from "react";
import type { LoaderFunctionArgs } from "react-router";
import { useFetcher, useLoaderData, useLocation, useSearchParams } from "react-router";
import { useTranslation } from "react-i18next";
import { buildTodayAnalysisTodoHref } from "../lib/todayAnalysisTodo";
import { hasReadReportsScope } from "../lib/shopifyReports";
import { TODAY_ALL_COUNTRIES } from "../lib/todayGeo.shared";
import { authenticate } from "../shopify.server";
import { loadTodayOverviewReportData } from "../server/operations/todayGeo.server";
import type { ValueLayerResponse } from "./api.today-value-layer";
import { useEmbeddedNavigate } from "../hooks/useEmbeddedNavigate";
import { TodayAnalysisPage } from "./page/TodayAnalysisPage";

export default function TodayAdsAnalysisPage() {
  const { t } = useTranslation();
  const data = useLoaderData<typeof loader>();
  const navigate = useEmbeddedNavigate();
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();
  const returnTo = searchParams.get("returnTo")?.trim() || undefined;
  const valueFetcher = useFetcher<ValueLayerResponse>();
  const lastValuePathRef = useRef<string | null>(null);
  const page = data.analysisPages.find((item) => item.key === "ads");

  const valuePath = useMemo(() => {
    const params = new URLSearchParams();
    if (data.filters.selectedCountry !== TODAY_ALL_COUNTRIES) {
      params.set("country", data.filters.selectedCountry);
    }
    const query = params.toString();
    return query ? `/api/today-value-layer?${query}` : "/api/today-value-layer";
  }, [data.filters.selectedCountry]);

  useEffect(() => {
    if (lastValuePathRef.current === valuePath) return;
    lastValuePathRef.current = valuePath;
    valueFetcher.load(valuePath);
  }, [valueFetcher, valuePath]);

  const buildDetailPath = (path: string) => {
    const [pathname, rawSearch] = path.split("?");
    const params = new URLSearchParams(rawSearch ?? "");
    params.set("returnTo", `${location.pathname}${location.search}`);
    if (data.filters.selectedCountry !== TODAY_ALL_COUNTRIES) {
      params.set("country", data.filters.selectedCountry);
    }
    const query = params.toString();
    return query ? `${pathname}?${query}` : pathname;
  };

  const handleCountryChange = (country: string) => {
    const params = new URLSearchParams(searchParams);
    if (country === TODAY_ALL_COUNTRIES) {
      params.delete("country");
    } else {
      params.set("country", country);
    }
    setSearchParams(params, { replace: true, preventScrollReset: true });
  };

  const channels =
    valueFetcher.data?.ok && valueFetcher.data.value.channels.channels.length > 0
      ? [...valueFetcher.data.value.channels.channels]
          .sort((left, right) => right.revenue - left.revenue)
          .slice(0, 4)
      : [];
  const currency = valueFetcher.data?.ok ? valueFetcher.data.value.channels.currency : null;

  const cards =
    channels.length > 0
      ? channels.map((channel) => {
          const channelParams = { channel: channel.label };
          const roiValue = formatBusinessRoi(channel.roi.businessRoi, t);
          const conclusion =
            channel.roi.businessRoi === null
              ? t("today.ads.conclusionPending", channelParams)
              : channel.roi.businessRoi >= 0.2
                ? t("today.ads.conclusionHealthy", channelParams)
                : t("today.ads.conclusionWeak", channelParams);
          const revenueValue = formatCurrencyValue(channel.revenue, currency);
          const profitValue = formatCurrencyValue(channel.contributionProfit, currency);
          const ordersValue = formatIntegerValue(channel.orderCount);
          const viewAdsTodo = {
            key: `${channel.channelKey}-ads-insights`,
            title: t("today.ads.viewAdsTitle", channelParams),
            detail: t("today.ads.viewAdsDetail"),
            actionLabel: t("today.ads.viewAdsAction"),
            actionType: "open_ads_insights" as const,
            payload: {
              platform: resolveAdsPlatform(channel.channelKey),
            },
          };
          const refinePrompt = [
            t("today.ads.promptIntro", channelParams),
            channel.roi.businessRoi === null
              ? t("today.ads.promptConclusionPending")
              : t("today.ads.promptConclusionValue", { value: roiValue }),
            t("today.ads.promptEvidence", {
              revenue: revenueValue,
              profit: profitValue,
              orders: ordersValue,
            }),
            t("today.ads.promptAsk"),
          ].join("\n");
          const refineTodo = {
            key: `${channel.channelKey}-assistant`,
            title: t("today.ads.refineTitle", channelParams),
            detail: t("today.ads.refineDetail"),
            actionLabel: t("today.ads.refineAction"),
            actionType: "open_assistant" as const,
            payload: { prompt: refinePrompt },
          };

          return {
            key: channel.channelKey,
            title: t("today.ads.channelTitle", channelParams),
            question: t("today.ads.channelQuestion", channelParams),
            metricLabel: t("today.metric.channelRoi"),
            metricValue: roiValue,
            conclusion,
            evidence: [
              { label: t("today.metric.revenue"), value: revenueValue },
              { label: t("today.metric.contributionProfit"), value: profitValue },
              { label: t("today.metric.orders"), value: ordersValue },
            ],
            ideas: [t("today.ads.ideaTraffic"), t("today.ads.ideaProfit"), t("today.ads.ideaScale")],
            todos: [
              {
                ...viewAdsTodo,
                onClick: () => navigate(buildDetailPath(buildTodayAnalysisTodoHref(viewAdsTodo))),
              },
              {
                key: `${channel.channelKey}-roi`,
                title: t("today.ads.viewRoiTitle", channelParams),
                detail: t("today.ads.viewRoiDetail"),
                actionLabel: t("today.ads.viewRoiAction"),
                actionType: "open_report" as const,
                payload: {
                  path: "/app/today/roi?focus=channels",
                },
                onClick: () => navigate(buildDetailPath("/app/today/roi?focus=channels")),
              },
              {
                ...refineTodo,
                onClick: () => navigate(buildDetailPath(buildTodayAnalysisTodoHref(refineTodo))),
              },
            ],
          };
        })
      : page?.cards.map((card) => ({
          ...card,
          todos: card.todos.map((todo) => ({
            ...todo,
            onClick: () => navigate(buildDetailPath(buildTodayAnalysisTodoHref(todo))),
          })),
        })) ?? [];

  return (
    <TodayAnalysisPage
      title={page?.title ?? t("today.topics.adsTitle")}
      subtitle={page?.subtitle ?? t("today.topics.adsSubtitle")}
      returnTo={returnTo}
      countryOptions={data.filters.countries.map((item) => ({ key: item.key, label: item.label }))}
      activeCountry={data.filters.selectedCountry}
      onCountryChange={handleCountryChange}
      notes={data.filters.dataNotes}
      lead={{
        title: t("today.analysis.currentFocus"),
        summary: page?.summary ?? t("today.topics.adsSummary"),
        points: page?.principles,
      }}
      cards={cards}
    />
  );
}

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);
  const url = new URL(request.url);
  return loadTodayOverviewReportData({
    shop: session.shop,
    admin,
    hasReadReports: hasReadReportsScope(session.scope),
    requestedCountry: url.searchParams.get("country"),
  });
};

function resolveAdsPlatform(channelKey: string): "all" | "meta" | "google" | "tiktok" {
  return channelKey === "google"
    ? "google"
    : channelKey === "tiktok"
      ? "tiktok"
      : channelKey === "facebook" || channelKey === "instagram"
        ? "meta"
        : "all";
}

function formatCurrencyValue(value: number, currencyCode: string | null): string {
  if (!Number.isFinite(value)) return "—";
  if (!currencyCode) return new Intl.NumberFormat("zh-CN", { maximumFractionDigits: 0 }).format(value);
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currencyCode,
    maximumFractionDigits: 0,
  }).format(value);
}

function formatBusinessRoi(
  value: number | null,
  t: (key: string, options?: Record<string, unknown>) => string,
): string {
  if (value === null || !Number.isFinite(value)) return t("today.metric.pendingRoi");
  return `${value >= 0 ? "+" : ""}${new Intl.NumberFormat("zh-CN", {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  }).format(value)}x`;
}

function formatIntegerValue(value: number): string {
  if (!Number.isFinite(value)) return "—";
  return new Intl.NumberFormat("zh-CN", { maximumFractionDigits: 0 }).format(value);
}
