import { BlobServiceClient, type ContainerClient } from "@azure/storage-blob";
import { gzipSync } from "node:zlib";
import prisma from "../../db.server";
import { hashShopDomain } from "../billing/promo/shopHash.server";

const LOG = "[ShopArchive]";
const DEFAULT_BLOB_CONTAINER = "shop-archives";

export type ShopArchiveMode = "uninstall" | "shop_redact";

export type ShopArchiveResult = {
  ok: boolean;
  shopHash: string;
  blobPath: string | null;
  tableCounts: Record<string, number>;
  truncatedTables: string[];
  error?: string;
};

const ROW_CAP = 5_000;

function blobConnectionString(): string | null {
  return process.env.AZURE_BLOB_CONNECTION_STRING?.trim() || null;
}

function blobContainerName(): string {
  return (
    process.env.AZURE_BLOB_SHOP_ARCHIVES_CONTAINER?.trim() || DEFAULT_BLOB_CONTAINER
  );
}

async function getArchiveBlobContainer(): Promise<ContainerClient | null> {
  const conn = blobConnectionString();
  if (!conn) return null;
  const service = BlobServiceClient.fromConnectionString(conn);
  const container = service.getContainerClient(blobContainerName());
  await container.createIfNotExists();
  return container;
}

async function takeRows<T>(
  label: string,
  fetcher: () => Promise<T[]>,
  counts: Record<string, number>,
  truncated: string[],
): Promise<T[]> {
  const rows = await fetcher();
  counts[label] = rows.length;
  if (rows.length > ROW_CAP) {
    truncated.push(label);
    return rows.slice(0, ROW_CAP);
  }
  return rows;
}

/**
 * 把店铺业务快照写到 Azure Blob（gzip JSON，内部分析用）。
 * 未配置 Blob 时打日志，不阻断后续 Turso 删除。
 */
export async function archiveShopSnapshot(params: {
  shop: string;
  mode: ShopArchiveMode;
  reason?: string;
}): Promise<ShopArchiveResult> {
  const shop = params.shop.trim();
  const shopHash = hashShopDomain(shop);
  const archivedAt = new Date().toISOString();
  const tableCounts: Record<string, number> = {};
  const truncatedTables: string[] = [];

  try {
    const snapshot = {
      version: 1,
      shop,
      shopHash,
      mode: params.mode,
      reason: params.reason ?? null,
      archivedAt,
      tables: {
        account: await takeRows(
          "Account",
          () => prisma.account.findMany({ where: { shop } }),
          tableCounts,
          truncatedTables,
        ),
        appSubscription: await takeRows(
          "AppSubscription",
          () => prisma.appSubscription.findMany({ where: { shop } }),
          tableCounts,
          truncatedTables,
        ),
        billingLog: await takeRows(
          "BillingLog",
          () =>
            prisma.billingLog.findMany({
              where: { shop },
              orderBy: { createdAt: "desc" },
              take: ROW_CAP + 1,
            }),
          tableCounts,
          truncatedTables,
        ),
        toolTokenUsageLog: await takeRows(
          "ToolTokenUsageLog",
          () =>
            prisma.toolTokenUsageLog.findMany({
              where: { shop },
              orderBy: { createdAt: "desc" },
              take: ROW_CAP + 1,
            }),
          tableCounts,
          truncatedTables,
        ),
        overageUsageCharge: await takeRows(
          "OverageUsageCharge",
          () => prisma.overageUsageCharge.findMany({ where: { shop } }),
          tableCounts,
          truncatedTables,
        ),
        accountPeriodUsage: await takeRows(
          "AccountPeriodUsage",
          () => prisma.accountPeriodUsage.findMany({ where: { shop } }),
          tableCounts,
          truncatedTables,
        ),
        conversations: await takeRows(
          "Conversation",
          () => prisma.conversation.findMany({ where: { shop } }),
          tableCounts,
          truncatedTables,
        ),
        messages: await takeRows(
          "Message",
          () =>
            prisma.message.findMany({
              where: { conversation: { shop } },
              orderBy: { createdAt: "desc" },
              take: ROW_CAP + 1,
            }),
          tableCounts,
          truncatedTables,
        ),
        workspaceFiles: await takeRows(
          "WorkspaceFile",
          () => prisma.workspaceFile.findMany({ where: { shop } }),
          tableCounts,
          truncatedTables,
        ),
        aiTaskBatches: await takeRows(
          "AITaskBatch",
          () => prisma.aITaskBatch.findMany({ where: { shop } }),
          tableCounts,
          truncatedTables,
        ),
        aiTasks: await takeRows(
          "AITask",
          () =>
            prisma.aITask.findMany({
              where: { shop },
              orderBy: { createdAt: "desc" },
              take: ROW_CAP + 1,
            }),
          tableCounts,
          truncatedTables,
        ),
        suggestions: await takeRows(
          "Suggestion",
          () => prisma.suggestion.findMany({ where: { shop } }),
          tableCounts,
          truncatedTables,
        ),
        shopOrders: await takeRows(
          "ShopOrder",
          () =>
            prisma.shopOrder.findMany({
              where: { shop },
              orderBy: { createdAt: "desc" },
              take: ROW_CAP + 1,
            }),
          tableCounts,
          truncatedTables,
        ),
        shopOrderLineItems: await takeRows(
          "ShopOrderLineItem",
          () =>
            prisma.shopOrderLineItem.findMany({
              where: { shop },
              take: ROW_CAP + 1,
            }),
          tableCounts,
          truncatedTables,
        ),
        shopRefunds: await takeRows(
          "ShopRefund",
          () => prisma.shopRefund.findMany({ where: { shop }, take: ROW_CAP + 1 }),
          tableCounts,
          truncatedTables,
        ),
        shopRefundLineItems: await takeRows(
          "ShopRefundLineItem",
          () =>
            prisma.shopRefundLineItem.findMany({
              where: { shop },
              take: ROW_CAP + 1,
            }),
          tableCounts,
          truncatedTables,
        ),
        shopCustomers: await takeRows(
          "ShopCustomer",
          () => prisma.shopCustomer.findMany({ where: { shop }, take: ROW_CAP + 1 }),
          tableCounts,
          truncatedTables,
        ),
        shopCustomerValues: await takeRows(
          "ShopCustomerValue",
          () =>
            prisma.shopCustomerValue.findMany({
              where: { shop },
              take: ROW_CAP + 1,
            }),
          tableCounts,
          truncatedTables,
        ),
        shopInventoryLevels: await takeRows(
          "ShopInventoryLevel",
          () =>
            prisma.shopInventoryLevel.findMany({
              where: { shop },
              take: ROW_CAP + 1,
            }),
          tableCounts,
          truncatedTables,
        ),
        shopFulfillments: await takeRows(
          "ShopFulfillment",
          () =>
            prisma.shopFulfillment.findMany({
              where: { shop },
              take: ROW_CAP + 1,
            }),
          tableCounts,
          truncatedTables,
        ),
        shopSyncCheckpoints: await takeRows(
          "ShopSyncCheckpoint",
          () => prisma.shopSyncCheckpoint.findMany({ where: { shop } }),
          tableCounts,
          truncatedTables,
        ),
        operationSnapshots: await takeRows(
          "OperationDiagnosisSnapshot",
          () => prisma.operationDiagnosisSnapshot.findMany({ where: { shop } }),
          tableCounts,
          truncatedTables,
        ),
        operationTasks: await takeRows(
          "OperationTask",
          () => prisma.operationTask.findMany({ where: { shop } }),
          tableCounts,
          truncatedTables,
        ),
        shopCostConfig: await takeRows(
          "ShopCostConfig",
          () => prisma.shopCostConfig.findMany({ where: { shop } }),
          tableCounts,
          truncatedTables,
        ),
        shopSkuCosts: await takeRows(
          "ShopSkuCost",
          () => prisma.shopSkuCost.findMany({ where: { shop }, take: ROW_CAP + 1 }),
          tableCounts,
          truncatedTables,
        ),
        adCredentials: await takeRows(
          "AdPlatformCredential",
          () => prisma.adPlatformCredential.findMany({ where: { shop } }),
          tableCounts,
          truncatedTables,
        ),
        gmcProductStatus: await takeRows(
          "GmcProductStatus",
          () =>
            prisma.gmcProductStatus.findMany({
              where: { shop },
              take: ROW_CAP + 1,
            }),
          tableCounts,
          truncatedTables,
        ),
        metaProductStatus: await takeRows(
          "MetaProductStatus",
          () =>
            prisma.metaProductStatus.findMany({
              where: { shop },
              take: ROW_CAP + 1,
            }),
          tableCounts,
          truncatedTables,
        ),
        adEntities: await takeRows(
          "AdEntity",
          () => prisma.adEntity.findMany({ where: { shop }, take: ROW_CAP + 1 }),
          tableCounts,
          truncatedTables,
        ),
        adMetricDaily: await takeRows(
          "AdMetricDaily",
          () =>
            prisma.adMetricDaily.findMany({
              where: { shop },
              take: ROW_CAP + 1,
            }),
          tableCounts,
          truncatedTables,
        ),
        adInsightsSync: await takeRows(
          "AdInsightsSync",
          () => prisma.adInsightsSync.findMany({ where: { shop } }),
          tableCounts,
          truncatedTables,
        ),
        imageMappings: await takeRows(
          "ImageMapping",
          () => prisma.imageMapping.findMany({ where: { shop }, take: ROW_CAP + 1 }),
          tableCounts,
          truncatedTables,
        ),
        appVisitSources: await takeRows(
          "AppVisitSource",
          () => prisma.appVisitSource.findMany({ where: { shop }, take: ROW_CAP + 1 }),
          tableCounts,
          truncatedTables,
        ),
        supportConversations: await takeRows(
          "SupportConversation",
          () => prisma.supportConversation.findMany({ where: { shop } }),
          tableCounts,
          truncatedTables,
        ),
        supportMessages: await takeRows(
          "SupportMessage",
          () =>
            prisma.supportMessage.findMany({
              where: { conversation: { shop } },
              orderBy: { createdAt: "desc" },
              take: ROW_CAP + 1,
            }),
          tableCounts,
          truncatedTables,
        ),
        commonEventLogs: await takeRows(
          "CommonEventLog",
          () =>
            prisma.commonEventLog.findMany({
              where: { shop },
              orderBy: { createdAt: "desc" },
              take: ROW_CAP + 1,
            }),
          tableCounts,
          truncatedTables,
        ),
        sessions: await takeRows(
          "Session",
          () => prisma.session.findMany({ where: { shop } }),
          tableCounts,
          truncatedTables,
        ),
      },
      truncatedTables,
    };

    const stamp = archivedAt.replace(/[:.]/g, "-");
    const blobPath = `${shopHash}/${params.mode}-${stamp}.json.gz`;
    let uploadedPath: string | null = null;

    const container = await getArchiveBlobContainer();
    if (container) {
      const gz = gzipSync(Buffer.from(JSON.stringify(snapshot), "utf8"));
      await container.getBlockBlobClient(blobPath).uploadData(gz, {
        blobHTTPHeaders: {
          blobContentType: "application/gzip",
          blobContentEncoding: "gzip",
        },
        metadata: {
          shopHash,
          mode: params.mode,
          archivedAt,
        },
      });
      uploadedPath = blobPath;
      console.info(
        `${LOG} blob-uploaded shop=${shop} path=${blobPath} bytes=${gz.length}`,
      );
    } else {
      console.warn(`${LOG} blob skipped — AZURE_BLOB_CONNECTION_STRING missing`);
    }

    return {
      ok: Boolean(uploadedPath),
      shopHash,
      blobPath: uploadedPath,
      tableCounts,
      truncatedTables,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`${LOG} archive failed shop=${shop}:`, error);
    return {
      ok: false,
      shopHash,
      blobPath: null,
      tableCounts,
      truncatedTables,
      error: message,
    };
  }
}
