/**
 * 经营目的地（PR4）：把经营看板 / 每日诊断待办 / 订单监控合并到一个 Today。
 * 顶部 SegmentedTab 在 概览 / 诊断 / 订单 三个子路由间切换；诊断、订单为原页面整体迁移，
 * 概览复用工作台经营看板快照。SLA/退款/物流阈值统一由 diagnosis.server 提供（已消除双写）。
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

type TodayTab = "overview" | "diagnosis" | "orders";

function resolveTab(pathname: string): TodayTab {
  if (pathname.includes("/today/diagnosis")) return "diagnosis";
  if (pathname.includes("/today/orders")) return "orders";
  return "overview";
}

export default function AppToday() {
  const { t } = useTranslation();
  const location = useLocation();
  const navigate = useNavigate();
  const activeTab = resolveTab(location.pathname);

  const items = [
    { key: "overview" as const, label: t("todayShell.overview") },
    { key: "diagnosis" as const, label: t("nav.dailyOperations") },
    { key: "orders" as const, label: t("nav.orderMonitor") },
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
      <div style={{ paddingTop: "0.5rem" }}>
        <SegmentedPageTabs
          activeTab={activeTab}
          items={items}
          ariaLabel={t("nav.today")}
          onTabChange={(tab) =>
            navigate(tab === "overview" ? `/app/today${location.search}` : `/app/today/${tab}${location.search}`)
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
