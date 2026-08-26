import type { LoaderFunctionArgs } from "react-router";
import { useLoaderData, useSearchParams } from "react-router";
import { useEmbeddedNavigate } from "../hooks/useEmbeddedNavigate";
import { hasReadReportsScope } from "../lib/shopifyReports";
import { TODAY_ALL_COUNTRIES } from "../lib/todayGeo.shared";
import { authenticate } from "../shopify.server";
import { loadTodayDecisionReportData } from "../server/operations/todayGeo.server";
import { TodayCountryFilterCard } from "./component/today/TodayCountryFilterCard";
import { TodayMetricReportPage } from "./page/TodayMetricReportPage";

export default function TodayProfitPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useEmbeddedNavigate();
  const returnTo = searchParams.get("returnTo")?.trim() || undefined;
  const rawFocus = searchParams.get("focus");
  const focus = rawFocus === "cost" || rawFocus === "margin" ? rawFocus : "profit";
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
    params.delete("focus");
    const query = params.toString();
    if (nextFocus === "cost") {
      navigate(query ? `/app/today/cost?${query}` : "/app/today/cost");
      return;
    }
    if (nextFocus === "margin") {
      params.set("focus", "margin");
    }
    const nextQuery = params.toString();
    navigate(nextQuery ? `/app/today/profit?${nextQuery}` : "/app/today/profit");
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
            { key: "profit", label: "利润" },
            { key: "cost", label: "成本" },
            { key: "margin", label: "利润率" },
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
    metric: "profit",
    focus: url.searchParams.get("focus"),
  });
};
