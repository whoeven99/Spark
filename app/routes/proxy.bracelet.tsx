import type { LoaderFunctionArgs } from "react-router";
import { braceletProxyPageLoader } from "../server/bracelet/braceletProxyHandlers.server";

/** App Proxy（备用路径）: GET /proxy/bracelet */
export const loader = async ({ request }: LoaderFunctionArgs) =>
  braceletProxyPageLoader(request, "/apps/spark-bracelet/prepare");
