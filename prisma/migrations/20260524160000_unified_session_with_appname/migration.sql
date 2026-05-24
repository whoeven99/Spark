-- 统一 Session：appName + 时间戳；合并 Session_generate_description（turso-migrate 会跳过已存在列）
PRAGMA foreign_keys = OFF;

ALTER TABLE "Session" ADD COLUMN "appName" TEXT NOT NULL DEFAULT 'chat';
ALTER TABLE "Session" ADD COLUMN "createdAt" DATETIME NOT NULL DEFAULT '2026-05-24 00:00:00';
ALTER TABLE "Session" ADD COLUMN "updatedAt" DATETIME NOT NULL DEFAULT '2026-05-24 00:00:00';

INSERT OR IGNORE INTO "Session" (id, appName, shop, state, isOnline, scope, expires, accessToken, userId, firstName, lastName, email, accountOwner, locale, collaborator, emailVerified, refreshToken, refreshTokenExpires, createdAt, updatedAt)
SELECT id, 'product-improve', shop, state, isOnline, scope, expires, accessToken, userId, firstName, lastName, email, accountOwner, locale, collaborator, emailVerified, refreshToken, refreshTokenExpires, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "Session_generate_description";

DROP TABLE IF EXISTS "Session_generate_description";

CREATE INDEX IF NOT EXISTS "Session_appName_shop_idx" ON "Session"("appName", "shop");

PRAGMA foreign_keys = ON;
