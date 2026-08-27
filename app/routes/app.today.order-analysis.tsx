import type { LoaderFunctionArgs } from "react-router";
import { useLoaderData, useLocation, useSearchParams } from "react-router";
import { useTranslation } from "react-i18next";
import { buildTodayAnalysisTodoHref } from "../lib/todayAnalysisTodo";
import { hasReadReportsScope } from "../lib/shopifyReports";
import { TODAY_ALL_COUNTRIES } from "../lib/todayGeo.shared";
import { localizeAnalysisPage } from "../lib/todayCopy";
import { authenticate } from "../shopify.server";
import { loadTodayOverviewReportData } from "../server/operations/todayGeo.server";
import { useEmbeddedNavigate } from "../hooks/useEmbeddedNavigate";
import { TodayAnalysisPage } from "./page/TodayAnalysisPage";

export default function TodayOrderAnalysisPage() {
  const { t } = useTranslation();
  const data = useLoaderData<typeof loader>();
  const navigate = useEmbeddedNavigate();
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();
  const returnTo = searchParams.get("returnTo")?.trim() || undefined;
  const page = data.analysisPages.find((item) => item.key === "orders");
  const localizedPage = page ? localizeAnalysisPage(page, t) : null;

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

  const cards =
    localizedPage?.cards.map((card) => ({
      ...card,
      todos: card.todos.map((todo) => ({
        ...todo,
        onClick: () => navigate(buildDetailPath(buildTodayAnalysisTodoHref(todo))),
      })),
    })) ?? [];

  return (
    <TodayAnalysisPage
      title={localizedPage?.title ?? t("today.topics.ordersTitle")}
      subtitle={localizedPage?.subtitle ?? t("today.topics.ordersSubtitle")}
      returnTo={returnTo}
      countryOptions={data.filters.countries.map((item) => ({ key: item.key, label: item.label }))}
      activeCountry={data.filters.selectedCountry}
      onCountryChange={handleCountryChange}
      notes={data.filters.dataNotes}
      lead={{
        title: t("today.analysis.currentFocus"),
        summary: localizedPage?.summary ?? t("today.topics.ordersSummary"),
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
