-- CreateTable
CREATE TABLE "AppVisitSource" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shop" TEXT NOT NULL,
    "appName" TEXT NOT NULL,
    "path" TEXT NOT NULL,
    "utm" TEXT NOT NULL,
    "query" TEXT,
    "referer" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE INDEX "AppVisitSource_shop_createdAt_idx" ON "AppVisitSource"("shop", "createdAt");

-- CreateIndex
CREATE INDEX "AppVisitSource_appName_utm_createdAt_idx" ON "AppVisitSource"("appName", "utm", "createdAt");

-- CreateIndex
CREATE INDEX "AppVisitSource_utm_path_idx" ON "AppVisitSource"("utm", "path");
