-- AlterTable
ALTER TABLE "form_views" ADD COLUMN     "completed_at" TIMESTAMP(3),
ADD COLUMN     "furthest_field" TEXT,
ADD COLUMN     "furthest_page" TEXT,
ADD COLUMN     "token" TEXT;

-- AlterTable
ALTER TABLE "submissions" ADD COLUMN     "outcome" JSONB;

-- CreateTable
CREATE TABLE "form_drafts" (
    "id" TEXT NOT NULL,
    "form_id" TEXT NOT NULL,
    "token_hash" TEXT NOT NULL,
    "answers" JSONB NOT NULL,
    "state" JSONB NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "form_drafts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "form_drafts_token_hash_key" ON "form_drafts"("token_hash");

-- CreateIndex
CREATE INDEX "form_drafts_form_id_idx" ON "form_drafts"("form_id");

-- CreateIndex
CREATE INDEX "form_drafts_expires_at_idx" ON "form_drafts"("expires_at");

-- CreateIndex
CREATE UNIQUE INDEX "form_views_token_key" ON "form_views"("token");

-- AddForeignKey
ALTER TABLE "form_drafts" ADD CONSTRAINT "form_drafts_form_id_fkey" FOREIGN KEY ("form_id") REFERENCES "forms"("id") ON DELETE CASCADE ON UPDATE CASCADE;

