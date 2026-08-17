export const GMC_OAUTH_ERROR_GCP_REGISTRATION = "gcp_registration_required";

export const GMC_GCP_REGISTRATION_GUIDE_URL =
  "https://developers.google.com/merchant/api/guides/quickstart/direct-api-calls#step_1_register_as_a_developer";

export function isGmcGcpRegistrationRequiredError(
  message: string | null | undefined,
): boolean {
  if (!message) return false;
  if (message === GMC_OAUTH_ERROR_GCP_REGISTRATION) return true;
  return /not registered with the merchant account/i.test(message);
}

export function normalizeGmcOAuthError(message: string): string {
  if (isGmcGcpRegistrationRequiredError(message)) {
    return GMC_OAUTH_ERROR_GCP_REGISTRATION;
  }
  return message;
}
