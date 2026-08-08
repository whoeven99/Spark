import {
  getGoogleMerchantCredential,
} from "./credentialStore.server";
import {
  buildGoogleAdsHeaders,
  formatGoogleAdsUserError,
  googleAdsApiUrl,
  normalizeCustomerId,
  parseGoogleAdsError,
} from "./googleAdsApi.server";
import { prepareGoogleAdsApiAuth } from "./googleAdsToken.server";
import { getGoogleAdsDeveloperToken } from "./googleOAuth.server";

export type GoogleProductLinkState = "not_linked" | "pending" | "linked" | "failed";

export interface GoogleProductLinkStatus {
  state: GoogleProductLinkState;
  merchantId: string;
  customerId: string;
  invitationStatus?: string;
  error?: string;
}

interface LinkRow {
  productLink?: {
    type?: string;
    merchantCenter?: { merchantCenterId?: string };
    merchant_center?: { merchant_center_id?: string };
  };
  productLinkInvitation?: {
    type?: string;
    status?: string;
    merchantCenter?: { merchantCenterId?: string };
    merchant_center?: { merchant_center_id?: string };
  };
}

function merchantIdFromRow(row: LinkRow, invitation: boolean): string {
  const value = invitation ? row.productLinkInvitation : row.productLink;
  return (
    value?.merchantCenter?.merchantCenterId ??
    value?.merchant_center?.merchant_center_id ??
    ""
  );
}

async function googleAdsRequest(params: {
  accessToken: string;
  developerToken: string;
  customerId: string;
  loginCustomerId: string;
  path: string;
  body: unknown;
}): Promise<unknown> {
  const response = await fetch(googleAdsApiUrl(params.path), {
    method: "POST",
    headers: {
      ...buildGoogleAdsHeaders(params),
      "Content-Type": "application/json",
    },
    body: JSON.stringify(params.body),
  });
  const text = await response.text();
  if (!response.ok) throw new Error(parseGoogleAdsError(text, response.status));
  return text ? JSON.parse(text) : {};
}

async function queryRows(params: {
  accessToken: string;
  developerToken: string;
  customerId: string;
  loginCustomerId: string;
  query: string;
}): Promise<LinkRow[]> {
  const customerId = normalizeCustomerId(params.customerId);
  const payload = await googleAdsRequest({
    ...params,
    customerId,
    path: `/customers/${customerId}/googleAds:searchStream`,
    body: { query: params.query },
  });
  const batches = Array.isArray(payload) ? payload : [payload];
  return batches.flatMap((batch) =>
    batch && typeof batch === "object" && Array.isArray((batch as { results?: unknown[] }).results)
      ? ((batch as { results: LinkRow[] }).results)
      : [],
  );
}

export async function getGoogleProductLinkStatus(
  shop: string,
): Promise<GoogleProductLinkStatus> {
  const merchant = await getGoogleMerchantCredential(shop);
  if (!merchant) throw new Error("Google Merchant Center 未连接");
  const auth = await prepareGoogleAdsApiAuth(shop);
  const developerToken = getGoogleAdsDeveloperToken();
  const common = { ...auth, developerToken };

  try {
    const [links, invitations] = await Promise.all([
      queryRows({
        ...common,
        query: `SELECT product_link.type, product_link.merchant_center.merchant_center_id
          FROM product_link WHERE product_link.type = 'MERCHANT_CENTER'`,
      }),
      queryRows({
        ...common,
        query: `SELECT product_link_invitation.type, product_link_invitation.status,
          product_link_invitation.merchant_center.merchant_center_id
          FROM product_link_invitation
          WHERE product_link_invitation.type = 'MERCHANT_CENTER'`,
      }),
    ]);
    if (links.some((row) => merchantIdFromRow(row, false) === merchant.merchantId)) {
      return {
        state: "linked",
        merchantId: merchant.merchantId,
        customerId: auth.customerId,
      };
    }
    const invitation = invitations.find(
      (row) => merchantIdFromRow(row, true) === merchant.merchantId,
    )?.productLinkInvitation;
    if (invitation) {
      return {
        state: "pending",
        merchantId: merchant.merchantId,
        customerId: auth.customerId,
        invitationStatus: invitation.status ?? "UNKNOWN",
      };
    }
    return {
      state: "not_linked",
      merchantId: merchant.merchantId,
      customerId: auth.customerId,
    };
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    return {
      state: "failed",
      merchantId: merchant.merchantId,
      customerId: auth.customerId,
      error: formatGoogleAdsUserError(detail),
    };
  }
}

export async function ensureGoogleProductLink(
  shop: string,
): Promise<GoogleProductLinkStatus> {
  const current = await getGoogleProductLinkStatus(shop);
  if (current.state === "linked" || current.state === "pending") return current;
  if (current.state === "failed") return current;

  const auth = await prepareGoogleAdsApiAuth(shop);
  const developerToken = getGoogleAdsDeveloperToken();
  const customerId = normalizeCustomerId(auth.customerId);
  const common = { ...auth, customerId, developerToken };
  const merchantCenter = { merchantCenterId: current.merchantId };
  try {
    await googleAdsRequest({
      ...common,
      path: `/customers/${customerId}/productLinks:create`,
      body: {
        productLink: {
          type: "MERCHANT_CENTER",
          merchantCenter,
        },
      },
    });
    return { ...current, state: "linked" };
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    if (!/CREATION_NOT_PERMITTED|INVITATION_REQUIRED/i.test(detail)) {
      return { ...current, state: "failed", error: formatGoogleAdsUserError(detail) };
    }
  }

  try {
    await googleAdsRequest({
      ...common,
      path: `/customers/${customerId}/productLinkInvitations:create`,
      body: {
        productLinkInvitation: {
          type: "MERCHANT_CENTER",
          merchantCenter,
        },
      },
    });
    return { ...current, state: "pending", invitationStatus: "REQUESTED" };
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    return { ...current, state: "failed", error: formatGoogleAdsUserError(detail) };
  }
}
