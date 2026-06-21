import { sendFeishuTextMessage } from "../sendFeishuTextMessage.server";
import { formatOpsNotifyTime } from "../feishuMessageFormat.server";
import type { SendFeishuResult } from "../feishuTypes.server";

const LOG = "[Feishu][SupportMsg]";

const CONTENT_MAX_LENGTH = 500;
const FIELD_FALLBACK = "（未提供）";

/** 来源中文展示名 + admin 回复页路径。 */
const SOURCE_META: Record<string, { label: string; adminPath: string }> = {
  spark: { label: "Spark", adminPath: "/support" },
  "translate-v4": { label: "翻译v4", adminPath: "/translate-v4-support" },
};

export type SendSupportMessageFeishuNotifyParams = {
  shop: string;
  /** 会话来源：spark | translate-v4 */
  source?: string;
  /** 商家发来的消息内容 */
  content: string;
  /** 商家在聊天框主动留的联系邮箱 */
  contactEmail?: string | null;
  /** Shopify 账户邮箱快照 */
  shopEmail?: string | null;
  /** 该会话当前累计的运营未读条数（含本条） */
  unreadForOps?: number;
  at?: Date;
};

function truncate(value: string | null | undefined, maxLength: number): string {
  const trimmed = value?.trim() ?? "";
  if (!trimmed) return FIELD_FALLBACK;
  if (trimmed.length <= maxLength) return trimmed;
  return `${trimmed.slice(0, maxLength)}…`;
}

/** Admin 客服会话页地址（未配置 ADMIN_BASE_URL 时退化为纯文字引导）。 */
function resolveAdminSupportUrl(adminPath: string): string | null {
  const base = process.env.ADMIN_BASE_URL?.trim();
  if (!base) return null;
  return `${base.replace(/\/+$/, "")}${adminPath}`;
}

export function buildSupportMessageNotify(
  params: SendSupportMessageFeishuNotifyParams,
): string {
  const contact = params.contactEmail?.trim();
  const shopEmail = params.shopEmail?.trim();
  const meta = SOURCE_META[params.source ?? "spark"] ?? SOURCE_META.spark;
  const adminUrl = resolveAdminSupportUrl(meta.adminPath);

  const lines = [
    "💬 收到新的客服消息",
    "",
    `来源: ${meta.label}`,
    `店铺: ${params.shop}`,
    `联系邮箱: ${truncate(contact || shopEmail, 200)}${contact ? "" : shopEmail ? "（账户邮箱）" : ""}`,
    `消息: ${truncate(params.content, CONTENT_MAX_LENGTH)}`,
    `时间: ${formatOpsNotifyTime(params.at ?? new Date())}`,
  ];
  if (typeof params.unreadForOps === "number" && params.unreadForOps > 1) {
    lines.push(`未读: 共 ${params.unreadForOps} 条待回复`);
  }
  lines.push("");
  lines.push(
    adminUrl
      ? `👉 请到 Admin「${meta.label} 客服」回复：${adminUrl}`
      : `👉 请到 Admin「${meta.label} 客服」页面回复`,
  );
  return lines.join("\n");
}

export async function sendSupportMessageFeishuNotify(
  params: SendSupportMessageFeishuNotifyParams,
): Promise<SendFeishuResult> {
  const message = buildSupportMessageNotify(params);
  const result = await sendFeishuTextMessage({
    channel: "ops_support",
    message,
  });
  console.info(
    `${LOG} after-send shop=${params.shop} ok=${result.ok} skipped=${"skipped" in result ? result.skipped : false}`,
  );
  return result;
}
