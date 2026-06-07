import type { LoaderFunctionArgs } from "react-router";
import { redirect, Form, useLoaderData } from "react-router";

import { buildEmbeddedAppPath, getAppHomePath } from "../../config/appEntry.server";
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

  const home = getAppHomePath();

  if (shop) {
    if (!url.searchParams.get("shop")) {
      url.searchParams.set("shop", shop);
    }
    const path = isBillingReturnRequest(request) ? BILLING_PAGE_PATH : home;
    throw redirect(buildEmbeddedAppPath(path, new Request(url.toString(), request)));
  }

  if (isEmbeddedAdminEntry(request)) {
    const { session } = await authenticate.admin(request);
    const targetUrl = new URL(request.url);
    if (!targetUrl.searchParams.get("shop") && session.shop) {
      targetUrl.searchParams.set("shop", session.shop);
    }
    const path = isBillingReturnRequest(request) ? BILLING_PAGE_PATH : home;
    throw redirect(buildEmbeddedAppPath(path, new Request(targetUrl.toString(), request)));
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
