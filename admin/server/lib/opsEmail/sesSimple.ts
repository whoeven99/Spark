import { ses } from "tencentcloud-sdk-nodejs-ses";
import { getEnv } from "../env.js";

const DEFAULT_FROM = "support@msg.ciwi.ai";
const DEFAULT_REGION = "ap-hongkong";

type SesClient = InstanceType<typeof ses.v20201002.Client>;

let cachedClient: SesClient | null = null;
let cachedKey: string | null = null;

export type SesSimpleResult =
  | { ok: true; requestId: string }
  | { ok: false; message: string };

function encodeBase64(value: string): string {
  return Buffer.from(value, "utf8").toString("base64");
}

function resolveFromEmail(): string {
  const candidate = getEnv("TENCENT_FROM_EMAIL") || DEFAULT_FROM;
  if (candidate.toLowerCase() === "support@ciwi.ai") return DEFAULT_FROM;
  return candidate;
}

function getClient(): SesClient {
  const secretId = getEnv("TENCENT_CLOUD_KEY_ID") || getEnv("Tencent_Cloud_KEY_ID");
  const secretKey = getEnv("TENCENT_CLOUD_KEY") || getEnv("Tencent_Cloud_KEY");
  const region = getEnv("TENCENT_SES_REGION") || DEFAULT_REGION;
  if (!secretId || !secretKey) {
    throw new Error("未配置 TENCENT_CLOUD_KEY_ID / TENCENT_CLOUD_KEY");
  }
  const key = `${secretId}:${region}`;
  if (cachedClient && cachedKey === key) return cachedClient;
  cachedClient = new ses.v20201002.Client({
    credential: { secretId, secretKey },
    region,
  });
  cachedKey = key;
  return cachedClient;
}

export function isOpsEmailSendReady(): boolean {
  const enabled = (getEnv("EMAIL_ENABLED") || "true").toLowerCase();
  if (enabled === "false" || enabled === "0") return false;
  const secretId = getEnv("TENCENT_CLOUD_KEY_ID") || getEnv("Tencent_Cloud_KEY_ID");
  const secretKey = getEnv("TENCENT_CLOUD_KEY") || getEnv("Tencent_Cloud_KEY");
  return Boolean(secretId && secretKey);
}

export function resolveTestRecipient(): string | null {
  return getEnv("EMAIL_TEST_RECIPIENT") || null;
}

export async function sendSimpleEmail(input: {
  to: string;
  subject: string;
  html: string;
}): Promise<SesSimpleResult> {
  if (!isOpsEmailSendReady()) {
    return { ok: false, message: "邮件未启用或缺少腾讯云 SES 凭证" };
  }

  const text = input.html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();

  try {
    const resp = await getClient().SendEmail({
      FromEmailAddress: resolveFromEmail(),
      Destination: [input.to],
      Subject: input.subject,
      Simple: {
        Html: encodeBase64(input.html),
        Text: encodeBase64(text || input.subject),
      },
    });
    const requestId = resp.RequestId?.trim();
    if (!requestId) {
      return { ok: false, message: "腾讯云 SES 未返回 RequestId" };
    }
    return { ok: true, requestId };
  } catch (error) {
    const message = error instanceof Error ? error.message : "腾讯云 SES 发送失败";
    return { ok: false, message };
  }
}
