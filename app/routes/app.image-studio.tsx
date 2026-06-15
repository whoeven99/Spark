import type { HeadersFunction, LoaderFunctionArgs } from "react-router";
import { lazy, Suspense } from "react";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { loadImageStudioPageData } from "../server/visualTools/imageStudioPageLoader.server";
import { authenticate } from "../shopify.server";
import { useFeatureView } from "../lib/featureTrack";
import { RoutePageFallback } from "./component/RoutePageFallback";

const ImageStudioPage = lazy(() =>
  import("./page/ImageStudioPage").then((m) => ({ default: m.ImageStudioPage })),
);

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  return loadImageStudioPageData(session.shop);
};

export default function AppImageStudio() {
  useFeatureView("image-studio");
  return (
    <Suspense fallback={<RoutePageFallback />}>
      <ImageStudioPage />
    </Suspense>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
