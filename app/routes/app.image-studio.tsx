import type { HeadersFunction, LoaderFunctionArgs } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { loadImageStudioPageData } from "../server/visualTools/imageStudioPageLoader.server";
import { authenticate } from "../shopify.server";
import { ImageStudioPage } from "./page/ImageStudioPage";
import { useFeatureView } from "../lib/featureTrack";

function resolveImageSwitcherAppEmbedId(): string | null {
  const explicit = process.env.IMAGE_SWITCHER_APP_EMBED_ID?.trim();
  if (explicit) return explicit;
  // shopify app dev 会注入 SHOPIFY_API_KEY，切换 toml 时无需再手动配 IMAGE_SWITCHER_APP_EMBED_ID
  return process.env.SHOPIFY_API_KEY?.trim() || null;
}

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  return loadImageStudioPageData(session.shop, resolveImageSwitcherAppEmbedId());
};

export default function AppImageStudio() {
  useFeatureView("image-studio");
  return <ImageStudioPage />;
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
