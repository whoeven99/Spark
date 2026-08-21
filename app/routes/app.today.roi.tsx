import { useEffect, useMemo, useRef } from "react";
import type { ActionFunctionArgs } from "react-router";
import { useFetcher, useSearchParams } from "react-router";
import { getTodayMetricDetail } from "../lib/todayMetricModules";
import { ensureCustomerValueLayer } from "../server/operations/customerValue.server";
import { upsertShopCostConfig } from "../server/operations/roi/costConfig.server";
import type { ValueLayerResponse } from "./api.today-value-layer";
import {
  TodayRoiValueLayerSection,
  TODAY_ROI_COST_CONFIG_FETCHER_KEY,
  type TodayRoiValueTab,
} from "./component/today/TodayRoiValueLayerSection";
import { useResponsiveLayout } from "../hooks/useResponsiveLayout";
import { authenticate } from "../shopify.server";
import { TodayMetricDetailPage } from "./page/TodayMetricDetailPage";

type ActionData = { ok: true } | { ok: false; error: string };

function resolveValueTab(value: string | null): TodayRoiValueTab {
  if (value === "customers" || value === "channels" || value === "cost") return value;
  return "framework";
}

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
  const detail = useMemo(() => getTodayMetricDetail("roi"), []);
  const { isMobile } = useResponsiveLayout();
  const [searchParams, setSearchParams] = useSearchParams();
  const returnTo = searchParams.get("returnTo")?.trim() || undefined;
  const activeValueTab = resolveValueTab(searchParams.get("valueTab"));
  const valueFetcher = useFetcher<ValueLayerResponse>();
  const costConfigFetcher = useFetcher<ActionData>({
    key: TODAY_ROI_COST_CONFIG_FETCHER_KEY,
  });
  const valueRequestedRef = useRef(false);
  const costMutatingRef = useRef(false);

  useEffect(() => {
    const wasMutating = costMutatingRef.current;
    const isMutating = costConfigFetcher.state !== "idle";
    costMutatingRef.current = isMutating;

    if (!valueRequestedRef.current) {
      valueRequestedRef.current = true;
      valueFetcher.load("/api/today-value-layer");
      return;
    }

    if (wasMutating && !isMutating && costConfigFetcher.data?.ok) {
      valueFetcher.load("/api/today-value-layer");
    }
  }, [costConfigFetcher.data, costConfigFetcher.state, valueFetcher]);

  const value = valueFetcher.data?.ok ? valueFetcher.data.value : null;
  const valueLoading = !valueFetcher.data || valueFetcher.state !== "idle";
  const valueFailed = valueFetcher.data?.ok === false;

  const handleValueTabChange = (tab: TodayRoiValueTab) => {
    const params = new URLSearchParams(searchParams);
    params.set("valueTab", tab);
    setSearchParams(params, { replace: true, preventScrollReset: true });
  };

  return (
    <TodayMetricDetailPage
      data={detail}
      returnTo={returnTo}
      extraSections={
        <TodayRoiValueLayerSection
          value={value}
          valueLoading={valueLoading}
          valueFailed={valueFailed}
          isMobile={isMobile}
          activeTab={activeValueTab}
          onTabChange={handleValueTabChange}
        />
      }
    />
  );
}
