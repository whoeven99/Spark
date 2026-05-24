-- 1. Add appName column to Session table with default value
ALTER TABLE "Session" ADD COLUMN "appName" TEXT NOT NULL DEFAULT 'chat';
ALTER TABLE "Session" ADD COLUMN "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "Session" ADD COLUMN "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- 2. Migrate data from ProductImproveSession (Session_generate_description) to Session
INSERT INTO "Session" (id, appName, shop, state, isOnline, scope, expires, accessToken, userId, firstName, lastName, email, accountOwner, locale, collaborator, emailVerified, refreshToken, refreshTokenExpires, createdAt, updatedAt)
SELECT id, 'product-improve', shop, state, isOnline, scope, expires, accessToken, userId, firstName, lastName, email, accountOwner, locale, collaborator, emailVerified, refreshToken, refreshTokenExpires, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "Session_generate_description"
WHERE id NOT IN (SELECT id FROM "Session" WHERE appName = 'product-improve');

-- 3. Drop ProductImproveSession table
DROP TABLE "Session_generate_description";

-- 4. Create index for performance
CREATE INDEX "Session_appName_shop_idx" ON "Session"("appName", "shop");
