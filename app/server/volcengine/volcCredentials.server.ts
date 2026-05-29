const LOG_PREFIX = "[Volc][Credentials]";

export type VolcCredentialProbe = {
  hasAccessKey: boolean;
  hasSecretKey: boolean;
  accessKeySource: "HUOSHAN_API_KEY" | "VOLC_ACCESSKEY" | "none";
  secretKeySource: "HUOSHAN_API_SECRET" | "VOLC_SECRETKEY" | "none";
};

export function probeVolcengineCredentials(): VolcCredentialProbe {
  const huoshanKey = process.env.HUOSHAN_API_KEY?.trim() ?? "";
  const volcKey = process.env.VOLC_ACCESSKEY?.trim() ?? "";
  const huoshanSecret = process.env.HUOSHAN_API_SECRET?.trim() ?? "";
  const volcSecret = process.env.VOLC_SECRETKEY?.trim() ?? "";

  const accessKeyId = huoshanKey || volcKey;
  const secretKey = huoshanSecret || volcSecret;

  return {
    hasAccessKey: Boolean(accessKeyId),
    hasSecretKey: Boolean(secretKey),
    accessKeySource: huoshanKey
      ? "HUOSHAN_API_KEY"
      : volcKey
        ? "VOLC_ACCESSKEY"
        : "none",
    secretKeySource: huoshanSecret
      ? "HUOSHAN_API_SECRET"
      : volcSecret
        ? "VOLC_SECRETKEY"
        : "none",
  };
}

/** 与整图翻译共用火山 AK/SK（HUOSHAN_* 或 VOLC_*）。 */
export function readVolcengineCredentials():
  | { accessKeyId: string; secretKey: string }
  | null {
  const probe = probeVolcengineCredentials();
  if (!probe.hasAccessKey || !probe.hasSecretKey) {
    console.info(
      `${LOG_PREFIX} credentials missing probe=${JSON.stringify(probe)}`,
    );
    return null;
  }

  const accessKeyId =
    process.env.HUOSHAN_API_KEY?.trim() ||
    process.env.VOLC_ACCESSKEY?.trim() ||
    "";
  const secretKey =
    process.env.HUOSHAN_API_SECRET?.trim() ||
    process.env.VOLC_SECRETKEY?.trim() ||
    "";

  return { accessKeyId, secretKey };
}

export function isVolcengineConfigured(): boolean {
  return readVolcengineCredentials() != null;
}
