import { data } from "react-router";
import { z } from "zod";
import { authenticate } from "../../shopify.server";
import { completeTask } from "../aiTask/aiTaskLogger.server";
import { getTaskForShop } from "../aiTask/aiTaskStore.server";
import { resolveUiLocale } from "../../i18n/resolveUiLocale.server";
import { initI18n } from "../../i18n";
import { buildAITaskMessage } from "../../lib/aiTaskMessage";
import { decideEmptyImportReview } from "../../lib/productImportEmptyReview";

const bodySchema = z.object({
  taskId: z.string().min(1),
  completeReview: z.literal(true),
});

export async function completeEmptyProductImportReview(
  request: Request,
): Promise<ReturnType<typeof data>> {
  const fail = (error: string, status: number) =>
    data<{ ok: false; error: string }>({ ok: false, error }, { status });

  const { admin, session } = await authenticate.admin(request);
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return fail("Invalid JSON", 400);
  }
  const parsed = bodySchema.safeParse(raw);
  if (!parsed.success) return fail("缺少 taskId", 400);

  const task = await getTaskForShop({ taskId: parsed.data.taskId, shop: session.shop });
  if (!task || task.taskType !== "product_import") return fail("任务不存在", 404);

  const decision = decideEmptyImportReview({
    taskType: task.taskType,
    status: task.status,
    rawResult: task.result,
  });
  if (decision === "already_completed") {
    return data({ ok: true, status: task.status });
  }
  if (decision === "has_writes") {
    return fail("还有可写回的变更，请先确认写回", 409);
  }
  if (decision !== "complete") {
    return fail("该任务当前状态不可完成审核", 409);
  }

  const locale = await resolveUiLocale(request, {
    admin,
    shop: session.shop,
    logContext: `product-import-complete shop=${session.shop}`,
  });
  const i18n = initI18n(locale);
  const t = i18n.t.bind(i18n);
  await completeTask({
    taskId: task.id,
    result: task.result ?? {},
    finalMessage: buildAITaskMessage(
      "productImport.logReviewCompleted",
      t("productImport.logReviewCompleted"),
    ),
  });
  return data({ ok: true, status: "succeeded" });
}
