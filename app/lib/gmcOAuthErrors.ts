export const GMC_OAUTH_ERROR_GCP_REGISTRATION = "gcp_registration_required";
export const GMC_OAUTH_ERROR_NO_ACCOUNT = "no_merchant_account";

export const GMC_MERCHANT_SIGNUP_URL = "https://merchants.google.com";

export function isGmcGcpRegistrationRequiredError(
  message: string | null | undefined,
): boolean {
  if (!message) return false;
  if (message === GMC_OAUTH_ERROR_GCP_REGISTRATION) return true;
  return /not registered with the merchant account/i.test(message);
}

export function isGmcNoMerchantAccountError(
  message: string | null | undefined,
): boolean {
  if (!message) return false;
  if (message === GMC_OAUTH_ERROR_NO_ACCOUNT) return true;
  return /未关联任何 Merchant Center/.test(message) || /no Merchant Center accounts/i.test(message);
}

export function normalizeGmcOAuthError(message: string): string {
  if (isGmcGcpRegistrationRequiredError(message)) {
    return GMC_OAUTH_ERROR_GCP_REGISTRATION;
  }
  if (isGmcNoMerchantAccountError(message)) {
    return GMC_OAUTH_ERROR_NO_ACCOUNT;
  }
  return message;
}
