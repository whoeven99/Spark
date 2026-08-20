/**
 * 洞察 › Reports：经营报告入口。
 * 直接复用 Today 已整理好的 ROI 日报能力，让洞察页聚焦“判断”而不是再造一套报表逻辑。
 */
import type { HeadersFunction } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { useTranslation } from "react-i18next";
import { action, BusinessInsightsPage, loader } from "./app.today.insights";

export { action, loader };

export default function AppInsightsReports() {
  const { t } = useTranslation();

  return (
    <BusinessInsightsPage
      title={t("insights.reportsTitle")}
      subtitle={t("insights.reportsSubtitle")}
      backLabel={t("insights.backToToday")}
      fallbackPath="/app/today"
    />
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
