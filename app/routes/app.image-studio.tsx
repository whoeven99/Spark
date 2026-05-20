import type { HeadersFunction, LoaderFunctionArgs } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { loadImageStudioPageData } from "../server/visualTools/imageStudioPageLoader.server";
import { authenticate } from "../shopify.server";
import { ImageStudioPage } from "./page/ImageStudioPage";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  return loadImageStudioPageData(session.shop);
};

export default function AppImageStudio() {
  return <ImageStudioPage />;
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
