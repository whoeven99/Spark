import type { HeadersFunction, LoaderFunctionArgs } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import { useFeatureView } from "../lib/featureTrack";
import { UnifiedTaskListPage } from "./component/unifiedTaskList/UnifiedTaskListPage";
import {
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
      <UnifiedTaskListPage
        locationSearch={typeof window !== "undefined" ? window.location.search : ""}
      />
    </div>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
