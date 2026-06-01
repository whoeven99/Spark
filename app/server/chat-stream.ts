import type { ActionFunctionArgs } from "react-router";
import { HumanMessage } from "@langchain/core/messages";
import { authenticate } from "../shopify.server";
import { invokeChatAgentStream, type StreamChunk } from "./ai/core/agentStream.server";
import { parseClientChatMessages } from "./chatPayload.server";
import { createLangsmithTracer, isLangsmithAvailable, getTraceUrl } from "./ai/utils/langsmith.server";
import { getAppEntry } from "../config/appEntry.server";

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

    const langsmithTracer = isLangsmithAvailable()
      ? await createLangsmithTracer(`chat-stream-${Date.now()}`)
      : undefined;
    
    if (langsmithTracer) {
      console.log(`[LangSmith] Streaming chat tracing started: ${getTraceUrl() ?? "enabled"}`);
    }

    const stream = await invokeChatAgentStream({
      messages: agentMessages,
      context: {
        admin,
        shop: session?.shop,
        appName: getAppEntry(),
      },
      config: langsmithTracer ? { callbacks: [langsmithTracer] } : undefined,
    });

    const encoder = new TextEncoder();

    const transformedStream = stream.pipeThrough(
      new TransformStream<StreamChunk, Uint8Array>({
        transform(chunk, controller) {
          const data = `data: ${JSON.stringify(chunk)}\n\n`;
          controller.enqueue(encoder.encode(data));
        },
      }),
    );

    return new Response(transformedStream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        "Connection": "keep-alive",
        "Access-Control-Allow-Origin": "*",
      },
    });
  } catch (error) {
    console.error("Chat agent error:", error);
    const hint =
      error instanceof Error && error.message.includes("DEEPSEEK_API_KEY")
        ? "未配置 DEEPSEEK_API_KEY，请在环境变量中设置后再试。"
        : "AI 服务暂时不可用，请稍后重试。";
    
    const encoder = new TextEncoder();
    const errorStream = new ReadableStream({
      start(controller) {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: "error", message: hint })}\n\n`));
        controller.close();
      },
    });

    return new Response(errorStream, {
      status: 500,
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
      },
    });
  }
};
