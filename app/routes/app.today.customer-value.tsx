import { useEffect, useMemo, useRef } from "react";
import type { LoaderFunctionArgs } from "react-router";
import { useFetcher, useLoaderData, useLocation, useSearchParams } from "react-router";
import { useTranslation } from "react-i18next";
import { buildTodayAnalysisTodoHref } from "../lib/todayAnalysisTodo";
import { buildTodayAnalysisTodoRefinePrompt } from "../lib/todayReportAi";
import { buildManagedAiLaunchContextFromSpec } from "../lib/managedAiLaunchContext";
import { hasReadReportsScope } from "../lib/shopifyReports";
import { TODAY_ALL_COUNTRIES } from "../lib/todayGeo.shared";
import { localizeAnalysisPage } from "../lib/todayCopy";
import { authenticate } from "../shopify.server";
import { loadTodayOverviewReportData } from "../server/operations/todayGeo.server";
import type { ValueLayerResponse } from "./api.today-value-layer";
import { useEmbeddedNavigate } from "../hooks/useEmbeddedNavigate";
import { TodayAnalysisPage } from "./page/TodayAnalysisPage";

export default function TodayCustomerValueAnalysisPage() {
  const { t } = useTranslation();
  const data = useLoaderData<typeof loader>();
  const navigate = useEmbeddedNavigate();
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();
  const returnTo = searchParams.get("returnTo")?.trim() || undefined;
  const valueFetcher = useFetcher<ValueLayerResponse>();
  const lastValuePathRef = useRef<string | null>(null);
  const page = data.analysisPages.find((item) => item.key === "customer_value");
  const localizedPage = page ? localizeAnalysisPage(page, t) : null;

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
    ? t("today.customerValue.segmentSummary", {
        newCount: formatIntegerValue(segmentCounts.new),
        activeCount: formatIntegerValue(segmentCounts.active),
        vipCount: formatIntegerValue(segmentCounts.vip),
        riskCount: formatIntegerValue(segmentCounts.at_risk),
      })
    : t("today.customerValue.segmentPending");
  const cards =
    localizedPage?.cards.map((card) => {
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
          metricLabel: t("today.metric.highValueShare"),
          metricValue: customer ? formatPercentValue(customer.highValueShare) : t("today.home.loading"),
          conclusion: customer
            ? t("today.customerValue.qualityConclusion", {
                share: formatPercentValue(customer.highValueShare),
              })
            : card.conclusion,
          evidence: customer
            ? [
                { label: t("today.metric.highValueShare"), value: formatPercentValue(customer.highValueShare) },
                { label: t("today.metric.averageScore"), value: formatScoreValue(customer.averageScore) },
                { label: t("today.metric.repeatPurchaseRate"), value: formatPercentValue(customer.repeatPurchaseRate) },
              ]
            : base.evidence,
          detail: customer
            ? t("today.customerValue.qualityDetail", {
                score: formatScoreValue(customer.averageScore),
                repeatRate: formatPercentValue(customer.repeatPurchaseRate),
              })
            : undefined,
        };
        const assistantPrompt = buildTodayAnalysisTodoRefinePrompt(
          t("today.topics.customerValueTitle"),
          qualityCard,
        );
        return {
          ...qualityCard,
          todos: [
            ...qualityCard.todos.slice(0, 1),
            {
              key: "customer-quality-assistant",
              title: t("today.customerValue.refineTitle"),
              detail: t("today.customerValue.refineDetail"),
              actionLabel: t("today.customerValue.refineAction"),
              actionType: "open_assistant" as const,
              onClick: () =>
                navigate(
                  buildDetailPath(
                    buildTodayAnalysisTodoHref({
                      key: "customer-quality-assistant",
                      title: t("today.customerValue.refineTitle"),
                      detail: t("today.customerValue.refineDetail"),
                      actionLabel: t("today.customerValue.refineAction"),
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
                { label: t("today.metric.newCustomers"), value: formatIntegerValue(customer.segmentCounts.new) },
                {
                  label: t("today.metric.activeVip"),
                  value: `${formatIntegerValue(customer.segmentCounts.active)} / ${formatIntegerValue(customer.segmentCounts.vip)}`,
                },
                {
                  label: t("today.metric.riskChurned"),
                  value: `${formatIntegerValue(customer.segmentCounts.at_risk)} / ${formatIntegerValue(customer.segmentCounts.churned)}`,
                },
              ]
            : base.evidence,
          detail: customer
            ? t("today.customerValue.churnDetail", {
                churned: formatIntegerValue(customer.segmentCounts.churned),
                refundRisk: formatIntegerValue(customer.tagCounts.refund_risk),
              })
            : undefined,
        };
      }

      if (card.key === "ltv-potential") {
        return {
          ...base,
          metricValue: customer
            ? formatCurrencyValue(customer.averageDynamicLtv, valueLayer?.channels.currency ?? null)
            : t("today.home.loading"),
          conclusion: customer ? t("today.customerValue.ltvConclusion") : card.conclusion,
          evidence: customer
            ? [
                {
                  label: t("today.metric.dynamicLtv"),
                  value: formatCurrencyValue(customer.averageDynamicLtv, valueLayer?.channels.currency ?? null),
                },
                { label: t("today.metric.payingCustomers"), value: formatIntegerValue(customer.payingCustomers) },
                { label: t("today.metric.totalCustomers"), value: formatIntegerValue(customer.totalCustomers) },
              ]
            : base.evidence,
          detail: customer
            ? t("today.customerValue.ltvDetail", {
                paying: formatIntegerValue(customer.payingCustomers),
                total: formatIntegerValue(customer.totalCustomers),
              })
            : undefined,
        };
      }

      return base;
    }) ?? [];

  return (
    <TodayAnalysisPage
      title={localizedPage?.title ?? t("today.topics.customerValueTitle")}
      subtitle={localizedPage?.subtitle ?? t("today.topics.customerValueSubtitle")}
      returnTo={returnTo}
      countryOptions={data.filters.countries.map((item) => ({ key: item.key, label: item.label }))}
      activeCountry={data.filters.selectedCountry}
      onCountryChange={handleCountryChange}
      notes={data.filters.dataNotes}
      lead={{
        title: t("today.analysis.currentFocus"),
        summary: localizedPage?.summary ?? t("today.topics.customerValueSummary"),
        points: localizedPage?.principles,
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
