/**
 * 创作目的地（PR3）：把商品文案 / 图片工具 / 整店翻译合并到一个 Studio。
 * 顶部 SegmentedTab 在三个子路由（copy / image / translate）之间切换，
 * 各子路由仍是原页面（loader/action/组件原样迁移），互不影响。
 */
import type { HeadersFunction, LoaderFunctionArgs } from "react-router";
import { Outlet, useLocation, useNavigate } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { useTranslation } from "react-i18next";
import { authenticate } from "../shopify.server";
import { SegmentedPageTabs } from "./component/shared/SegmentedPageTabs";
import { useResponsiveLayout } from "../hooks/useResponsiveLayout";
import { PageHeaderNav, pageColorTokens } from "./page/pageUiStyles";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  await authenticate.admin(request);
  return null;
};

type StudioTab = "copy" | "image" | "translate";

function resolveTab(pathname: string): StudioTab {
  if (pathname.includes("/studio/image")) return "image";
  if (pathname.includes("/studio/translate")) return "translate";
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
    { key: "translate" as const, label: t("nav.translationV4") },
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
      <PageHeaderNav
        title="创作"
        subtitle="商品文案、图片素材与多语言内容集中处理，经营分析和订单风险保持在经营页。"
        backLabel="返回首页"
        fallbackPath="/app"
      />
      <StudioQuickSwitch
        activeTab={activeTab}
        isMobile={isMobile}
        onOpen={(tab) => navigate(`/app/studio/${tab}${location.search}`)}
      />
      <div style={{ paddingTop: "0.5rem" }}>
        <SegmentedPageTabs
          activeTab={activeTab}
          items={items}
          ariaLabel={t("nav.studio")}
          onTabChange={(tab) => navigate(`/app/studio/${tab}${location.search}`)}
        />
      </div>
      <Outlet />
    </div>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};

function StudioQuickSwitch({
  activeTab,
  isMobile,
  onOpen,
}: {
  activeTab: StudioTab;
  isMobile: boolean;
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
    {
      key: "translate",
      title: "整店翻译",
      detail: "商品、页面、菜单、主题内容",
      meta: "支持术语表和 V4 任务",
    },
  ];

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: isMobile ? "1fr" : "repeat(3, minmax(0, 1fr))",
        gap: "0.75rem",
      }}
    >
      {cards.map((card) => {
        const active = card.key === activeTab;
        return (
          <button
            key={card.key}
            type="button"
            onClick={() => onOpen(card.key)}
            style={{
              textAlign: "left",
              border: `1px solid ${active ? pageColorTokens.brandGreen : pageColorTokens.border}`,
              borderRadius: pageColorTokens.radiusCard,
              background: active ? pageColorTokens.brandGreenLight : pageColorTokens.surface,
              padding: "0.95rem 1rem",
              boxShadow: pageColorTokens.shadowCard,
              cursor: "pointer",
              display: "grid",
              gap: "0.3rem",
              fontFamily: "inherit",
            }}
          >
            <span style={{ fontSize: 14, fontWeight: 750, color: pageColorTokens.textPrimary }}>
              {card.title}
            </span>
            <span style={{ fontSize: 12, color: pageColorTokens.textBody, lineHeight: 1.45 }}>
              {card.detail}
            </span>
            <span style={{ fontSize: 11, color: pageColorTokens.textSecondary }}>
              {card.meta}
            </span>
          </button>
        );
      })}
    </div>
  );
}
