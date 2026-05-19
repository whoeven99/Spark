-- App 生命周期与通用事件流水（安装、卸载、scope 变更等；与 BillingLog 分离）
CREATE TABLE "CommonEventLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shop" TEXT NOT NULL,
    "appName" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "topic" TEXT,
    "referenceId" TEXT,
    "payload" JSON,
    "metadata" JSON,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX "CommonEventLog_shop_appName_createdAt_idx" ON "CommonEventLog"("shop", "appName", "createdAt");
CREATE INDEX "CommonEventLog_eventType_createdAt_idx" ON "CommonEventLog"("eventType", "createdAt");
CREATE INDEX "CommonEventLog_referenceId_idx" ON "CommonEventLog"("referenceId");
