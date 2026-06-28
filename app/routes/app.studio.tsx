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
  const activeTab = resolveTab(location.pathname);

  const items = [
    { key: "copy" as const, label: t("nav.productImprove") },
    { key: "image" as const, label: t("nav.imageStudio") },
    { key: "translate" as const, label: t("nav.translationV4") },
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
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
