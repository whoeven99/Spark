import type { LoaderFunctionArgs } from "react-router";
import { useLoaderData, useSearchParams } from "react-router";
import { hasReadReportsScope } from "../lib/shopifyReports";
import { authenticate } from "../shopify.server";
import { loadTodayDetailData, TODAY_ALL_COUNTRIES } from "../server/operations/todayGeo.server";
import { TodayMetricDetailPage } from "./page/TodayMetricDetailPage";
import { TodayCountryFilterCard } from "./component/today/TodayCountryFilterCard";

export default function TodayOrdersPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const returnTo = searchParams.get("returnTo")?.trim() || undefined;
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

  return (
    <TodayMetricDetailPage
      data={data.detail}
      returnTo={returnTo}
      topSection={
        <TodayCountryFilterCard
          options={data.filters.countries.map((item) => ({ key: item.key, label: item.label }))}
          activeCountry={data.filters.selectedCountry}
          onChange={handleCountryChange}
          summary={`当前范围：${data.filters.selectedCountryLabel}。这里先看不同地区的订单规模、收入质量和退款损耗。`}
          notes={data.filters.dataNotes}
        />
      }
    />
  );
}

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);
  const url = new URL(request.url);
  return loadTodayDetailData({
    shop: session.shop,
    admin,
    hasReadReports: hasReadReportsScope(session.scope),
    requestedCountry: url.searchParams.get("country"),
    metric: "orders",
  });
};
