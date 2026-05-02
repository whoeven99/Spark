import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);

  const body = (await request.json().catch(() => ({}))) as {
    suggestion?: string;
  };

  const suggestion = body.suggestion?.trim() ?? "";
  if (!suggestion) {
    return Response.json(
      { ok: false, error: "建议内容不能为空" },
      { status: 400 },
    );
  }

  if (suggestion.length > 2000) {
    return Response.json(
      { ok: false, error: "建议内容过长（最多 2000 字）" },
      { status: 400 },
    );
  }

  await prisma.suggestion.create({
    data: {
      shop: session.shop,
      content: suggestion,
    },
  });

  return Response.json({
    ok: true,
    message: "提交成功，感谢您的建议",
  });
};

