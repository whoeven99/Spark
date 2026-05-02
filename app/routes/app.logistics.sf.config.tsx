import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import {
  getSfCredential,
  maskCustomerCode,
  setSfCredential,
} from "../server/logisticsCredentialStore.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const config = await getSfCredential(session.shop);
  return Response.json({
    configured: Boolean(config),
    customerCodeMasked: config ? maskCustomerCode(config.customerCode) : "",
    hasMonthlyAccount: Boolean(config?.monthlyAccount),
    updatedAt: config?.updatedAt ?? "",
  });
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const body = (await request.json().catch(() => ({}))) as {
    customerCode?: string;
    checkWord?: string;
    monthlyAccount?: string;
  };

  const customerCode = body.customerCode?.trim() ?? "";
  const checkWord = body.checkWord?.trim() ?? "";
  const monthlyAccount = body.monthlyAccount?.trim() ?? "";

  if (!customerCode || !checkWord) {
    return Response.json(
      { ok: false, error: "顺丰顾客编码和校验码不能为空" },
      { status: 400 },
    );
  }

  await setSfCredential(session.shop, customerCode, checkWord, monthlyAccount);
  return Response.json({
    ok: true,
    configured: true,
    customerCodeMasked: maskCustomerCode(customerCode),
    hasMonthlyAccount: Boolean(monthlyAccount),
  });
};

