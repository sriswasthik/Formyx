-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "form_status" ADD VALUE 'UNDER_REVIEW';
ALTER TYPE "form_status" ADD VALUE 'SUSPENDED';

-- AlterTable
ALTER TABLE "forms" ADD COLUMN     "moderation" JSONB NOT NULL DEFAULT '{}';

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "email_verified_at" TIMESTAMP(3),
ADD COLUMN     "suspended_at" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "form_reports" (
    "id" TEXT NOT NULL,
    "form_id" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "details" TEXT,
    "reporter_hash" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolved_at" TIMESTAMP(3),
    "resolution" TEXT,
    "resolved_by_id" TEXT,

    CONSTRAINT "form_reports_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "form_reports_resolved_at_created_at_idx" ON "form_reports"("resolved_at", "created_at" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "form_reports_form_id_reporter_hash_key" ON "form_reports"("form_id", "reporter_hash");

-- AddForeignKey
ALTER TABLE "form_reports" ADD CONSTRAINT "form_reports_form_id_fkey" FOREIGN KEY ("form_id") REFERENCES "forms"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "form_reports" ADD CONSTRAINT "form_reports_resolved_by_id_fkey" FOREIGN KEY ("resolved_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Accounts from before email verification count as confirmed, so turning it on (see
-- REQUIRE_EMAIL_VERIFICATION) never stops anyone already here from publishing.
UPDATE "users" SET "email_verified_at" = "created_at" WHERE "email_verified_at" IS NULL;
