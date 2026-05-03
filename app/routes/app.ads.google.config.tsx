import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import {
  getGoogleCredential,
  maskSecretKeepLast3,
  maskToken,
  setGoogleCredential,
} from "../server/adAuthCredentialStore.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const config = await getGoogleCredential(session.shop);
  return Response.json({
    configured: Boolean(config),
    clientIdMasked: config ? maskToken(config.clientId) : "",
    clientSecretMasked: config ? maskSecretKeepLast3(config.clientSecret) : "",
    developerTokenMasked: config ? maskSecretKeepLast3(config.developerToken) : "",
    customerId: config?.customerId ?? "",
    updatedAt: config?.updatedAt ?? "",
  });
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const body = (await request.json().catch(() => ({}))) as {
    clientId?: string;
    clientSecret?: string;
    developerToken?: string;
    customerId?: string;
  };

  const clientId = body.clientId?.trim() ?? "";
  const clientSecret = body.clientSecret?.trim() ?? "";
  const developerToken = body.developerToken?.trim() ?? "";
  const customerId = body.customerId?.trim() ?? "";

  const current = await getGoogleCredential(session.shop);
  const resolvedClientId =
    (clientId.includes("*") ? current?.clientId : clientId) ?? "";
  const resolvedClientSecret =
    (clientSecret.startsWith("xxxx") ? current?.clientSecret : clientSecret) ?? "";
  const resolvedDeveloperToken =
    (developerToken.startsWith("xxxx") ? current?.developerToken : developerToken) ?? "";
  const resolvedCustomerId = customerId || current?.customerId || "";

  if (
    !resolvedClientId ||
    !resolvedClientSecret ||
    !resolvedDeveloperToken ||
    !resolvedCustomerId
  ) {
    return Response.json(
      { ok: false, error: "Google Ads 的 Client ID、Client Secret、Developer Token、Customer ID 均不能为空" },
      { status: 400 },
    );
  }

  await setGoogleCredential(
    session.shop,
    resolvedClientId,
    resolvedClientSecret,
    resolvedDeveloperToken,
    resolvedCustomerId,
  );
  return Response.json({
    ok: true,
    configured: true,
    clientIdMasked: maskToken(resolvedClientId),
    clientSecretMasked: maskSecretKeepLast3(resolvedClientSecret),
    developerTokenMasked: maskSecretKeepLast3(resolvedDeveloperToken),
    customerId: resolvedCustomerId,
  });
};

