import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import {
  getAdProviderCredential,
  maskClientId,
  setAdProviderCredential,
} from "../server/adsCredentialStore.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const config = await getAdProviderCredential(session.shop, "meta");
  return Response.json({
    configured: Boolean(config),
    clientIdMasked: config ? maskClientId(config.clientId) : "",
    updatedAt: config?.updatedAt ?? "",
  });
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const body = (await request.json().catch(() => ({}))) as {
    clientId?: string;
    clientSecret?: string;
  };

  const clientId = body.clientId?.trim() ?? "";
  const clientSecret = body.clientSecret?.trim() ?? "";
  if (!clientId || !clientSecret) {
    return Response.json(
      { ok: false, error: "Meta App ID 和 Meta App Secret 不能为空" },
      { status: 400 },
    );
  }

  await setAdProviderCredential(session.shop, "meta", clientId, clientSecret);
  return Response.json({
    ok: true,
    configured: true,
    clientIdMasked: maskClientId(clientId),
  });
};

