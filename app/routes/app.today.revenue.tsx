import type { LoaderFunctionArgs } from "react-router";
import { useLoaderData, useSearchParams } from "react-router";
import { hasReadReportsScope } from "../lib/shopifyReports";
import { TODAY_ALL_COUNTRIES } from "../lib/todayGeo.shared";
import { authenticate } from "../shopify.server";
import { loadTodayDecisionReportData } from "../server/operations/todayGeo.server";
import { TodayCountryFilterCard } from "./component/today/TodayCountryFilterCard";
import { TodayMetricReportPage } from "./page/TodayMetricReportPage";

export default function TodayRevenuePage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const returnTo = searchParams.get("returnTo")?.trim() || undefined;
  const rawFocus = searchParams.get("focus");
  const focus = rawFocus === "orders" || rawFocus === "aov" ? rawFocus : "revenue";
  const data = useLoaderData<typeof loader>();

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
    if (nextFocus === "revenue") {
      params.delete("focus");
    } else {
      params.set("focus", nextFocus);
    }
    setSearchParams(params, { replace: true, preventScrollReset: true });
  };

  return (
    <TodayMetricReportPage
      report={data.report}
      observationWindow={data.observationWindow}
      returnTo={returnTo}
      topSection={
        <TodayCountryFilterCard
          options={data.filters.countries.map((item) => ({ key: item.key, label: item.label }))}
          activeCountry={data.filters.selectedCountry}
          onChange={handleCountryChange}
          focusOptions={[
            { key: "revenue", label: "收入" },
            { key: "orders", label: "订单数" },
            { key: "aov", label: "客单价" },
          ]}
          activeFocus={focus}
          onFocusChange={handleFocusChange}
          notes={data.filters.dataNotes}
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
    metric: "revenue",
    focus: url.searchParams.get("focus"),
  });
};
