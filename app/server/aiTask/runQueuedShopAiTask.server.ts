/**
 * 店铺 AI 异步任务：排队限流 + 开跑前额度复核。
 * 没额度时 fail 当前任务并释放槽位，后续排队任务同样会在开跑时被拦下。
 */
import { BillingAccessDeniedError } from "../billing/errors.server";
import { requireBillingAccess } from "../billing/requireBilling.server";
import { requireVisualToolBillingAccess } from "../tokenUsage/index.server";
import { failTask } from "./aiTaskLogger.server";
import { getShopAiTaskLimiter } from "./concurrencyLimiter.server";

export type ShopAiTaskBillingGate = "copy" | "visual";

async function assertShopAiTaskBilling(
  shop: string,
  gate: ShopAiTaskBillingGate,
): Promise<void> {
  if (gate === "visual") {
    await requireVisualToolBillingAccess(shop);
    return;
  }
  await requireBillingAccess(shop);
}

function billingFailMessage(error: unknown): string {
  if (error instanceof BillingAccessDeniedError) {
    return error.message;
  }
  if (error instanceof Error && error.message.trim()) return error.message;
  return "Token 余额不足或尚未订阅，请前往账户页开通";
}

/**
 * 在店铺并发槽位内执行任务体；拿到槽位后先验额度，不足则 failTask 并跳过 fn。
 */
export async function runQueuedShopAiTask(params: {
  shop: string;
  taskId: string;
  startedAt: number;
  billingGate: ShopAiTaskBillingGate;
  fn: () => Promise<void>;
}): Promise<void> {
  const shop = params.shop.trim();
  await getShopAiTaskLimiter(shop).run(async () => {
    try {
      await assertShopAiTaskBilling(shop, params.billingGate);
    } catch (error) {
      const errorMsg = billingFailMessage(error);
      await failTask({
        taskId: params.taskId,
        errorMsg,
        startedAt: params.startedAt,
        finalMessage: errorMsg,
      });
      return;
    }
    await params.fn();
  });
}
