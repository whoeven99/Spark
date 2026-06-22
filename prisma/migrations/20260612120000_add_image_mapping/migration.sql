-- 图片替换映射表：整图翻译完成后自动写入，供 Theme App Extension 前台替换 <img> src 使用。

-- CreateTable
CREATE TABLE "ImageMapping" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shop" TEXT NOT NULL,
    "sourceUrl" TEXT NOT NULL,
    "targetBlobPath" TEXT NOT NULL,
    "sourceCode" TEXT NOT NULL,
    "targetCode" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "ImageMapping_shop_sourceUrl_targetCode_key" ON "ImageMapping"("shop", "sourceUrl", "targetCode");

-- CreateIndex
CREATE INDEX "ImageMapping_shop_targetCode_idx" ON "ImageMapping"("shop", "targetCode");
