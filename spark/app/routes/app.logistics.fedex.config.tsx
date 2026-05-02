import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import {
  getFedexCredential,
  maskAccountNumber,
  setFedexCredential,
} from "../server/logisticsCredentialStore.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const config = await getFedexCredential(session.shop);
  return Response.json({
    configured: Boolean(config),
    accountNumberMasked: config ? maskAccountNumber(config.accountNumber) : "",
    updatedAt: config?.updatedAt ?? "",
  });
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const body = (await request.json().catch(() => ({}))) as {
    apiKey?: string;
    secretKey?: string;
    accountNumber?: string;
    meterNumber?: string;
  };

  const apiKey = body.apiKey?.trim() ?? "";
  const secretKey = body.secretKey?.trim() ?? "";
  const accountNumber = body.accountNumber?.trim() ?? "";
  const meterNumber = body.meterNumber?.trim() ?? "";

  if (!apiKey || !secretKey || !accountNumber) {
    return Response.json(
      { ok: false, error: "FedEx 的 API Key、Secret Key、Account Number 不能为空" },
      { status: 400 },
    );
  }

  await setFedexCredential(session.shop, apiKey, secretKey, accountNumber, meterNumber);
  return Response.json({
    ok: true,
    configured: true,
    accountNumberMasked: maskAccountNumber(accountNumber),
  });
};

