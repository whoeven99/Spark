import type {
  ActionFunctionArgs,
  HeadersFunction,
  LoaderFunctionArgs,
} from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import {
  BillingError,
  cancelActiveSubscription,
  loadBillingPageData,
  reconcilePendingSubscriptions,
  reconcilePendingTokenPackPurchases,
  startSubscriptionCheckout,
  startTokenPackCheckout,
} from "../server/billing/index.server";
import { BILLING_RETURN_QUERY_FLAG } from "../server/billing/buildBillingReturnUrl.server";
import {
  BILLING_PAGE_PATH,
} from "../server/billing/buildBillingReturnUrl.server";
import { BillingPage } from "./page/BillingPage";
import { useFeatureView } from "../lib/featureTrack";
import { recordFeatureTrack } from "../server/aliyunLog/featureTrack.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session, admin } = await authenticate.admin(request);
  const url = new URL(request.url);
  const chargeId =
    url.searchParams.get(BILLING_RETURN_QUERY_FLAG) === "1"
      ? url.searchParams.get("charge_id")
      : null;

  await reconcilePendingTokenPackPurchases({
    shop: session.shop,
    admin,
    chargeId,
  });
  await reconcilePendingSubscriptions({
    shop: session.shop,
    admin,
  });

  return loadBillingPageData(session.shop);
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { admin, session, redirect: shopifyRedirect } =
    await authenticate.admin(request);
  const form = await request.formData();
  const intent = form.get("intent")?.toString();
  const planKey = form.get("planKey")?.toString();
  const trialMode = form.get("trialMode")?.toString();

  if (!intent) {
    return { ok: false as const, error: "缺少 intent" };
  }

  // 计费操作走 React Router 原生表单提交，前端无 JS 入口，故在服务端埋点（fire-and-forget）。
  void recordFeatureTrack({
    shop: session.shop,
    feature: "billing",
    action: intent,
    path: BILLING_PAGE_PATH,
    extra: planKey ? { planKey } : undefined,
  });

  try {
    if (intent === "cancel_subscription") {
      await cancelActiveSubscription({
        admin,
        shop: session.shop,
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
  useFeatureView("billing");
  return <BillingPage />;
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
