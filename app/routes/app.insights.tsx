/**
 * 洞察目的地：把分散在 Settings、Ads Catalog 的广告数据收敛成一个只读分析入口。
 * 顶部 SegmentedTab 在 总览 / 投放表现 之间切换；授权、建广告、跑同步等写操作仍留在原页面。
 */
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

type InsightsTab = "overview" | "performance";

function resolveTab(pathname: string): InsightsTab {
  if (pathname.includes("/insights/performance")) return "performance";
  return "overview";
}

export default function AppInsights() {
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
      <div style={{ paddingTop: "0.5rem" }}>
        <SegmentedPageTabs
          activeTab={activeTab}
          items={items}
          ariaLabel={t("nav.insights")}
          onTabChange={(tab) =>
            navigate(
              tab === "overview"
                ? `/app/insights${location.search}`
                : `/app/insights/${tab}${location.search}`,
            )
          }
        />
      </div>
      <Outlet />
    </div>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
