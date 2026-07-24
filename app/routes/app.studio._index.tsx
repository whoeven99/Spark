import type { LoaderFunctionArgs } from "react-router";
import { redirect } from "react-router";
import { authenticate } from "../shopify.server";
import { buildEmbeddedAppPath } from "../config/appEntry.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  await authenticate.admin(request);
  throw redirect(buildEmbeddedAppPath("/app/studio/copy", request));
};
