/**
 * 创作目的地：商品文案 / 图片工具。
 */
import type { HeadersFunction, LoaderFunctionArgs } from "react-router";
import { Outlet, useLocation, useNavigate } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { useTranslation } from "react-i18next";
import { authenticate } from "../shopify.server";
import { SegmentedPageTabs } from "./component/shared/SegmentedPageTabs";
import { useResponsiveLayout } from "../hooks/useResponsiveLayout";
import { DestinationPage } from "./component/shared/DestinationPage";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  await authenticate.admin(request);
  return null;
};

type StudioTab = "copy" | "image";

function resolveTab(pathname: string): StudioTab {
  if (pathname.includes("/studio/image")) return "image";
  return "copy";
}

export default function AppStudio() {
  const { t } = useTranslation();
  const location = useLocation();
  const navigate = useNavigate();
  const { isMobile } = useResponsiveLayout();
  const activeTab = resolveTab(location.pathname);

  const items = [
    { key: "copy" as const, label: t("nav.productImprove") },
    { key: "image" as const, label: t("nav.imageStudio") },
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
      <DestinationPage
        title="创作"
        subtitle="商品文案与图片素材集中处理，经营分析和订单风险保持在经营页。"
        backLabel="返回首页"
        fallbackPath="/app"
        isMobile={isMobile}
        actions={buildStudioActions({
          activeTab,
          onOpen: (tab) => navigate(`/app/studio/${tab}${location.search}`),
        })}
      >
      <div style={{ paddingTop: "0.5rem" }}>
        <SegmentedPageTabs
          activeTab={activeTab}
          items={items}
          ariaLabel={t("nav.studio")}
          onTabChange={(tab) => navigate(`/app/studio/${tab}${location.search}`)}
        />
      </div>
      <Outlet />
      </DestinationPage>
    </div>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};

function buildStudioActions({
  activeTab,
  onOpen,
}: {
  activeTab: StudioTab;
  onOpen: (tab: StudioTab) => void;
}) {
  const cards: Array<{
    key: StudioTab;
    title: string;
    detail: string;
    meta: string;
  }> = [
    {
      key: "copy",
      title: "商品文案",
      detail: "标题、描述、SEO 与转化文案",
      meta: "审核后写回 Shopify",
    },
    {
      key: "image",
      title: "图片素材",
      detail: "文生图与整图翻译",
      meta: "适合活动图和多语言素材",
    },
  ];

  return cards.map((card) => ({
    ...card,
    active: card.key === activeTab,
    onClick: () => onOpen(card.key),
  }));
}
