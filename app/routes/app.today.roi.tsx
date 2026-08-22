import { useEffect, useMemo, useRef } from "react";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { useFetcher, useLoaderData, useSearchParams } from "react-router";
import { hasReadReportsScope } from "../lib/shopifyReports";
import { TODAY_ALL_COUNTRIES } from "../lib/todayGeo.shared";
import { ensureCustomerValueLayer } from "../server/operations/customerValue.server";
import { upsertShopCostConfig } from "../server/operations/roi/costConfig.server";
import { loadTodayDecisionReportData } from "../server/operations/todayGeo.server";
import type { ValueLayerResponse } from "./api.today-value-layer";
import {
  TodayRoiValueLayerSection,
  TODAY_ROI_COST_CONFIG_FETCHER_KEY,
} from "./component/today/TodayRoiValueLayerSection";
import { useResponsiveLayout } from "../hooks/useResponsiveLayout";
import { authenticate } from "../shopify.server";
import { TodayMetricReportPage } from "./page/TodayMetricReportPage";
import { TodayCountryFilterCard } from "./component/today/TodayCountryFilterCard";

type ActionData = { ok: true } | { ok: false; error: string };

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const formData = await request.formData();
  const intent = formData.get("intent")?.toString();

  if (intent !== "cost-config") {
    return Response.json({ ok: false, error: "unsupported intent" } satisfies ActionData, {
      status: 400,
    });
  }

  try {
    const num = (name: string) => Number(formData.get(name)?.toString() ?? "");
    const config = await upsertShopCostConfig(session.shop, {
      defaultGrossMarginPercent: num("defaultGrossMarginPercent"),
      paymentFeePercent: num("paymentFeePercent"),
      paymentFeeFixed: num("paymentFeeFixed"),
      monthlyFixedCost: num("monthlyFixedCost"),
    });
    await ensureCustomerValueLayer(session.shop, config.defaultGrossMarginPercent, {
      force: true,
    });
    return Response.json({ ok: true } satisfies ActionData);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("[today.roi] action failed:", error);
    return Response.json({ ok: false, error: message } satisfies ActionData, { status: 500 });
  }
};

export default function TodayRoiPage() {
  const { isMobile } = useResponsiveLayout();
  const [searchParams, setSearchParams] = useSearchParams();
  const data = useLoaderData<typeof loader>();
  const returnTo = searchParams.get("returnTo")?.trim() || undefined;
  const rawFocus = searchParams.get("focus");
  const focus =
    rawFocus === "channels" || rawFocus === "loss" || rawFocus === "layers" ? rawFocus : "roi";
  const valueFetcher = useFetcher<ValueLayerResponse>();
  const costConfigFetcher = useFetcher<ActionData>({
    key: TODAY_ROI_COST_CONFIG_FETCHER_KEY,
  });
  const valueRequestedRef = useRef(false);
  const costMutatingRef = useRef(false);
  const lastValuePathRef = useRef<string | null>(null);
  const valuePath = useMemo(() => {
    const params = new URLSearchParams();
    if (data.filters.selectedCountry !== TODAY_ALL_COUNTRIES) {
      params.set("country", data.filters.selectedCountry);
    }
    const query = params.toString();
    return query ? `/api/today-value-layer?${query}` : "/api/today-value-layer";
  }, [data.filters.selectedCountry]);

  useEffect(() => {
    const wasMutating = costMutatingRef.current;
    const isMutating = costConfigFetcher.state !== "idle";
    costMutatingRef.current = isMutating;
    const pathChanged = lastValuePathRef.current !== valuePath;
    lastValuePathRef.current = valuePath;

    if (!valueRequestedRef.current) {
      valueRequestedRef.current = true;
      valueFetcher.load(valuePath);
      return;
    }

    if (pathChanged) {
      valueFetcher.load(valuePath);
      return;
    }

    if (wasMutating && !isMutating && costConfigFetcher.data?.ok) {
      valueFetcher.load(valuePath);
    }
  }, [costConfigFetcher.data, costConfigFetcher.state, valueFetcher, valuePath]);

  const value = valueFetcher.data?.ok ? valueFetcher.data.value : null;
  const valueLoading = !valueFetcher.data || valueFetcher.state !== "idle";
  const valueFailed = valueFetcher.data?.ok === false;

  const handleCountryChange = (country: string) => {
    const params = new URLSearchParams(searchParams);
    if (country === TODAY_ALL_COUNTRIES) {
      params.delete("country");
    } else {
      params.set("country", country);
    }
    setSearchParams(params, { replace: true, preventScrollReset: true });
  };

  const handleFocusChange = (nextFocus: string) => {
    const params = new URLSearchParams(searchParams);
    if (nextFocus === "roi") {
      params.delete("focus");
    } else {
      params.set("focus", nextFocus);
    }
    setSearchParams(params, { replace: true, preventScrollReset: true });
  };

  const summary =
    focus === "channels"
      ? `当前范围：${data.filters.selectedCountryLabel}。这里优先判断哪些渠道真的值得继续投，哪些渠道只是把收入做出来却留不住利润。`
      : focus === "loss"
        ? `当前范围：${data.filters.selectedCountryLabel}。这里优先判断折扣、退款和高损耗订单如何继续吞掉经营回报。`
        : focus === "layers"
          ? `当前范围：${data.filters.selectedCountryLabel}。这里优先从价值层、客户质量和复购信号判断 ROI 是否有持续支撑。`
          : `当前范围：${data.filters.selectedCountryLabel}。这里先看不同地区的经营回报、折扣与退款结构。`;

  return (
    <TodayMetricReportPage
      report={data.report}
      returnTo={returnTo}
      topSection={
        <TodayCountryFilterCard
          options={data.filters.countries.map((item) => ({ key: item.key, label: item.label }))}
          activeCountry={data.filters.selectedCountry}
          onChange={handleCountryChange}
          focusOptions={[
            { key: "roi", label: "总览" },
            { key: "channels", label: "渠道" },
            { key: "loss", label: "损耗" },
            { key: "layers", label: "价值层" },
          ]}
          activeFocus={focus}
          onFocusChange={handleFocusChange}
          summary={summary}
          notes={data.filters.dataNotes}
        />
      }
      extraSections={
        <TodayRoiValueLayerSection
          value={value}
          valueLoading={valueLoading}
          valueFailed={valueFailed}
          isMobile={isMobile}
          focus={focus}
        />
      }
    />
  );
}

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);
  const url = new URL(request.url);
  return loadTodayDecisionReportData({
    shop: session.shop,
    admin,
    hasReadReports: hasReadReportsScope(session.scope),
    requestedCountry: url.searchParams.get("country"),
    metric: "roi",
    focus: url.searchParams.get("focus"),
  });
};
