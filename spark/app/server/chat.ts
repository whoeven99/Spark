import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import { createShopifyShopInfoTool } from "./ai/tools";
import { invokeChatAgent } from "./ai/agent";

export const action = async ({ request }: ActionFunctionArgs) => {
  if (request.method !== "POST") {
    return Response.json(
      { error: "Method not allowed, use POST." },
      { status: 405 },
    );
  }

  const body = (await request.json().catch(() => ({}))) as { message?: string };
  const userMessage = body.message?.trim() || "（空消息）";

  try {
    const { admin } = await authenticate.admin(request);
    const shopInfoTool = createShopifyShopInfoTool(admin);
    const reply = await invokeChatAgent(userMessage, {
      extraTools: [shopInfoTool],
    });
    return Response.json({ reply });
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
