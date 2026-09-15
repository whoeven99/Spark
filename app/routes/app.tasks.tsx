import type { LoaderFunctionArgs } from "react-router";
import { redirect } from "react-router";
import { buildEmbeddedAppPath } from "../config/appEntry.server";

/** 旧任务 v1：带 query 一并落到任务页。 */
export const loader = async ({ request }: LoaderFunctionArgs) => {
  throw redirect(buildEmbeddedAppPath("/app/tasks-v2", request));
};
