import type { EmailConfig } from "../config/emailConfig.server";
import { loadEmailConfig } from "../config/emailConfig.server";
import {
  createEmailError,
  EMAIL_ERROR_CODES,
} from "../types/emailError";
import type { EmailProvider } from "./emailProvider";
import { createTencentSesProvider } from "./tencentSesProvider.server";

export function getEmailProvider(
  config: EmailConfig = loadEmailConfig(),
): EmailProvider | null {
  if (!config.enabled) return null;

  switch (config.provider) {
    case "tencent":
      return createTencentSesProvider(config);
    default:
      return null;
  }
}

export function getEmailProviderOrThrow(
  config: EmailConfig = loadEmailConfig(),
): EmailProvider {
  const provider = getEmailProvider(config);
  if (!provider) {
    throw createEmailError({
      code: EMAIL_ERROR_CODES.PROVIDER_NOT_FOUND,
      message: `Email provider not available: ${config.provider}`,
      provider: config.provider,
    });
  }
  return provider;
}
