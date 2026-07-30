import prisma from "../../db.server";
import { sendSupportMessageFeishuNotify } from "../feishu";

/** 一条客服消息的对外形状（商家端 / 运营端共用）。 */
export type SupportMessageDTO = {
  id: string;
  sender: string; // "shop" | "ops"
  senderName: string | null;
  content: string;
  createdAt: string;
};

export type SupportConversationDTO = {
  id: string;
  status: string;
  contactEmail: string | null;
  shopEmail: string | null;
  unreadForShop: number;
  messages: SupportMessageDTO[];
};

/** 会话来源默认值（Spark 自身商家端）。tsf 翻译v4 传入 "translate-v4"。 */
const DEFAULT_SOURCE = "spark";

const MAX_MESSAGE_LEN = 4000;
const PREVIEW_LEN = 120;

function toMessageDTO(m: {
  id: string;
  sender: string;
  senderName: string | null;
  content: string;
  createdAt: Date;
}): SupportMessageDTO {
  return {
    id: m.id,
    sender: m.sender,
    senderName: m.senderName,
    content: m.content,
    createdAt: m.createdAt.toISOString(),
  };
}

/** 还没有会话时返回的空态（不落库，避免空会话污染运营收件箱）。 */
function emptyConversationDTO(shopEmail: string | null): SupportConversationDTO {
  return {
    id: "",
    status: "open",
    contactEmail: null,
    shopEmail,
    unreadForShop: 0,
    messages: [],
  };
}

/**
 * 读取某店的客服会话（不存在则返回空态，不创建——会话由商家首次发消息/留邮箱时惰性创建）。
 * markSeen=true（商家真正打开面板）时清运营消息未读，并顺带刷新账户邮箱快照。
 */
export async function getConversationForShop(
  shop: string,
  shopEmail: string | null,
  options: { markSeen?: boolean } = {},
  source: string = DEFAULT_SOURCE,
): Promise<SupportConversationDTO> {
  let conversation = await prisma.supportConversation.findUnique({
    where: { shop_source: { shop, source } },
  });

  if (!conversation) {
    return emptyConversationDTO(shopEmail);
  }

  // Shopify 账户邮箱可能变化，保持快照最新（卸载兜底用）
  if (shopEmail && conversation.shopEmail !== shopEmail) {
    conversation = await prisma.supportConversation.update({
      where: { shop_source: { shop, source } },
      data: { shopEmail },
    });
  }

  // 仅当商家真正查看面板（markSeen）时才清运营未读；后台拉徽标时不清。
  if (options.markSeen && conversation.unreadForShop > 0) {
    await prisma.supportConversation.update({
      where: { shop_source: { shop, source } },
      data: { unreadForShop: 0 },
    });
    conversation.unreadForShop = 0;
  }

  const messages = await prisma.supportMessage.findMany({
    where: { conversationId: conversation.id },
    orderBy: { createdAt: "asc" },
  });

  return {
    id: conversation.id,
    status: conversation.status,
    contactEmail: conversation.contactEmail,
    shopEmail: conversation.shopEmail,
    unreadForShop: conversation.unreadForShop,
    messages: messages.map(toMessageDTO),
  };
}

/** 商家发送一条消息：追加 + 累计运营未读 + 刷新预览。 */
export async function appendShopMessage(
  shop: string,
  rawContent: string,
  shopEmail: string | null,
  source: string = DEFAULT_SOURCE,
): Promise<SupportMessageDTO> {
  const content = rawContent.trim().slice(0, MAX_MESSAGE_LEN);
  if (!content) throw new Error("消息内容不能为空");

  const conversation = await prisma.supportConversation.upsert({
    where: { shop_source: { shop, source } },
    create: { shop, source, shopEmail: shopEmail || null },
    update: shopEmail ? { shopEmail } : {},
  });

  const message = await prisma.supportMessage.create({
    data: { conversationId: conversation.id, sender: "shop", content },
  });

  const updated = await prisma.supportConversation.update({
    where: { shop_source: { shop, source } },
    data: {
      lastMessage: content.slice(0, PREVIEW_LEN),
      lastMessageAt: message.createdAt,
      unreadForOps: { increment: 1 },
      status: "open",
    },
  });

  // fire-and-forget：飞书通知运营有新消息，失败只记日志，不阻断发送
  void sendSupportMessageFeishuNotify({
    shop,
    source,
    content,
    contactEmail: updated.contactEmail,
    shopEmail: updated.shopEmail,
    unreadForOps: updated.unreadForOps,
    at: message.createdAt,
  }).catch((error) => {
    console.error("[support] feishu notify failed:", error);
  });

  return toMessageDTO(message);
}

/** 商家在聊天框留下/更新联系邮箱。 */
export async function setContactEmail(
  shop: string,
  rawEmail: string,
  shopEmail: string | null,
  source: string = DEFAULT_SOURCE,
): Promise<void> {
  const email = rawEmail.trim().slice(0, 320);
  await prisma.supportConversation.upsert({
    where: { shop_source: { shop, source } },
    create: {
      shop,
      source,
      contactEmail: email || null,
      shopEmail: shopEmail || null,
    },
    update: { contactEmail: email || null },
  });
}
