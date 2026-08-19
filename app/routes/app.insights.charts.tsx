import type { HeadersFunction, LoaderFunctionArgs } from "react-router";
import { Outlet, useLocation, useNavigate } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { useTranslation } from "react-i18next";
import { authenticate } from "../shopify.server";
import { SegmentedPageTabs } from "./component/shared/SegmentedPageTabs";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  await authenticate.admin(request);
  return null;
};

type ChartsTab = "overview" | "performance";

function resolveTab(pathname: string): ChartsTab {
  if (pathname.includes("/insights/charts/performance")) return "performance";
  return "overview";
}

export default function AppInsightsCharts() {
  const { t } = useTranslation();
  const location = useLocation();
  const navigate = useNavigate();
  const activeTab = resolveTab(location.pathname);

  const items = [
    { key: "overview" as const, label: t("insights.tabOverview") },
    { key: "performance" as const, label: t("insights.tabPerformance") },
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
      <SegmentedPageTabs
        activeTab={activeTab}
        items={items}
        ariaLabel={t("insights.tabCharts")}
        density="compact"
        onTabChange={(tab) =>
          navigate(
            tab === "overview"
              ? `/app/insights/charts${location.search}`
              : `/app/insights/charts/performance${location.search}`,
          )
        }
      />
      <Outlet />
    </div>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
