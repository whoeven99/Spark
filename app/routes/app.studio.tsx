/**
 * 创作目的地：商品文案 / 图片工具。
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

type StudioTab = "copy" | "image";

function resolveTab(pathname: string): StudioTab {
  if (pathname.includes("/studio/image")) return "image";
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
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
      <SegmentedPageTabs
        activeTab={activeTab}
        items={items}
        ariaLabel={t("nav.studio")}
        density="compact"
        onTabChange={(tab) => navigate(`/app/studio/${tab}${location.search}`)}
      />
      <Outlet />
    </div>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
