-- WorkspaceFile 初版迁移缺少 mimeType / originalBlobPath，为已应用旧迁移的库补列。
ALTER TABLE "WorkspaceFile" ADD COLUMN "mimeType" TEXT NOT NULL DEFAULT '';
ALTER TABLE "WorkspaceFile" ADD COLUMN "originalBlobPath" TEXT NOT NULL DEFAULT '';
