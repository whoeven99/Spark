import type { ActionFunctionArgs } from "react-router";
import { HumanMessage } from "@langchain/core/messages";
import { authenticate } from "../shopify.server";
import { invokeChatAgentStream, type StreamChunk } from "./ai/core/agentStream.server";
import { parseClientChatMessages, buildContextWindow } from "./chatPayload.server";
import { injectFilesIntoMessages } from "./fileContext/fileContextInjector.server";
import {
  billingErrorToResponse,
  requireBillingAccess,
} from "./billing/index.server";
import { resolveUiLocale } from "../i18n/resolveUiLocale.server";
import {
  merchantFriendlyJson,
  merchantFriendlySseError,
} from "./http/merchantFriendlyResponse.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  if (request.method !== "POST") {
    return merchantFriendlyJson({
      ok: false,
      error: "请使用 POST 发送聊天请求。",
    });
  }

  const body = (await request.json().catch(() => ({}))) as {
    message?: string;
    messages?: unknown;
    fileIds?: unknown;
    skillFocus?: unknown;
  };

  let agentMessages;

  if (body.messages !== undefined && body.messages !== null) {
    const parsed = parseClientChatMessages(body.messages);
    if (!parsed) {
      return merchantFriendlyJson({
        ok: false,
        error:
          "无效的 messages：须为非空数组，元素为 { role: user|assistant, content }，且最后一条须为用户消息。",
      });
    }
    agentMessages = parsed;
  } else {
    const legacyText = body.message?.trim();
    agentMessages = legacyText
      ? [new HumanMessage(legacyText)]
      : [new HumanMessage("（空消息）")];
  }

  const fileIds: string[] = Array.isArray(body.fileIds)
    ? body.fileIds.filter((id): id is string => typeof id === "string")
    : [];
  const skillFocus =
    typeof body.skillFocus === "string" && body.skillFocus.trim()
      ? body.skillFocus.trim()
      : null;

  try {
    const { admin, session } = await authenticate.admin(request);
    const shop = session.shop?.trim();
    if (shop) {
      await requireBillingAccess(shop);
    }

    const locale = await resolveUiLocale(request, {
      admin,
      shop,
      logContext: `chat-stream shop=${shop ?? ""}`,
    });

    const windowedMessages = await buildContextWindow(agentMessages, { shop });

    const messagesWithFiles =
      fileIds.length && shop
        ? await injectFilesIntoMessages(windowedMessages, shop, fileIds)
        : windowedMessages;

    const stream = invokeChatAgentStream({
      messages: messagesWithFiles,
      context: {
        admin,
        shop,
        locale,
      },
      // LangSmith tracer 与 runCollector 由 invokeChatAgentStream 内部统一挂载，避免重复注册。
      skillFocus,
      signal: request.signal,
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
    const billingResponse = billingErrorToResponse(error);
    if (billingResponse) {
      const body = (await billingResponse.json()) as { errorMsg?: string };
      return merchantFriendlySseError(
        body.errorMsg ?? "Token 余额不足或尚未订阅，请前往账户页开通",
      );
    }
    const hint =
      error instanceof Error && error.message.includes("DEEPSEEK_API_KEY")
        ? "未配置 DEEPSEEK_API_KEY，请在环境变量中设置后再试。"
        : "AI 服务暂时不可用，请稍后重试。";

    return merchantFriendlySseError(hint);
  }
};
