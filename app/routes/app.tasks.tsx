import type { HeadersFunction, LoaderFunctionArgs } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import { useFeatureView } from "../lib/featureTrack";
import { UnifiedTaskListPage } from "./component/unifiedTaskList/UnifiedTaskListPage";
import {
  PageHeaderNav,
  mobilePageContentStyle,
  pageContentStyle,
} from "./page/pageUiStyles";
import { useResponsiveLayout } from "../hooks/useResponsiveLayout";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  await authenticate.admin(request);
  return null;
};

export default function AppTasks() {
  const { isMobile } = useResponsiveLayout();
  useFeatureView("tasks");
  return (
    <div style={isMobile ? mobilePageContentStyle : pageContentStyle}>
      <PageHeaderNav
        title="任务中心"
        subtitle="所有后台任务统一进入这里：文案、图片、翻译、批处理和后续审核结果都按状态归档。"
        backLabel="返回首页"
        fallbackPath="/app"
      />
      <UnifiedTaskListPage
        locationSearch={typeof window !== "undefined" ? window.location.search : ""}
      />
    </div>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
