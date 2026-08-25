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

  const summary =
    focus === "orders"
      ? `当前范围：${data.filters.selectedCountryLabel}。这里优先判断订单规模背后，哪些订单值得继续复制，哪些订单只是把单量做大。`
      : focus === "aov"
        ? `当前范围：${data.filters.selectedCountryLabel}。这里优先判断高客单是不是健康样本，而不是少量不可复制的虚高订单。`
        : `当前范围：${data.filters.selectedCountryLabel}。这里先区分收入增长里哪些对象值得继续跟，哪些对象只是把规模做大。`;

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
            { key: "revenue", label: "收入" },
            { key: "orders", label: "订单数" },
            { key: "aov", label: "客单价" },
          ]}
          activeFocus={focus}
          onFocusChange={handleFocusChange}
          summary={summary}
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
