-- CreateEnum
CREATE TYPE "data_export_status" AS ENUM ('PENDING', 'READY', 'FAILED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "data_request_kind" AS ENUM ('ACCOUNT_EXPORT', 'ACCOUNT_DELETION', 'RESPONDENT_LOOKUP', 'RESPONDENT_DELETION');

-- CreateEnum
CREATE TYPE "data_request_status" AS ENUM ('OPEN', 'DONE', 'CANCELLED', 'FAILED');

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "deletion_plan" JSONB,
ADD COLUMN     "deletion_scheduled_for" TIMESTAMP(3),
ADD COLUMN     "deletion_undo_hash" TEXT;

-- CreateTable
CREATE TABLE "data_exports" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "status" "data_export_status" NOT NULL DEFAULT 'PENDING',
    "archive" BYTEA,
    "bytes" INTEGER,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ready_at" TIMESTAMP(3),

    CONSTRAINT "data_exports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "data_requests" (
    "id" TEXT NOT NULL,
    "kind" "data_request_kind" NOT NULL,
    "status" "data_request_status" NOT NULL DEFAULT 'OPEN',
    "user_id" TEXT,
    "workspace_id" TEXT,
    "subject_hash" TEXT,
    "details" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMP(3),

    CONSTRAINT "data_requests_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "data_exports_user_id_created_at_idx" ON "data_exports"("user_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "data_exports_expires_at_idx" ON "data_exports"("expires_at");

-- CreateIndex
CREATE INDEX "data_requests_created_at_idx" ON "data_requests"("created_at" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "users_deletion_undo_hash_key" ON "users"("deletion_undo_hash");

-- CreateIndex
CREATE INDEX "users_deletion_scheduled_for_idx" ON "users"("deletion_scheduled_for");

-- AddForeignKey
ALTER TABLE "data_exports" ADD CONSTRAINT "data_exports_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "data_requests" ADD CONSTRAINT "data_requests_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

