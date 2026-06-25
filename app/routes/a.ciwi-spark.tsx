import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import {
  braceletProxyPageLoader,
  braceletProxyPrepareAction,
} from "../server/bracelet/braceletProxyHandlers.server";

/** App Proxy（店铺已配置）: GET /a/ciwi-spark */
export const loader = async ({ request }: LoaderFunctionArgs) =>
  braceletProxyPageLoader(request, "/a/ciwi-spark/prepare");
