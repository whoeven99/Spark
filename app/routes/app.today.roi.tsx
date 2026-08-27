import { useEffect, useMemo, useRef } from "react";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { useFetcher, useLoaderData, useSearchParams } from "react-router";
import { useTranslation } from "react-i18next";
import { hasReadReportsScope } from "../lib/shopifyReports";
import {
  resolveRoiFocus,
  shouldOpenRoiCostSettings,
  stripConsumedRoiDeepLinkParams,
} from "../lib/todayRoiDeepLink";
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
  const { t } = useTranslation();
  const { isMobile } = useResponsiveLayout();
  const [searchParams, setSearchParams] = useSearchParams();
  const data = useLoaderData<typeof loader>();
  const returnTo = searchParams.get("returnTo")?.trim() || undefined;
  const focus = resolveRoiFocus(searchParams);
  const openCostSettings = shouldOpenRoiCostSettings(searchParams);
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

  useEffect(() => {
    const cleaned = stripConsumedRoiDeepLinkParams(searchParams);
    if (!cleaned) return;
    setSearchParams(cleaned, { replace: true, preventScrollReset: true });
  }, [searchParams, setSearchParams]);

  const value = valueFetcher.data?.ok ? valueFetcher.data.value : null;
  const valueLoading = !valueFetcher.data || valueFetcher.state !== "idle";
  const valueFailed = valueFetcher.data?.ok === false;

  const handleCountryChange = (country: string) => {
    const params = new URLSearchParams(searchParams);
    params.delete("valueTab");
    if (country === TODAY_ALL_COUNTRIES) {
      params.delete("country");
    } else {
      params.set("country", country);
    }
    setSearchParams(params, { replace: true, preventScrollReset: true });
  };

  const handleFocusChange = (nextFocus: string) => {
    const params = new URLSearchParams(searchParams);
    params.delete("valueTab");
    if (nextFocus === "overview") {
      params.delete("focus");
    } else {
      params.set("focus", nextFocus);
    }
    setSearchParams(params, { replace: true, preventScrollReset: true });
  };

  const handleToggleCostSettings = () => {
    const params = new URLSearchParams(searchParams);
    params.delete("valueTab");
    if (openCostSettings) {
      params.delete("settings");
    } else {
      params.set("settings", "cost");
    }
    setSearchParams(params, { replace: true, preventScrollReset: true });
  };

  return (
    <TodayMetricReportPage
      report={data.report}
      observationWindow={data.observationWindow}
      returnTo={returnTo}
      selectedCountry={data.filters.selectedCountry}
      countryLabel={data.filters.selectedCountryLabel}
      topSection={
        <TodayCountryFilterCard
          options={data.filters.countries.map((item) => ({ key: item.key, label: item.label }))}
          activeCountry={data.filters.selectedCountry}
          onChange={handleCountryChange}
          focusOptions={[
            { key: "overview", label: t("today.focus.overview") },
            { key: "channels", label: t("today.focus.channels") },
            { key: "loss", label: t("today.focus.loss") },
          ]}
          activeFocus={focus}
          onFocusChange={handleFocusChange}
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
          settingsOpen={openCostSettings}
          onToggleSettings={handleToggleCostSettings}
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
    focus: resolveRoiFocus(url.searchParams),
  });
};
