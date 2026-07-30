-- AlterTable: Session 新增店铺基础信息缓存字段
ALTER TABLE "Session" ADD COLUMN "shopName" TEXT;
ALTER TABLE "Session" ADD COLUMN "shopOwnerName" TEXT;
