import type { LoaderFunctionArgs } from "react-router";
import { buildCapabilitiesManifest } from "../server/ai/core/skillManifest.server";

/**
 * AI 能力清单（单一事实源）——从注册表自动派生，供 admin 能力概览页消费。
 * 返回内容仅为能力/流程的描述性元数据，不含店铺数据或密钥。
 *
 * 可选鉴权：设置环境变量 AI_CAPABILITIES_TOKEN 后，调用方需带
 * `Authorization: Bearer <token>` 或 `?token=<token>`。
 */
export const loader = async ({ request }: LoaderFunctionArgs): Promise<Response> => {
  const expected = process.env.AI_CAPABILITIES_TOKEN?.trim();
  if (expected) {
    const url = new URL(request.url);
    const header = request.headers.get("authorization") ?? "";
    const bearer = header.toLowerCase().startsWith("bearer ")
      ? header.slice(7).trim()
      : "";
    const provided = bearer || url.searchParams.get("token") || "";
    if (provided !== expected) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  const manifest = await buildCapabilitiesManifest();
  return Response.json(manifest, {
    headers: { "cache-control": "public, max-age=60" },
  });
};
