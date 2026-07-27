import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import {
  getFacebookCatalogCredential,
  getGoogleMerchantCredential,
  maskTokenTail,
  setFacebookCatalogCredential,
  setGoogleMerchantCredential,
} from "../server/adsCatalog/credentialStore.server";
import { verifyFacebookCatalogCredential } from "../server/adsCatalog/clients/facebookGraphClient.server";
import {
  refreshGoogleAccessToken,
  verifyGoogleMerchantCredential,
} from "../server/adsCatalog/clients/googleMerchantClient.server";

type Platform = "facebook" | "google";

interface CredentialView {
  configured: boolean;
  updatedAt: string | null;
  fields: Record<string, string>;
}

async function buildView(shop: string): Promise<{
  facebook: CredentialView;
  google: CredentialView;
}> {
  const [fb, gg] = await Promise.all([
    getFacebookCatalogCredential(shop),
    getGoogleMerchantCredential(shop),
  ]);
  return {
    facebook: {
      configured: Boolean(fb),
      updatedAt: fb?.updatedAt ?? null,
      fields: {
        accessTokenMasked: fb ? maskTokenTail(fb.accessToken) : "",
        catalogId: fb?.catalogId ?? "",
        businessId: fb?.businessId ?? "",
        apiVersion: fb?.apiVersion ?? "",
      },
    },
    google: {
      configured: Boolean(gg),
      updatedAt: gg?.updatedAt ?? null,
      fields: {
        accessTokenMasked: gg ? maskTokenTail(gg.accessToken) : "",
        refreshTokenMasked: gg?.refreshToken ? maskTokenTail(gg.refreshToken) : "",
        clientIdMasked: gg?.clientId ? maskTokenTail(gg.clientId) : "",
        clientSecretMasked: gg?.clientSecret ? maskTokenTail(gg.clientSecret) : "",
        merchantId: gg?.merchantId ?? "",
      },
    },
  };
}

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  return Response.json(await buildView(session.shop));
};

export const action = async ({ request }: ActionFunctionArgs) => {
  if (request.method !== "POST") {
    return Response.json({ ok: false, error: "Method not allowed" }, { status: 405 });
  }

  const { session } = await authenticate.admin(request);

  const body = (await request.json().catch(() => ({}))) as {
    platform?: Platform;
    verify?: boolean;
    facebook?: {
      accessToken?: string;
      catalogId?: string;
      businessId?: string;
      apiVersion?: string;
    };
    google?: {
      accessToken?: string;
      refreshToken?: string;
      clientId?: string;
      clientSecret?: string;
      merchantId?: string;
    };
  };

  const platform = body.platform;
  if (platform !== "facebook" && platform !== "google") {
    return Response.json({ ok: false, error: "Unknown platform" }, { status: 400 });
  }

  try {
    if (platform === "facebook") {
      const incoming = body.facebook ?? {};
      const current = await getFacebookCatalogCredential(session.shop);
      const accessToken =
        (incoming.accessToken && !incoming.accessToken.includes("***")
          ? incoming.accessToken
          : current?.accessToken) ?? "";
      const catalogId = (incoming.catalogId ?? current?.catalogId ?? "").trim();
      const businessId = incoming.businessId ?? current?.businessId;
      const apiVersion = incoming.apiVersion ?? current?.apiVersion;

      if (!accessToken || !catalogId) {
        return Response.json(
          { ok: false, error: "Facebook accessToken and catalogId are required." },
          { status: 400 },
        );
      }

      if (body.verify) {
        const probe = await verifyFacebookCatalogCredential({
          accessToken,
          catalogId,
          apiVersion,
        });
        if (!probe.ok) {
          return Response.json(
            { ok: false, error: `Facebook verification failed: ${probe.reason}` },
            { status: 400 },
          );
        }
      }

      await setFacebookCatalogCredential(session.shop, {
        accessToken,
        catalogId,
        businessId,
        apiVersion,
      });
    } else {
      const incoming = body.google ?? {};
      const current = await getGoogleMerchantCredential(session.shop);
      let accessToken =
        (incoming.accessToken && !incoming.accessToken.includes("***")
          ? incoming.accessToken
          : current?.accessToken) ?? "";
      const refreshToken =
        (incoming.refreshToken && !incoming.refreshToken.includes("***")
          ? incoming.refreshToken
          : current?.refreshToken) ?? undefined;
      const clientId =
        (incoming.clientId && !incoming.clientId.includes("***")
          ? incoming.clientId
          : current?.clientId) ?? undefined;
      const clientSecret =
        (incoming.clientSecret && !incoming.clientSecret.includes("***")
          ? incoming.clientSecret
          : current?.clientSecret) ?? undefined;
      const merchantId = (incoming.merchantId ?? current?.merchantId ?? "").trim();

      if (!accessToken || !merchantId) {
        return Response.json(
          { ok: false, error: "Google accessToken and merchantId are required." },
          { status: 400 },
        );
      }

      let verifyAccessToken = accessToken;
      if (
        body.verify &&
        refreshToken &&
        clientId &&
        clientSecret
      ) {
        const refreshed = await refreshGoogleAccessToken({
          clientId,
          clientSecret,
          refreshToken,
        });
        if (refreshed) {
          verifyAccessToken = refreshed.accessToken;
          accessToken = refreshed.accessToken;
        }
      }

      if (body.verify) {
        const probe = await verifyGoogleMerchantCredential({
          accessToken: verifyAccessToken,
          merchantId,
        });
        if (!probe.ok) {
          return Response.json(
            { ok: false, error: `Google verification failed: ${probe.reason}` },
            { status: 400 },
          );
        }
      }

      await setGoogleMerchantCredential(session.shop, {
        accessToken,
        refreshToken,
        clientId,
        clientSecret,
        merchantId,
      });
    }
  } catch (e) {
    return Response.json(
      { ok: false, error: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    );
  }

  return Response.json({ ok: true, ...(await buildView(session.shop)) });
};
