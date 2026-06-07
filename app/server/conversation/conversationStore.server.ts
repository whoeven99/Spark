import prisma from "../../db.server";

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
    updatedAt: r.updatedAt.toISOString(),
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

export async function getConversationMessages(conversationId: string, shop: string): Promise<MessageRow[]> {
  const conversation = await prisma.conversation.findUnique({
    where: { id: conversationId },
    select: { shop: true },
  });
  if (!conversation || conversation.shop !== shop) return [];

  const rows = await prisma.message.findMany({
    where: { conversationId },
    orderBy: { createdAt: "asc" },
    select: { id: true, role: true, content: true, payloads: true, createdAt: true },
  });
  return rows.map((m) => ({
    id: m.id,
    role: m.role,
    content: m.content,
    payloads: m.payloads,
    createdAt: m.createdAt.toISOString(),
  }));
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
