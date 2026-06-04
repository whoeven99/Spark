import type {
  ActionFunctionArgs,
  HeadersFunction,
  LoaderFunctionArgs,
} from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { getAppEntry } from "../config/appEntry.server";
import { authenticate } from "../shopify.server";
import {
  BillingError,
  cancelActiveSubscription,
  loadBillingPageData,
  startSubscriptionCheckout,
  startTokenPackCheckout,
} from "../server/billing/index.server";
import { BillingPage } from "./page/BillingPage";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const appName = getAppEntry();
  return loadBillingPageData(session.shop, appName);
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { admin, session, redirect: shopifyRedirect } =
    await authenticate.admin(request);
  const appName = getAppEntry();
  const form = await request.formData();
  const intent = form.get("intent")?.toString();
  const planKey = form.get("planKey")?.toString();
  const trialMode = form.get("trialMode")?.toString();

  if (!intent) {
    return { ok: false as const, error: "缺少 intent" };
  }

  try {
    if (intent === "cancel_subscription") {
      await cancelActiveSubscription({
        admin,
        shop: session.shop,
        appName,
      });
      return { ok: true as const, cancelled: true as const };
    }

    if (!planKey) {
      return { ok: false as const, error: "缺少 planKey" };
    }

    if (intent === "subscribe") {
      const { confirmationUrl } = await startSubscriptionCheckout({
        admin,
        shop: session.shop,
        appName,
        planKey,
        request,
        trialDays: trialMode === "paid" ? null : undefined,
      });
      if (confirmationUrl) {
        throw shopifyRedirect(confirmationUrl, { target: "_top" });
      }
      return { ok: true as const, noopCheckout: true as const };
    }
    if (intent === "buy_pack") {
      const { confirmationUrl } = await startTokenPackCheckout({
        admin,
        shop: session.shop,
        appName,
        planKey,
        request,
      });
      if (confirmationUrl) {
        throw shopifyRedirect(confirmationUrl, { target: "_top" });
      }
      return { ok: true as const, noopCheckout: true as const };
    }
    return { ok: false as const, error: "未知操作" };
  } catch (error) {
    // authenticate.admin 的 redirect() 抛出 Response（302），须继续向上抛以完成结账跳转
    if (error instanceof Response) {
      throw error;
    }
    const message =
      error instanceof BillingError
        ? error.message
        : error instanceof Error
          ? error.message
          : "计费操作失败";
    return { ok: false as const, error: message };
  }
};

export default function AppBilling() {
  return <BillingPage />;
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
