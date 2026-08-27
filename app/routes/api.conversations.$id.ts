import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import {
  appendConversationMessages,
  deleteConversation,
  getConversationMessages,
  updateConversationTitle,
} from "../server/conversation/conversationStore.server";
import { generateConversationTitle } from "../server/conversation/generateConversationTitle.server";

export const loader = async ({ request, params }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const messages = await getConversationMessages(params.id!, session.shop);
  return Response.json({ messages });
};

export const action = async ({ request, params }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const conversationId = params.id!;

  if (request.method === "DELETE") {
    const ok = await deleteConversation(conversationId, session.shop);
    if (!ok) {
      return Response.json({ error: "Conversation not found" }, { status: 404 });
    }
    return Response.json({ ok: true });
  }

  if (request.method !== "POST") {
    return Response.json({ error: "Method not allowed" }, { status: 405 });
  }
  const body = (await request.json()) as {
    messages: Array<{ role: string; content: string; payloads?: string | null }>;
    title?: string;
    preview?: string;
    /** 首轮落库后用 LLM 生成侧栏短标题（Cursor 风格）；失败回退 title/首句 */
    generateTitle?: boolean;
  };

  await appendConversationMessages({
    conversationId,
    shop: session.shop,
    messages: body.messages,
    title: body.title,
    preview: body.preview,
  });

  if (!body.generateTitle) {
    return Response.json({ ok: true });
  }

  const userText =
    body.messages.find((message) => message.role === "user")?.content?.trim() ?? "";
  const assistantText =
    body.messages.find((message) => message.role === "assistant")?.content?.trim() ?? "";

  const title = await generateConversationTitle({
    shop: session.shop,
    userText: userText || body.title || "",
    assistantText: assistantText || undefined,
  });

  await updateConversationTitle({
    conversationId,
    shop: session.shop,
    title,
  });

  return Response.json({ ok: true, title });
};
