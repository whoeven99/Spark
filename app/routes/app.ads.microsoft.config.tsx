import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import {
  getMicrosoftCredential,
  maskToken,
  setMicrosoftCredential,
} from "../server/adAuthCredentialStore.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const config = await getMicrosoftCredential(session.shop);
  return Response.json({
    configured: Boolean(config),
    clientIdMasked: config ? maskToken(config.clientId) : "",
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

  if (!clientId || !clientSecret || !developerToken || !customerId) {
    return Response.json(
      {
        ok: false,
        error:
          "Microsoft Ads 的 Client ID、Client Secret、Developer Token、Customer ID 均不能为空",
      },
      { status: 400 },
    );
  }

  await setMicrosoftCredential(session.shop, clientId, clientSecret, developerToken, customerId);
  return Response.json({
    ok: true,
    configured: true,
    clientIdMasked: maskToken(clientId),
  });
};

