import type { LoaderFunctionArgs } from "react-router";
import { redirect } from "react-router";
import { authenticate } from "../shopify.server";
import { buildEmbeddedAppPath } from "../config/appEntry.server";

/** 整店翻译已迁移至 TSF，旧路由重定向到文案页。 */
export const loader = async ({ request }: LoaderFunctionArgs) => {
  await authenticate.admin(request);
  throw redirect(buildEmbeddedAppPath("/app/studio/copy", request));
};

export default function AppStudioTranslateRedirect() {
  return null;
}
