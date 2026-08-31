import prisma from "../../db.server";

const LOG = "[ShopPurge]";

export type ShopPurgeResult = {
  shop: string;
  deleted: Record<string, number>;
  errors: string[];
};

type DeleteStep = {
  label: string;
  run: () => Promise<{ count: number }>;
};

/**
 * 从 Turso 删除店铺业务数据。
 * 默认不删除：PromoClaimLedger（防薅）、CommonEventLog（卸载幂等/审计）、
 * PlanCatalog / TokenBillingRule 等全局表。
 * `shop/redact` 可传 deleteCommonEventLog 清审计日志。
 */
export async function purgeShopDataFromTurso(
  shop: string,
  options?: { deleteCommonEventLog?: boolean },
): Promise<ShopPurgeResult> {
  const normalized = shop.trim();
  const deleted: Record<string, number> = {};
  const errors: string[] = [];

  const steps: DeleteStep[] = [
    {
      label: "SupportMessage",
      run: () =>
        prisma.supportMessage.deleteMany({
          where: { conversation: { shop: normalized } },
        }),
    },
    {
      label: "SupportConversation",
      run: () => prisma.supportConversation.deleteMany({ where: { shop: normalized } }),
    },
    {
      label: "Message",
      run: () =>
        prisma.message.deleteMany({
          where: { conversation: { shop: normalized } },
        }),
    },
    {
      label: "Conversation",
      run: () => prisma.conversation.deleteMany({ where: { shop: normalized } }),
    },
    {
      label: "WorkspaceFile",
      run: () => prisma.workspaceFile.deleteMany({ where: { shop: normalized } }),
    },
    {
      // AITaskLog cascades from AITask
      label: "AITask",
      run: () => prisma.aITask.deleteMany({ where: { shop: normalized } }),
    },
    {
      label: "AITaskBatch",
      run: () => prisma.aITaskBatch.deleteMany({ where: { shop: normalized } }),
    },
    {
      label: "Suggestion",
      run: () => prisma.suggestion.deleteMany({ where: { shop: normalized } }),
    },
    {
      label: "ShopFulfillment",
      run: () => prisma.shopFulfillment.deleteMany({ where: { shop: normalized } }),
    },
    {
      label: "ShopRefundLineItem",
      run: () => prisma.shopRefundLineItem.deleteMany({ where: { shop: normalized } }),
    },
    {
      label: "ShopRefund",
      run: () => prisma.shopRefund.deleteMany({ where: { shop: normalized } }),
    },
    {
      label: "ShopOrderLineItem",
      run: () => prisma.shopOrderLineItem.deleteMany({ where: { shop: normalized } }),
    },
    {
      label: "ShopOrder",
      run: () => prisma.shopOrder.deleteMany({ where: { shop: normalized } }),
    },
    {
      label: "ShopCustomerValue",
      run: () => prisma.shopCustomerValue.deleteMany({ where: { shop: normalized } }),
    },
    {
      label: "ShopCustomer",
      run: () => prisma.shopCustomer.deleteMany({ where: { shop: normalized } }),
    },
    {
      label: "ShopInventoryLevel",
      run: () => prisma.shopInventoryLevel.deleteMany({ where: { shop: normalized } }),
    },
    {
      label: "ShopSyncCheckpoint",
      run: () => prisma.shopSyncCheckpoint.deleteMany({ where: { shop: normalized } }),
    },
    {
      label: "OperationTask",
      run: () => prisma.operationTask.deleteMany({ where: { shop: normalized } }),
    },
    {
      label: "OperationDiagnosisItem",
      run: () =>
        prisma.operationDiagnosisItem.deleteMany({ where: { shop: normalized } }),
    },
    {
      label: "OperationDiagnosisSnapshot",
      run: () =>
        prisma.operationDiagnosisSnapshot.deleteMany({ where: { shop: normalized } }),
    },
    {
      label: "ShopSkuCost",
      run: () => prisma.shopSkuCost.deleteMany({ where: { shop: normalized } }),
    },
    {
      label: "ShopCostConfig",
      run: () => prisma.shopCostConfig.deleteMany({ where: { shop: normalized } }),
    },
    {
      label: "AdMetricDaily",
      run: () => prisma.adMetricDaily.deleteMany({ where: { shop: normalized } }),
    },
    {
      label: "AdEntity",
      run: () => prisma.adEntity.deleteMany({ where: { shop: normalized } }),
    },
    {
      label: "AdInsightsSync",
      run: () => prisma.adInsightsSync.deleteMany({ where: { shop: normalized } }),
    },
    {
      label: "GmcProductStatus",
      run: () => prisma.gmcProductStatus.deleteMany({ where: { shop: normalized } }),
    },
    {
      label: "MetaProductStatus",
      run: () => prisma.metaProductStatus.deleteMany({ where: { shop: normalized } }),
    },
    {
      label: "AdPlatformCredential",
      run: () => prisma.adPlatformCredential.deleteMany({ where: { shop: normalized } }),
    },
    {
      label: "ImageMapping",
      run: () => prisma.imageMapping.deleteMany({ where: { shop: normalized } }),
    },
    {
      label: "AppVisitSource",
      run: () => prisma.appVisitSource.deleteMany({ where: { shop: normalized } }),
    },
    {
      label: "ToolTokenUsageLog",
      run: () => prisma.toolTokenUsageLog.deleteMany({ where: { shop: normalized } }),
    },
    {
      label: "OverageUsageCharge",
      run: () => prisma.overageUsageCharge.deleteMany({ where: { shop: normalized } }),
    },
    {
      label: "AccountPeriodUsage",
      run: () => prisma.accountPeriodUsage.deleteMany({ where: { shop: normalized } }),
    },
    {
      label: "BillingLog",
      run: () => prisma.billingLog.deleteMany({ where: { shop: normalized } }),
    },
    {
      label: "AppSubscription",
      run: () => prisma.appSubscription.deleteMany({ where: { shop: normalized } }),
    },
    {
      label: "Account",
      run: () => prisma.account.deleteMany({ where: { shop: normalized } }),
    },
    {
      label: "Session",
      run: () => prisma.session.deleteMany({ where: { shop: normalized } }),
    },
  ];

  if (options?.deleteCommonEventLog) {
    steps.splice(steps.length - 1, 0, {
      label: "CommonEventLog",
      run: () => prisma.commonEventLog.deleteMany({ where: { shop: normalized } }),
    });
  }

  for (const step of steps) {
    try {
      const result = await step.run();
      deleted[step.label] = result.count;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      errors.push(`${step.label}: ${message}`);
      console.error(`${LOG} step failed shop=${normalized} table=${step.label}:`, error);
    }
  }

  console.info(
    `${LOG} done shop=${normalized} tables=${Object.keys(deleted).length} errors=${errors.length}`,
  );
  return { shop: normalized, deleted, errors };
}
