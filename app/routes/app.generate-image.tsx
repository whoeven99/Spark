import type { LoaderFunctionArgs } from "react-router";
import { redirect } from "react-router";
import { buildEmbeddedAppPath } from "../config/appEntry.server";
import { authenticate } from "../shopify.server";

/** 兼容旧链接：合并至图片工作室 */
export const loader = async ({ request }: LoaderFunctionArgs) => {
  await authenticate.admin(request);
  return redirect(buildEmbeddedAppPath("/app/image-studio?tab=generate", request));
};

export default function AppGenerateImageRedirect() {
  return null;
}
