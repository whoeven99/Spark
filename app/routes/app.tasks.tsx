import type { HeadersFunction, LoaderFunctionArgs } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import { useFeatureView } from "../lib/featureTrack";
import { UnifiedTaskListPage } from "./component/unifiedTaskList/UnifiedTaskListPage";
import { mobilePageContentStyle, pageContentStyle } from "./page/pageUiStyles";
import { useResponsiveLayout } from "../hooks/useResponsiveLayout";
import { DestinationPage } from "./component/shared/DestinationPage";
import { useTranslation } from "react-i18next";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  await authenticate.admin(request);
  return null;
};

export default function AppTasks() {
  const { t } = useTranslation();
  const { isMobile } = useResponsiveLayout();
  useFeatureView("tasks");
  return (
    <div style={isMobile ? mobilePageContentStyle : pageContentStyle}>
      <DestinationPage
        title="任务中心"
        subtitle="统一查看并处理经营任务、文案、图片与批处理任务。"
        titleBarTitle={t("nav.tasks")}
        backLabel="返回首页"
        fallbackPath="/app"
        isMobile={isMobile}
      >
      <UnifiedTaskListPage
        locationSearch={typeof window !== "undefined" ? window.location.search : ""}
      />
      </DestinationPage>
    </div>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
