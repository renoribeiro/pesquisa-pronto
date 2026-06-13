-- CreateExtension
CREATE EXTENSION IF NOT EXISTS vector;

-- AlterTable
ALTER TABLE "dispatch_batches" ADD COLUMN "config" JSONB;

-- AlterTable
ALTER TABLE "ai_analyses" ADD COLUMN "embedding" vector(1536);
