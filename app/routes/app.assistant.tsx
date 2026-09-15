import type { LoaderFunctionArgs } from "react-router";
import { redirect } from "react-router";
import { buildEmbeddedAppPath } from "../config/appEntry.server";

/** 旧助手入口：带 query 一并落到首页对话。 */
export const loader = async ({ request }: LoaderFunctionArgs) => {
  throw redirect(buildEmbeddedAppPath("/app", request));
};
