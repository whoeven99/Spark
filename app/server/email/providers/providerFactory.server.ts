import type { EmailConfig } from "../config/emailConfig.server";
import { loadEmailConfig } from "../config/emailConfig.server";
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
