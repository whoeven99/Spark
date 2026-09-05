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
import { HomeV2SsrFallback } from "./page/workspace/HomeV2SsrFallback";

const importWorkspaceAppShell = () => import("./page/workspace/WorkspaceAppShellPage");

const WorkspaceAppShellPage = lazy(() =>
  importWorkspaceAppShell().then((m) => ({ default: m.WorkspaceAppShellPage })),
);

// 工作台壳只在 ClientMount 挂载后才渲染，lazy 的下载会串在 hydrate 之后。
// 这里在客户端模块求值时就并行拉 chunk，等 mount 时通常已就绪；SSR 端不执行，
// 以保留 ClientMount 对该模块的隔离。
if (typeof window !== "undefined") {
  void importWorkspaceAppShell();
}

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);

  if (isBillingReturnRequest(request)) {
    throw redirect(buildEmbeddedAppPath(BILLING_PAGE_PATH, request));
  }

  const conversations = await listConversations(session.shop);

  // 首页渲染的是 HomeV2Panel，不消费诊断快照；这里只借首屏预热当日快照供 Today /
  // Health Monitor 复用。快照未命中时会跑一轮全量诊断，必须 fire-and-forget，
  // 否则会把秒级耗时压在 SSR 首字节上（与 app.tsx 壳层的安装引导同一模式）。
  void ensureDailySnapshotOverview(session.shop, { shopifyAdmin: admin }).catch((error) => {
    console.error("[app._index] daily snapshot warmup failed:", error);
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
    homeRenderTimeIso: new Date().toISOString(),
    conversationTimeZone: resolveConversationDisplayTimeZone(request.headers),
  };
};

/**
 * 工作台壳仍依赖浏览器偏好（侧栏折叠 / 置顶会话），暂不整页 SSR。
 * 首帧用 HomeV2SsrFallback 把问候语写进 HTML，避免 LCP 卡在 "Loading…"。
 */
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

/** 应用首页：原 home-v2 落地（问候 + 本页提问，发送后进 ChatPanel）。 */
export default function Index() {
  const data = useLoaderData<typeof loader>();
  useFeatureView("home-v2");

  const firstPaint = (
    <HomeV2SsrFallback
      displayName={data?.accountName ?? ""}
      homeRenderTimeIso={data?.homeRenderTimeIso}
    />
  );

  return (
    <ClientMount fallback={firstPaint}>
      <TitleBar title="Spark AI" />
      <Suspense fallback={firstPaint}>
        <WorkspaceAppShellPage
          initialConversationList={data?.conversations ?? []}
          accountName={data?.accountName}
          defaultPanel="home"
          homeVariant="v2"
          homeRenderTimeIso={data?.homeRenderTimeIso}
          conversationTimeZone={data?.conversationTimeZone}
        />
      </Suspense>
    </ClientMount>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
