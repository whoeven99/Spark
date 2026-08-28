-- AlterTable Conversation: persist workspace context (products/orders/files) per conversation
ALTER TABLE "Conversation" ADD COLUMN "contextJson" TEXT;
