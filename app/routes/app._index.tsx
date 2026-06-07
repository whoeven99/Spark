import type { HeadersFunction, LoaderFunctionArgs } from "react-router";
import { redirect } from "react-router";
import { useEffect, useState, type ReactNode } from "react";
import {
  buildEmbeddedAppPath,
  getAppEntryConfig,
} from "../config/appEntry.server";
import {
  BILLING_PAGE_PATH,
  isBillingReturnRequest,
} from "../server/billing/buildBillingReturnUrl.server";
import { authenticate } from "../shopify.server";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { WorkspacePage } from "./page/WorkspacePage";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  await authenticate.admin(request);

  const { home } = getAppEntryConfig();
  const targetPath = isBillingReturnRequest(request) ? BILLING_PAGE_PATH : home;
  if (targetPath !== "/app") {
    throw redirect(buildEmbeddedAppPath(targetPath, request));
  }

  return null;
};

/** 工作台页依赖浏览器环境，SSR 阶段仅输出占位，避免嵌入式 iframe 首屏 500。 */
function ClientMount({ children }: { children: ReactNode }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted) {
    return (
      <div style={{ padding: "1.25rem", color: "#6d7175", fontSize: "0.9rem" }}>
        Loading…
      </div>
    );
  }
  return children;
}

export default function Index() {
  return (
    <ClientMount>
      <WorkspacePage />
    </ClientMount>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
