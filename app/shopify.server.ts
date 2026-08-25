import "@shopify/shopify-app-react-router/adapters/node";
import type { PrismaClient } from "@prisma/client";
import { redirect } from "react-router";
import {
  ApiVersion,
  AppDistribution,
  shopifyApp,
} from "@shopify/shopify-app-react-router/server";
import { PrismaSessionStorage } from "@shopify/shopify-app-session-storage-prisma";
import prisma from "./db.server";
import {
  buildEmbeddedHomeRecoveryPath,
  isEmbeddedAdminEntry,
  shouldRecoverEmbeddedHome,
} from "./server/shopify/embeddedEntry.server";

const shopify = shopifyApp({
  apiKey: process.env.SHOPIFY_API_KEY,
  apiSecretKey: process.env.SHOPIFY_API_SECRET || "",
  apiVersion: ApiVersion.July26,
  scopes: process.env.SCOPES?.split(","),
  appUrl: process.env.SHOPIFY_APP_URL || "",
  authPathPrefix: "/auth",
  sessionStorage: new PrismaSessionStorage(prisma as unknown as PrismaClient, {
    tableName: "Session",
  }),
  distribution: AppDistribution.AppStore,
  future: {
    expiringOfflineAccessTokens: true,
  },
  ...(process.env.SHOP_CUSTOM_DOMAIN
    ? { customShopDomains: [process.env.SHOP_CUSTOM_DOMAIN] }
    : {}),
});

function recoverEmbeddedAdminRequest(request: Request): void {
  if (!isEmbeddedAdminEntry(request) && shouldRecoverEmbeddedHome(request)) {
    throw redirect(
      buildEmbeddedHomeRecoveryPath(new URL(request.url).pathname, request),
    );
  }
}

export default shopify;
export const apiVersion = ApiVersion.July26;
export const addDocumentResponseHeaders = shopify.addDocumentResponseHeaders;
export const authenticate = {
  ...shopify.authenticate,
  admin: ((request: Request, options?: unknown) => {
    recoverEmbeddedAdminRequest(request);
    return shopify.authenticate.admin(
      request,
      options as Parameters<typeof shopify.authenticate.admin>[1],
    );
  }) as typeof shopify.authenticate.admin,
};
export const unauthenticated = shopify.unauthenticated;
export const login = shopify.login;
export const registerWebhooks = shopify.registerWebhooks;
export const sessionStorage = shopify.sessionStorage;
