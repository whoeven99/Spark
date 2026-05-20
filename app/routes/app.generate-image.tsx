import type { HeadersFunction, LoaderFunctionArgs } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { loadGenerateImagePageData } from "../server/imageGeneration/imageGenerationPageLoader.server";
import { authenticate } from "../shopify.server";
import { GenerateImagePage } from "./page/GenerateImagePage";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  return loadGenerateImagePageData(session.shop);
};

export default function AppGenerateImage() {
  return <GenerateImagePage />;
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
