import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import {
  appendConversationMessages,
  deleteConversation,
  getConversationMessages,
} from "../server/conversation/conversationStore.server";

export const loader = async ({ request, params }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const messages = await getConversationMessages(params.id!, session.shop);
  return Response.json({ messages });
};

export const action = async ({ request, params }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);

  if (request.method === "DELETE") {
    const ok = await deleteConversation(params.id!, session.shop);
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
  };
  await appendConversationMessages({
    conversationId: params.id!,
    shop: session.shop,
    messages: body.messages,
    title: body.title,
    preview: body.preview,
  });
  return Response.json({ ok: true });
};
