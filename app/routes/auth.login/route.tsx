import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { redirect } from "react-router";

import { login } from "../../shopify.server";
import { loginErrorMessage } from "./error.server";

function shopFromQuery(request: Request): string | null {
  const shop = new URL(request.url).searchParams.get("shop")?.trim();
  return shop || null;
}

/** 仅接受 URL 上的 `?shop=`（Shopify 发起的安装）。手填域名表单会违反 App Store 2.3.1。 */
async function startShopifyLoginOrRedirectHome(request: Request) {
  if (!shopFromQuery(request)) {
    throw redirect("/");
  }

  const errors = loginErrorMessage(await login(request));
  if (errors.shop) {
    throw redirect("/");
  }

  return { errors };
}

export const loader = async ({ request }: LoaderFunctionArgs) => {
  return startShopifyLoginOrRedirectHome(request);
};

export const action = async ({ request }: ActionFunctionArgs) => {
  return startShopifyLoginOrRedirectHome(request);
};

export default function Auth() {
  return null;
}
