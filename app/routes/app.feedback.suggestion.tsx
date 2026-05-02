import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  await authenticate.admin(request);

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

  return Response.json({
    ok: true,
    message: "提交成功，感谢您的建议",
  });
};

