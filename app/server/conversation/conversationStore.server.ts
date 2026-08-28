import prisma from "../../db.server";
import {
  parseWorkspaceConversationContext,
  serializeWorkspaceConversationContext,
  type WorkspaceConversationContext,
} from "../../lib/workspaceConversationContext";

export type ConversationSummary = {
  id: string;
  title: string;
  preview: string;
  updatedAt: string;
};

export type MessageRow = {
  id: string;
  role: string;
  content: string;
  payloads: string | null;
  createdAt: string;
};

export async function listConversations(shop: string, limit = 50): Promise<ConversationSummary[]> {
  const rows = await prisma.conversation.findMany({
    where: { shop },
    orderBy: { updatedAt: "desc" },
    take: limit,
    select: { id: true, title: true, preview: true, updatedAt: true },
  });
  return rows.map((r) => ({
    id: r.id,
    title: r.title,
    preview: r.preview,
    updatedAt: r.updatedAt.toISOString(), // Prisma DateTime，ISO UTC
  }));
}

export async function createConversation(shop: string): Promise<ConversationSummary> {
  const row = await prisma.conversation.create({
    data: { shop },
    select: { id: true, title: true, preview: true, updatedAt: true },
  });
  return {
    id: row.id,
    title: row.title,
    preview: row.preview,
    updatedAt: row.updatedAt.toISOString(),
  };
}

export async function getConversationDetail(
  conversationId: string,
  shop: string,
): Promise<{ messages: MessageRow[]; context: WorkspaceConversationContext | null } | null> {
  const conversation = await prisma.conversation.findUnique({
    where: { id: conversationId },
    select: { shop: true, contextJson: true },
  });
  if (!conversation || conversation.shop !== shop) return null;

  const rows = await prisma.message.findMany({
    where: { conversationId },
    orderBy: { createdAt: "asc" },
    select: { id: true, role: true, content: true, payloads: true, createdAt: true },
  });
  return {
    messages: rows.map((m) => ({
      id: m.id,
      role: m.role,
      content: m.content,
      payloads: m.payloads,
      createdAt: m.createdAt.toISOString(),
    })),
    context: parseWorkspaceConversationContext(conversation.contextJson),
  };
}

/** @deprecated 用 getConversationDetail；保留兼容旧调用 */
export async function getConversationMessages(
  conversationId: string,
  shop: string,
): Promise<MessageRow[]> {
  const detail = await getConversationDetail(conversationId, shop);
  return detail?.messages ?? [];
}

export async function updateConversationContext(params: {
  conversationId: string;
  shop: string;
  context: WorkspaceConversationContext | null;
}): Promise<boolean> {
  const { conversationId, shop, context } = params;
  const conversation = await prisma.conversation.findUnique({
    where: { id: conversationId },
    select: { shop: true },
  });
  if (!conversation || conversation.shop !== shop) return false;

  const contextJson = context ? serializeWorkspaceConversationContext(context) : null;
  // 仅写 contextJson，避免频繁勾选上下文把会话顶到列表最前
  await prisma.$executeRaw`
    UPDATE "Conversation"
    SET "contextJson" = ${contextJson}
    WHERE "id" = ${conversationId} AND "shop" = ${shop}
  `;
  return true;
}

export async function deleteConversation(conversationId: string, shop: string): Promise<boolean> {
  const conversation = await prisma.conversation.findUnique({
    where: { id: conversationId },
    select: { shop: true },
  });
  if (!conversation || conversation.shop !== shop) return false;

  await prisma.conversation.delete({ where: { id: conversationId } });
  return true;
}

export async function appendConversationMessages(params: {
  conversationId: string;
  shop: string;
  messages: Array<{ role: string; content: string; payloads?: string | null }>;
  title?: string;
  preview?: string;
}): Promise<void> {
  const { conversationId, shop, messages, title, preview } = params;

  const conversation = await prisma.conversation.findUnique({
    where: { id: conversationId },
    select: { shop: true },
  });
  if (!conversation || conversation.shop !== shop) return;

  await prisma.$transaction([
    prisma.message.createMany({
      data: messages.map((m) => ({
        conversationId,
        role: m.role,
        content: m.content,
        payloads: m.payloads ?? null,
      })),
    }),
    prisma.conversation.update({
      where: { id: conversationId },
      data: {
        ...(title !== undefined ? { title } : {}),
        ...(preview !== undefined ? { preview } : {}),
        updatedAt: new Date(),
      },
    }),
  ]);
}

export async function updateConversationTitle(params: {
  conversationId: string;
  shop: string;
  title: string;
}): Promise<boolean> {
  const { conversationId, shop, title } = params;
  const conversation = await prisma.conversation.findUnique({
    where: { id: conversationId },
    select: { shop: true },
  });
  if (!conversation || conversation.shop !== shop) return false;

  await prisma.conversation.update({
    where: { id: conversationId },
    data: { title, updatedAt: new Date() },
  });
  return true;
}
