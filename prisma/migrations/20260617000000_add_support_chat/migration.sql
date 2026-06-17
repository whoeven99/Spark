-- CreateTable
CREATE TABLE "SupportConversation" (
    "id"            TEXT NOT NULL PRIMARY KEY,
    "shop"          TEXT NOT NULL,
    "contactEmail"  TEXT,
    "shopEmail"     TEXT,
    "status"        TEXT NOT NULL DEFAULT 'open',
    "lastMessage"   TEXT NOT NULL DEFAULT '',
    "lastMessageAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "unreadForOps"  INTEGER NOT NULL DEFAULT 0,
    "unreadForShop" INTEGER NOT NULL DEFAULT 0,
    "createdAt"     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"     DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "SupportMessage" (
    "id"             TEXT NOT NULL PRIMARY KEY,
    "conversationId" TEXT NOT NULL,
    "sender"         TEXT NOT NULL,
    "senderName"     TEXT,
    "content"        TEXT NOT NULL,
    "payloads"       TEXT,
    "createdAt"      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SupportMessage_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "SupportConversation" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "SupportConversation_shop_key" ON "SupportConversation"("shop");

-- CreateIndex
CREATE INDEX "SupportConversation_status_lastMessageAt_idx" ON "SupportConversation"("status", "lastMessageAt");

-- CreateIndex
CREATE INDEX "SupportMessage_conversationId_createdAt_idx" ON "SupportMessage"("conversationId", "createdAt");
