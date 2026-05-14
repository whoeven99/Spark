import type { ActionFunctionArgs } from "react-router";
import { HumanMessage } from "@langchain/core/messages";
import { authenticate } from "../shopify.server";
import { buildChatAgentExtraTools } from "./ai/skills/index";
import { invokeChatAgent } from "./ai/core/invokeChatAgent.server";
import { parseClientChatMessages } from "./chatPayload.server";
import { isLangsmithAvailable } from "./ai/utils/langsmith.server";
import type { UserProfile } from "./ai/core/toolRegistry.server";

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
    const { admin, session } = await authenticate.admin(request);
    
    // TODO: 从数据库读取当前商店/用户的画像数据
    // const userProfile = await db.userProfile.findUnique({ where: { shop: session?.shop } });
    const dummyProfile: UserProfile = {
      plan: "pro",
      industry: "fashion",
      preferences: { tone: "professional" }
    };
    
    // 生成会话名称用于 LangSmith 追踪
    const shopDomain = session?.shop;
    const sessionName = shopDomain 
      ? `chat-session-${shopDomain}-${Date.now()}` 
      : undefined;
    
    console.log(`[Chat] LangSmith available: ${isLangsmithAvailable()}`);
    
    const extraTools = await buildChatAgentExtraTools({ admin, profile: dummyProfile });

    const {
      reply,
      translationTaskForm,
      generateDescriptionCard,
      generateDescriptionCardPayload,
      langsmithTraceUrl,
    } = await invokeChatAgent({
      messages: agentMessages,
      extraTools,
      sessionName,
      profile: dummyProfile,
    });
    
    return Response.json({
      reply,
      ...(translationTaskForm ? { translationTaskForm } : {}),
      ...(generateDescriptionCard ? { generateDescriptionCard } : {}),
      ...(generateDescriptionCardPayload
        ? { generateDescriptionCardPayload }
        : {}),
      ...(langsmithTraceUrl ? { langsmithTraceUrl } : {}),
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
