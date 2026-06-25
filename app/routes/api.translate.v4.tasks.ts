import type { LoaderFunctionArgs, ActionFunctionArgs } from "react-router";
import { data } from "react-router";
import { authenticate } from "../shopify.server";
import { existsBlockingV4Task } from "../server/translation/v4/activeTaskGuard.server";
import { createV4Job, listV4Jobs } from "../server/translation/v4/cosmosV4Store.server";
import { resolveShopAccessTokenForWorker } from "../server/shopify/resolveShopAccessToken.server";
import { TRANSLATION_V4_MODULES, type TranslationV4Module } from "../server/translation/v4/types";
import { getTranslateRedisClient } from "../server/translation/translateRedis.server";

const HINT_KEY_INIT = "translate:v4:hint:init";

/** GET /api/translate/v4/tasks?shopName= */
export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const url = new URL(request.url);
  const shopName = url.searchParams.get("shopName")?.trim() || session.shop;

  const jobs = await listV4Jobs(shopName);
  return data({ ok: true, jobs });
};

/** POST /api/translate/v4/tasks */
export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);

  const body = (await request.json().catch(() => ({}))) as {
    source?: string;
    target?: string;
    modules?: string[];
    limitPerType?: number;
    isCover?: boolean;
    isHandle?: boolean;
    aiModel?: string;
  };

  const source = body.source?.trim() || "zh-CN";
  const target = body.target?.trim() || "";
  if (!target) return data({ ok: false, error: "目标语言不能为空" }, { status: 400 });
  if (target === source) return data({ ok: false, error: "目标语言不能和源语言相同" }, { status: 400 });

  const allowedSet = new Set<string>(TRANSLATION_V4_MODULES);
  const modules = (body.modules ?? ["PRODUCT", "COLLECTION", "PAGE", "ARTICLE"])
    .map((m) => m.trim().toUpperCase())
    .filter((m) => allowedSet.has(m)) as TranslationV4Module[];

  if (!modules.length) return data({ ok: false, error: "至少选择一个翻译模块" }, { status: 400 });

  const shopName = session.shop;
  if (await existsBlockingV4Task(shopName, source, target)) {
    return data(
      { ok: false, error: "该目标语言已有进行中的翻译任务" },
      { status: 409 },
    );
  }

  // 0 means "fetch all" — no upper cap; any positive value is used as-is (min 1)
  const rawLimit = Number(body.limitPerType);
  const limitPerType = rawLimit === 0 ? Number.MAX_SAFE_INTEGER : Math.max(rawLimit || 20, 1);
  const jobId = crypto.randomUUID();
  const shopifyAccessToken = await resolveShopAccessTokenForWorker(shopName, session.accessToken).then(
    (t) => t ?? "",
  );

  const job = await createV4Job({
    id: jobId,
    shopName,
    shopifyAccessToken,
    source,
    target,
    modules,
    aiModel: body.aiModel?.trim() || process.env.DEEPSEEK_MODEL?.trim() || "deepseek-v4-flash",
    limitPerType,
    isCover: body.isCover ?? false,
    isHandle: body.isHandle ?? false,
    status: "INIT_QUEUED",
    blobPrefix: `tasks/v4/${shopName}/${jobId}`,
    createdBy: shopName,
  });

  // Push hint to Redis so the worker picks it up immediately (best-effort)
  try {
    await getTranslateRedisClient().lpush(HINT_KEY_INIT, JSON.stringify({ taskId: jobId, shopName }));
  } catch {
    // non-fatal
  }

  console.log(`[v4] job created id=${jobId} shop=${shopName} ${source}→${target} modules=${modules.join(",")}`);
  return data({ ok: true, jobId: job.id });
};
