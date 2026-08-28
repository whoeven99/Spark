import { useEffect, useState } from "react";
import type { LoaderFunctionArgs } from "react-router";
import { redirect, useLoaderData } from "react-router";
import { useTranslation } from "react-i18next";

import { buildEmbeddedAppPath, getAppHomePath } from "../../config/appEntry.server";
import {
  BILLING_PAGE_PATH,
  isBillingReturnRequest,
} from "../../server/billing/buildBillingReturnUrl.server";
import {
  buildEmbeddedHomeRecoveryPath,
  isEmbeddedAdminEntry,
  resolveShopQueryFromRequest,
  shouldRecoverEmbeddedHome,
} from "../../server/shopify/embeddedEntry.server";
import { authenticate } from "../../shopify.server";
import { buildEmbeddedHomeRedirectPath } from "../../lib/embeddedLocationSearch";
import { AppI18nProvider } from "../../i18n/provider";
import { detectRequestLocale } from "../../i18n/detector.server";

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

  if (shouldRecoverEmbeddedHome(request)) {
    throw redirect(buildEmbeddedHomeRecoveryPath(home, request));
  }

  return { home, locale: detectRequestLocale(request) };
};

function InstallLanding() {
  const { t } = useTranslation();

  return (
    <div className={styles.index}>
      <div className={styles.content}>
        <h1 className={styles.heading}>{t("installLanding.heading")}</h1>
        <p className={styles.text}>{t("installLanding.tagline")}</p>
        <p className={styles.hint}>{t("installLanding.installHint")}</p>
        <ul className={styles.list}>
          <li>
            <strong>{t("installLanding.features.operations.title")}</strong>.{" "}
            {t("installLanding.features.operations.body")}
          </li>
          <li>
            <strong>{t("installLanding.features.studio.title")}</strong>.{" "}
            {t("installLanding.features.studio.body")}
          </li>
          <li>
            <strong>{t("installLanding.features.ads.title")}</strong>.{" "}
            {t("installLanding.features.ads.body")}
          </li>
        </ul>
      </div>
    </div>
  );
}

export default function App() {
  const { home, locale } = useLoaderData<typeof loader>();
  const [iframeRecovering, setIframeRecovering] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined" || window.parent === window) return;
    setIframeRecovering(true);
    window.location.replace(buildEmbeddedHomeRedirectPath(home, window.location.search));
  }, [home]);

  if (iframeRecovering) {
    return null;
  }

  return (
    <AppI18nProvider locale={locale}>
      <InstallLanding />
    </AppI18nProvider>
  );
}
