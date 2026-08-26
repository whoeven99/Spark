import { useEffect, useMemo, useRef } from "react";
import type { LoaderFunctionArgs } from "react-router";
import { useFetcher, useLoaderData, useLocation, useSearchParams } from "react-router";
import { buildTodayAnalysisTodoHref } from "../lib/todayAnalysisTodo";
import { hasReadReportsScope } from "../lib/shopifyReports";
import { TODAY_ALL_COUNTRIES } from "../lib/todayGeo.shared";
import { authenticate } from "../shopify.server";
import { loadTodayOverviewReportData } from "../server/operations/todayGeo.server";
import type { ValueLayerResponse } from "./api.today-value-layer";
import { useEmbeddedNavigate } from "../hooks/useEmbeddedNavigate";
import { TodayAnalysisPage } from "./page/TodayAnalysisPage";

export default function TodayAdsAnalysisPage() {
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
      ? channels.map((channel) => ({
          key: channel.channelKey,
          title: `${channel.label} 渠道分析`,
          question: `${channel.label} 现在值得继续加码，还是应该先限制投入？`,
          metricLabel: "渠道 ROI",
          metricValue: formatBusinessRoi(channel.roi.businessRoi),
          conclusion:
            channel.roi.businessRoi === null
              ? `${channel.label} 当前还缺广告费或关键成本，先把口径补齐再判断是否值得加码。`
              : channel.roi.businessRoi >= 0.2
                ? `${channel.label} 当前回报还在健康区，下一步继续看创意、投放结构和承接页是否还能放大。`
                : `${channel.label} 当前回报已经偏弱，先限制低效投入，再下钻具体 campaign 和对象。`,
          evidence: [
            { label: "收入", value: formatCurrencyValue(channel.revenue, currency) },
            { label: "贡献利润", value: formatCurrencyValue(channel.contributionProfit, currency) },
            { label: "订单", value: formatIntegerValue(channel.orderCount) },
          ],
          ideas: [
            "先判断当前回报是流量问题、创意问题还是承接质量问题。",
            "渠道判断不能只看收入，还要看利润和后续损耗。",
            "适合继续加码的渠道，要继续下钻到平台和 campaign 结构。",
          ],
          todos: [
            {
              key: `${channel.channelKey}-ads-insights`,
              title: `查看 ${channel.label} 广告表现`,
              detail: "继续下钻到平台表现页，定位具体 campaign 或创意。",
              actionLabel: "看广告表现",
              actionType: "open_ads_insights" as const,
              payload: {
                platform: resolveAdsPlatform(channel.channelKey),
              },
              onClick: () =>
                navigate(
                  buildDetailPath(
                    buildTodayAnalysisTodoHref({
                      key: `${channel.channelKey}-ads-insights`,
                      title: `查看 ${channel.label} 广告表现`,
                      detail: "继续下钻到平台表现页，定位具体 campaign 或创意。",
                      actionLabel: "看广告表现",
                      actionType: "open_ads_insights",
                      payload: { platform: resolveAdsPlatform(channel.channelKey) },
                    }),
                  ),
                ),
            },
            {
              key: `${channel.channelKey}-roi`,
              title: `查看 ${channel.label} ROI 渠道页`,
              detail: "回到 ROI 渠道页，确认该渠道在整体经营中的位置。",
              actionLabel: "看 ROI 渠道页",
              actionType: "open_report" as const,
              payload: {
                path: "/app/today/roi?focus=channels",
              },
              onClick: () => navigate(buildDetailPath("/app/today/roi?focus=channels")),
            },
            {
              key: `${channel.channelKey}-assistant`,
              title: `让 AI 细化 ${channel.label} 投放 todo`,
              detail: "把当前渠道判断进一步拆成今天能执行的投放动作。",
              actionLabel: "让 AI 细化 todo",
              actionType: "open_assistant" as const,
              payload: {
                prompt: [
                  `我们正在查看 Today 的广告分析，渠道为 ${channel.label}。`,
                  `当前结论：${channel.roi.businessRoi === null ? "渠道 ROI 口径未补齐。" : `渠道 ROI 为 ${formatBusinessRoi(channel.roi.businessRoi)}。`}`,
                  `证据：收入 ${formatCurrencyValue(channel.revenue, currency)}；贡献利润 ${formatCurrencyValue(channel.contributionProfit, currency)}；订单 ${formatIntegerValue(channel.orderCount)}。`,
                  "请输出 3 条今天就能执行的广告优化 todo，并标明优先级。",
                ].join("\n"),
              },
              onClick: () =>
                navigate(
                  buildDetailPath(
                    buildTodayAnalysisTodoHref({
                      key: `${channel.channelKey}-assistant`,
                      title: `让 AI 细化 ${channel.label} 投放 todo`,
                      detail: "把当前渠道判断进一步拆成今天能执行的投放动作。",
                      actionLabel: "让 AI 细化 todo",
                      actionType: "open_assistant",
                      payload: {
                        prompt: [
                          `我们正在查看 Today 的广告分析，渠道为 ${channel.label}。`,
                          `当前结论：${channel.roi.businessRoi === null ? "渠道 ROI 口径未补齐。" : `渠道 ROI 为 ${formatBusinessRoi(channel.roi.businessRoi)}。`}`,
                          `证据：收入 ${formatCurrencyValue(channel.revenue, currency)}；贡献利润 ${formatCurrencyValue(channel.contributionProfit, currency)}；订单 ${formatIntegerValue(channel.orderCount)}。`,
                          "请输出 3 条今天就能执行的广告优化 todo，并标明优先级。",
                        ].join("\n"),
                      },
                    }),
                  ),
                ),
            },
          ],
        }))
      : page?.cards.map((card) => ({
          ...card,
          todos: card.todos.map((todo) => ({
            ...todo,
            onClick: () => navigate(buildDetailPath(buildTodayAnalysisTodoHref(todo))),
          })),
        })) ?? [];

  return (
    <TodayAnalysisPage
      title={page?.title ?? "广告分析"}
      subtitle={page?.subtitle ?? "广告分析按渠道拆开看，不把所有投放平台揉成一个总 ROI。"}
      returnTo={returnTo}
      countryOptions={data.filters.countries.map((item) => ({ key: item.key, label: item.label }))}
      activeCountry={data.filters.selectedCountry}
      onCountryChange={handleCountryChange}
      notes={data.filters.dataNotes}
      lead={{
        title: "当前焦点",
        summary:
          page?.summary ??
          "广告分析应该先回答渠道差异：不同渠道的收入、贡献利润和 ROI 是否支撑继续投放，而不是只看一个总回报数。",
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

function formatBusinessRoi(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return "待补 ROI";
  return `${value >= 0 ? "+" : ""}${new Intl.NumberFormat("zh-CN", {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  }).format(value)}x`;
}

function formatIntegerValue(value: number): string {
  if (!Number.isFinite(value)) return "—";
  return new Intl.NumberFormat("zh-CN", { maximumFractionDigits: 0 }).format(value);
}
