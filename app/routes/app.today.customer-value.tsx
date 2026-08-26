import { useEffect, useMemo, useRef } from "react";
import type { LoaderFunctionArgs } from "react-router";
import { useFetcher, useLoaderData, useLocation, useSearchParams } from "react-router";
import { buildTodayAnalysisTodoHref } from "../lib/todayAnalysisTodo";
import { buildTodayAnalysisTodoRefinePrompt } from "../lib/todayReportAi";
import { buildManagedAiLaunchContextFromSpec } from "../lib/managedAiLaunchContext";
import { hasReadReportsScope } from "../lib/shopifyReports";
import { TODAY_ALL_COUNTRIES } from "../lib/todayGeo.shared";
import { authenticate } from "../shopify.server";
import { loadTodayOverviewReportData } from "../server/operations/todayGeo.server";
import type { ValueLayerResponse } from "./api.today-value-layer";
import { useEmbeddedNavigate } from "../hooks/useEmbeddedNavigate";
import { TodayAnalysisPage } from "./page/TodayAnalysisPage";

export default function TodayCustomerValueAnalysisPage() {
  const data = useLoaderData<typeof loader>();
  const navigate = useEmbeddedNavigate();
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();
  const returnTo = searchParams.get("returnTo")?.trim() || undefined;
  const valueFetcher = useFetcher<ValueLayerResponse>();
  const lastValuePathRef = useRef<string | null>(null);
  const page = data.analysisPages.find((item) => item.key === "customer_value");

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

  const valueLayer = valueFetcher.data?.ok ? valueFetcher.data.value : null;
  const customer = valueLayer?.customers;
  const segmentCounts = customer?.segmentCounts;
  const segmentSummary = segmentCounts
    ? `新客 ${formatIntegerValue(segmentCounts.new)} / 活跃 ${formatIntegerValue(segmentCounts.active)} / VIP ${formatIntegerValue(segmentCounts.vip)} / 风险 ${formatIntegerValue(segmentCounts.at_risk)}`
    : "待补 segment";
  const cards =
    page?.cards.map((card) => {
      const base = {
        ...card,
        todos: card.todos.map((todo) => ({
          ...todo,
          onClick: () => navigate(buildDetailPath(buildTodayAnalysisTodoHref(todo))),
        })),
      };

      if (card.key === "quality-segmentation") {
        const qualityCard = {
          ...base,
          metricLabel: "高价值客户占比",
          metricValue: customer ? formatPercentValue(customer.highValueShare) : "加载中",
          conclusion: customer
            ? `当前高价值客户占比 ${formatPercentValue(customer.highValueShare)}，说明现在的经营成果里，有多少是真正来自高质量客户。`
            : card.conclusion,
          evidence: customer
            ? [
                { label: "高价值客户占比", value: formatPercentValue(customer.highValueShare) },
                { label: "平均分数", value: formatScoreValue(customer.averageScore) },
                { label: "复购率", value: formatPercentValue(customer.repeatPurchaseRate) },
              ]
            : base.evidence,
          detail: customer ? `平均分数 ${formatScoreValue(customer.averageScore)} / 复购率 ${formatPercentValue(customer.repeatPurchaseRate)}` : undefined,
        };
        const assistantPrompt = buildTodayAnalysisTodoRefinePrompt("客户生命价值分析", qualityCard);
        return {
          ...qualityCard,
          todos: [
            ...qualityCard.todos.slice(0, 1),
            {
              key: "customer-quality-assistant",
              title: "让 AI 细化客户质量 todo",
              detail: "把当前客户质量判断拆成 today 可执行动作。",
              actionLabel: "让 AI 细化 todo",
              actionType: "open_assistant" as const,
              onClick: () =>
                navigate(
                  buildDetailPath(
                    buildTodayAnalysisTodoHref({
                      key: "customer-quality-assistant",
                      title: "让 AI 细化客户质量 todo",
                      detail: "把当前客户质量判断拆成 today 可执行动作。",
                      actionLabel: "让 AI 细化 todo",
                      actionType: "open_assistant",
                      payload: {
                        prompt: assistantPrompt.chatPrompt,
                        managedAiContext: buildManagedAiLaunchContextFromSpec(assistantPrompt.spec),
                      },
                    }),
                  ),
                ),
              payload: {
                prompt: assistantPrompt.chatPrompt,
                managedAiContext: buildManagedAiLaunchContextFromSpec(assistantPrompt.spec),
              },
            },
          ],
        };
      }

      if (card.key === "segment-structure") {
        return {
          ...base,
          metricValue: segmentSummary,
          evidence: customer
            ? [
                { label: "新客", value: formatIntegerValue(customer.segmentCounts.new) },
                { label: "活跃 / VIP", value: `${formatIntegerValue(customer.segmentCounts.active)} / ${formatIntegerValue(customer.segmentCounts.vip)}` },
                { label: "风险 / 流失", value: `${formatIntegerValue(customer.segmentCounts.at_risk)} / ${formatIntegerValue(customer.segmentCounts.churned)}` },
              ]
            : base.evidence,
          detail: customer
            ? `流失客户 ${formatIntegerValue(customer.segmentCounts.churned)} / 退款风险标签 ${formatIntegerValue(customer.tagCounts.refund_risk)}`
            : undefined,
        };
      }

      if (card.key === "ltv-potential") {
        return {
          ...base,
          metricValue: customer ? formatCurrencyValue(customer.averageDynamicLtv, valueLayer?.channels.currency ?? null) : "加载中",
          conclusion: customer ? "动态 LTV 用来判断今天获客和转化带来的客户，长期有没有机会持续贡献利润。" : card.conclusion,
          evidence: customer
            ? [
                { label: "动态 LTV", value: formatCurrencyValue(customer.averageDynamicLtv, valueLayer?.channels.currency ?? null) },
                { label: "付费客户", value: formatIntegerValue(customer.payingCustomers) },
                { label: "总客户", value: formatIntegerValue(customer.totalCustomers) },
              ]
            : base.evidence,
          detail: customer ? `付费客户 ${formatIntegerValue(customer.payingCustomers)} / 总客户 ${formatIntegerValue(customer.totalCustomers)}` : undefined,
        };
      }

      return base;
    }) ?? [];

  return (
    <TodayAnalysisPage
      title={page?.title ?? "客户生命价值分析"}
      subtitle={page?.subtitle ?? "客户生命价值分析关注的是客户质量划分、segment 结构和长期价值，而不是只看一个平均数。"}
      returnTo={returnTo}
      countryOptions={data.filters.countries.map((item) => ({ key: item.key, label: item.label }))}
      activeCountry={data.filters.selectedCountry}
      onCountryChange={handleCountryChange}
      notes={data.filters.dataNotes}
      lead={{
        title: "当前焦点",
        summary:
          page?.summary ??
          "客户生命价值页先回答两件事：客户质量怎么分层，哪些 segment 值得继续经营，哪些 segment 已经在流失。",
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

function formatPercentValue(value: number): string {
  if (!Number.isFinite(value)) return "—";
  return `${new Intl.NumberFormat("zh-CN", {
    minimumFractionDigits: value % 1 === 0 ? 0 : 1,
    maximumFractionDigits: 1,
  }).format(value)}%`;
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

function formatIntegerValue(value: number): string {
  if (!Number.isFinite(value)) return "—";
  return new Intl.NumberFormat("zh-CN", { maximumFractionDigits: 0 }).format(value);
}

function formatScoreValue(value: number): string {
  if (!Number.isFinite(value)) return "—";
  return new Intl.NumberFormat("zh-CN", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 1,
  }).format(value);
}
