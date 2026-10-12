-- CreateEnum
CREATE TYPE "IntegrationKind" AS ENUM ('GOOGLE_SHEETS', 'NOTION');

-- CreateEnum
CREATE TYPE "IntegrationStatus" AS ENUM ('CONNECTING', 'ACTIVE', 'PAUSED', 'ERROR', 'NEEDS_RECONNECT');

-- CreateTable
CREATE TABLE "integrations" (
    "id" TEXT NOT NULL,
    "form_id" TEXT NOT NULL,
    "kind" "IntegrationKind" NOT NULL,
    "status" "IntegrationStatus" NOT NULL DEFAULT 'CONNECTING',
    "connected_by_id" TEXT,
    "account_label" TEXT,
    "credentials_encrypted" TEXT,
    "config" JSONB NOT NULL DEFAULT '{}',
    "last_synced_at" TIMESTAMP(3),
    "last_error" TEXT,
    "last_error_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "integrations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "integration_records" (
    "integration_id" TEXT NOT NULL,
    "submission_id" TEXT NOT NULL,
    "external_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "integration_records_pkey" PRIMARY KEY ("integration_id","submission_id")
);

-- CreateTable
CREATE TABLE "job_failures" (
    "id" TEXT NOT NULL,
    "queue" TEXT NOT NULL,
    "job_id" TEXT NOT NULL,
    "form_id" TEXT,
    "integration_id" TEXT,
    "webhook_id" TEXT,
    "summary" TEXT NOT NULL,
    "error" TEXT NOT NULL,
    "attempts" INTEGER NOT NULL,
    "data" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolved_at" TIMESTAMP(3),

    CONSTRAINT "job_failures_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "integrations_form_id_kind_key" ON "integrations"("form_id", "kind");

-- CreateIndex
CREATE INDEX "job_failures_form_id_resolved_at_created_at_idx" ON "job_failures"("form_id", "resolved_at", "created_at" DESC);

-- AddForeignKey
ALTER TABLE "integrations" ADD CONSTRAINT "integrations_form_id_fkey" FOREIGN KEY ("form_id") REFERENCES "forms"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "integrations" ADD CONSTRAINT "integrations_connected_by_id_fkey" FOREIGN KEY ("connected_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "integration_records" ADD CONSTRAINT "integration_records_integration_id_fkey" FOREIGN KEY ("integration_id") REFERENCES "integrations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "integration_records" ADD CONSTRAINT "integration_records_submission_id_fkey" FOREIGN KEY ("submission_id") REFERENCES "submissions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "job_failures" ADD CONSTRAINT "job_failures_form_id_fkey" FOREIGN KEY ("form_id") REFERENCES "forms"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "job_failures" ADD CONSTRAINT "job_failures_integration_id_fkey" FOREIGN KEY ("integration_id") REFERENCES "integrations"("id") ON DELETE SET NULL ON UPDATE CASCADE;
