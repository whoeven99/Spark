import type { LoaderFunctionArgs } from "react-router";
import { redirect, Form, useLoaderData } from "react-router";

import { buildEmbeddedAppPath, getAppEntry, getAppEntryConfig } from "../../config/appEntry.server";
import {
  BILLING_PAGE_PATH,
  isBillingReturnRequest,
} from "../../server/billing/buildBillingReturnUrl.server";
import {
  isEmbeddedAdminEntry,
  resolveShopQueryFromRequest,
} from "../../server/shopify/embeddedEntry.server";
import { login, authenticate } from "../../shopify.server";

import styles from "./styles.module.css";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const url = new URL(request.url);
  const shop = resolveShopQueryFromRequest(request);

  if (shop) {
    if (!url.searchParams.get("shop")) {
      url.searchParams.set("shop", shop);
    }
    const { home } = getAppEntryConfig();
    const path = isBillingReturnRequest(request) ? BILLING_PAGE_PATH : home;
    throw redirect(buildEmbeddedAppPath(path, new Request(url.toString(), request)));
  }

  if (isEmbeddedAdminEntry(request)) {
    // 尝试让 Shopify 库通过 session token 等方式认证
    const { session } = await authenticate.admin(request);
    const targetUrl = new URL(request.url);
    if (!targetUrl.searchParams.get("shop") && session.shop) {
      targetUrl.searchParams.set("shop", session.shop);
    }
    const { home } = getAppEntryConfig();
    const path = isBillingReturnRequest(request) ? BILLING_PAGE_PATH : home;
    throw redirect(buildEmbeddedAppPath(path, new Request(targetUrl.toString(), request)));
  }

<<<<<<< HEAD
=======
  // 卫星 App：用户在 Shopify Admin 侧边栏点击时本应直接命中 /app/xxx 路径，
  // 但若 application_url 配错或 OAuth bounce 导致落在根路径 / 上，不应展示登录表单，
  // 而是直接重定向到 App 首页（让 Shopify 库触发 OAuth 流程）。
>>>>>>> 163b34395cf92c415a9c96f0e1e6f77cfb2e14f1
  const appEntry = getAppEntry();
  if (appEntry !== "chat") {
    const { home } = getAppEntryConfig();
    throw redirect(buildEmbeddedAppPath(home, request));
  }

  return { showForm: Boolean(login) };
};

export default function App() {
  const { showForm } = useLoaderData<typeof loader>();

  return (
    <div className={styles.index}>
      <div className={styles.content}>
        <h1 className={styles.heading}>A short heading about [your app]</h1>
        <p className={styles.text}>
          A tagline about [your app] that describes your value proposition.
        </p>
        {showForm && (
          <Form className={styles.form} method="post" action="/auth/login">
            <label className={styles.label}>
              <span>Shop domain</span>
              <input className={styles.input} type="text" name="shop" />
              <span>e.g: my-shop-domain.myshopify.com</span>
            </label>
            <button className={styles.button} type="submit">
              Log in
            </button>
          </Form>
        )}
        <ul className={styles.list}>
          <li>
            <strong>Product feature</strong>. Some detail about your feature and
            its benefit to your customer.
          </li>
          <li>
            <strong>Product feature</strong>. Some detail about your feature and
            its benefit to your customer.
          </li>
          <li>
            <strong>Product feature</strong>. Some detail about your feature and
            its benefit to your customer.
          </li>
        </ul>
      </div>
    </div>
  );
}
