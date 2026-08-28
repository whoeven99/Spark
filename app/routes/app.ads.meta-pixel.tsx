/**
 * Meta Pixel 布局：本轮停店面采集，深链统一展示下线说明。
 */
import type { HeadersFunction, LoaderFunctionArgs } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import { PixelCollectionDisabledPage } from "./page/PixelCollectionDisabledPage";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  await authenticate.admin(request);
  return null;
};

export default function AppAdsMetaPixelLayout() {
  return <PixelCollectionDisabledPage />;
}

export const headers: HeadersFunction = (headersArgs) => boundary.headers(headersArgs);
