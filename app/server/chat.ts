import type { ActionFunctionArgs } from "react-router";
import { HumanMessage } from "@langchain/core/messages";
import { authenticate } from "../shopify.server";
import { buildChatAgentExtraTools } from "./ai/chatAgentTools.server";
import { invokeChatAgent } from "./ai/agent";
import { parseClientChatMessages } from "./chatPayload.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  if (request.method !== "POST") {
    return Response.json(
      { error: "Method not allowed, use POST." },
      { status: 405 },
    );
  }

  const body = (await request.json().catch(() => ({}))) as {
    message?: string;
    messages?: unknown;
  };

  let agentMessages;

  if (body.messages !== undefined && body.messages !== null) {
    const parsed = parseClientChatMessages(body.messages);
    if (!parsed) {
      return Response.json(
        {
          error:
            "无效的 messages：须为非空数组，元素为 { role: user|assistant, content }，且最后一条须为用户消息。",
        },
        { status: 400 },
      );
    }
    agentMessages = parsed;
  } else {
    const legacyText = body.message?.trim();
    agentMessages = legacyText
      ? [new HumanMessage(legacyText)]
      : [new HumanMessage("（空消息）")];
  }

  try {
    const { admin } = await authenticate.admin(request);
    const { reply, translationTaskForm } = await invokeChatAgent({
      messages: agentMessages,
      extraTools: buildChatAgentExtraTools(admin),
    });
    return Response.json({
      reply,
      ...(translationTaskForm ? { translationTaskForm } : {}),
    });
  } catch (error) {
    console.error("Chat agent error:", error);
    const hint =
      error instanceof Error && error.message.includes("DEEPSEEK_API_KEY")
        ? "未配置 DEEPSEEK_API_KEY，请在环境变量中设置后再试。"
        : "AI 服务暂时不可用，请稍后重试。";
    return Response.json(
      { error: hint, reply: hint },
      { status: 500 },
    );
  }
};
