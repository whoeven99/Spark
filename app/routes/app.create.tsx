import type { HeadersFunction, LoaderFunctionArgs } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import {
  getEstimatedCredits,
  getEstimatedSeconds,
} from "../server/aiTask/aiTaskEstimation.server";
import { CreatePage } from "./page/CreatePage";

/** 二次确认弹窗要展示的执行前预估（per-item EWMA）。 */
export type CreateEstimation = {
  seconds: number | null;
  credits: number;
};

async function loadEstimation(
  taskKey: "product_improve" | "image_generation" | "picture_translate",
): Promise<CreateEstimation> {
  const [seconds, credits] = await Promise.all([
    getEstimatedSeconds(taskKey),
    getEstimatedCredits(taskKey),
  ]);
  return { seconds, credits };
}

export const loader = async ({ request }: LoaderFunctionArgs) => {
  await authenticate.admin(request);

  const [productImprove, imageGeneration, pictureTranslate] = await Promise.all([
    loadEstimation("product_improve"),
    loadEstimation("image_generation"),
    loadEstimation("picture_translate"),
  ]);

  return {
    estimations: { productImprove, imageGeneration, pictureTranslate },
  };
};

export default function AppCreate() {
  return <CreatePage />;
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
