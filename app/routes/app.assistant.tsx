import type { HeadersFunction, LoaderFunctionArgs } from "react-router";
import { redirect, useLoaderData } from "react-router";
import { lazy, Suspense, useEffect, useState, type ReactNode } from "react";
import { TitleBar } from "@shopify/app-bridge-react";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { buildEmbeddedAppPath } from "../config/appEntry.server";
import { useFeatureView } from "../lib/featureTrack";
import {
  BILLING_PAGE_PATH,
  isBillingReturnRequest,
} from "../server/billing/buildBillingReturnUrl.server";
import { listConversations } from "../server/conversation/conversationStore.server";
import { ensureDailySnapshotOverview } from "../server/operations/dailyInspection.server";
import { authenticate } from "../shopify.server";
import { resolveConversationDisplayTimeZone } from "../lib/viewerCountry";
import { WorkspaceShellSsrFallback } from "./page/workspace/WorkspaceShellSsrFallback";

const importWorkspaceAppShell = () => import("./page/workspace/WorkspaceAppShellPage");

const WorkspaceAppShellPage = lazy(() =>
  importWorkspaceAppShell().then((m) => ({ default: m.WorkspaceAppShellPage })),
);

// 与首页一致：ClientMount 之后才挂壳，模块求值时并行预取 chunk。
if (typeof window !== "undefined") {
  void importWorkspaceAppShell();
}

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);

  if (isBillingReturnRequest(request)) {
    throw redirect(buildEmbeddedAppPath(BILLING_PAGE_PATH, request));
  }

  const conversations = await listConversations(session.shop);

  // 助手默认进 chat 面板（homeVariant=v2），不消费 dashboardSnapshot；诊断快照只做预热。
  void ensureDailySnapshotOverview(session.shop, { shopifyAdmin: admin }).catch((error) => {
    console.error("[app.assistant] daily snapshot warmup failed:", error);
  });

  const associatedUser = (
    session as {
      onlineAccessInfo?: {
        associated_user?: { first_name?: string | null; last_name?: string | null } | null;
      } | null;
    }
  ).onlineAccessInfo?.associated_user;
  const accountName =
    [associatedUser?.first_name, associatedUser?.last_name]
      .filter(Boolean)
      .join(" ")
      .trim() || session.shop.replace(/\.myshopify\.com$/i, "");

  return {
    conversations,
    accountName,
    conversationTimeZone: resolveConversationDisplayTimeZone(request.headers),
  };
};

function ClientMount({
  fallback,
  children,
}: {
  fallback: ReactNode;
  children: ReactNode;
}) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted) {
    return fallback;
  }
  return children;
}

export default function AssistantRoute() {
  const data = useLoaderData<typeof loader>();
  useFeatureView("chat");

  const firstPaint = <WorkspaceShellSsrFallback />;

  return (
    <ClientMount fallback={firstPaint}>
      <TitleBar title="Spark AI" />
      <Suspense fallback={firstPaint}>
        <WorkspaceAppShellPage
          initialConversationList={data?.conversations ?? []}
          accountName={data?.accountName}
          defaultPanel="chat"
          homeVariant="v2"
          autoCreateConversation
          conversationTimeZone={data?.conversationTimeZone}
        />
      </Suspense>
    </ClientMount>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
