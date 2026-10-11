-- AlterTable
ALTER TABLE "forms" ADD COLUMN     "discord_webhook_encrypted" TEXT,
ADD COLUMN     "last_digest_at" TIMESTAMP(3),
ADD COLUMN     "live_settings" JSONB NOT NULL DEFAULT '{}',
ADD COLUMN     "password_hash" TEXT,
ADD COLUMN     "password_version" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "slack_webhook_encrypted" TEXT;

-- AlterTable
ALTER TABLE "submissions" ADD COLUMN     "edit_token_hash" TEXT,
ADD COLUMN     "edited_at" TIMESTAMP(3),
ADD COLUMN     "respondent_email" TEXT,
ADD COLUMN     "respondent_key" TEXT;

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "password_version" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "preferences" JSONB NOT NULL DEFAULT '{}';

-- AlterTable
ALTER TABLE "workspaces" ADD COLUMN     "preferences" JSONB NOT NULL DEFAULT '{}';

-- CreateTable
CREATE TABLE "form_slugs" (
    "slug" TEXT NOT NULL,
    "form_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "form_slugs_pkey" PRIMARY KEY ("slug")
);

-- CreateTable
CREATE TABLE "respondent_verifications" (
    "id" TEXT NOT NULL,
    "form_id" TEXT NOT NULL,
    "email_hash" TEXT NOT NULL,
    "code_hash" TEXT NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "respondent_verifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "autoresponder_sends" (
    "id" TEXT NOT NULL,
    "form_id" TEXT NOT NULL,
    "email_hash" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "autoresponder_sends_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "form_slugs_form_id_idx" ON "form_slugs"("form_id");

-- CreateIndex
CREATE INDEX "respondent_verifications_form_id_email_hash_idx" ON "respondent_verifications"("form_id", "email_hash");

-- CreateIndex
CREATE INDEX "respondent_verifications_expires_at_idx" ON "respondent_verifications"("expires_at");

-- CreateIndex
CREATE INDEX "autoresponder_sends_form_id_email_hash_created_at_idx" ON "autoresponder_sends"("form_id", "email_hash", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "submissions_edit_token_hash_key" ON "submissions"("edit_token_hash");

-- CreateIndex
CREATE UNIQUE INDEX "submissions_form_id_respondent_key_key" ON "submissions"("form_id", "respondent_key");

-- AddForeignKey
ALTER TABLE "form_slugs" ADD CONSTRAINT "form_slugs_form_id_fkey" FOREIGN KEY ("form_id") REFERENCES "forms"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "respondent_verifications" ADD CONSTRAINT "respondent_verifications_form_id_fkey" FOREIGN KEY ("form_id") REFERENCES "forms"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "autoresponder_sends" ADD CONSTRAINT "autoresponder_sends_form_id_fkey" FOREIGN KEY ("form_id") REFERENCES "forms"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Sprint 14 moves the response limit and closing time out of the form schema into live
-- settings, which take effect without publishing. Copy them across from what was in effect:
-- the published snapshot, or the draft of a form never published.
UPDATE "forms"
SET "live_settings" = jsonb_build_object(
  'access',
  jsonb_strip_nulls(jsonb_build_object(
    'oneResponsePer', 'off',
    'requireEmail', false,
    'allowEdits', false,
    'unlisted', true,
    'responseLimit', COALESCE("published_schema", "draft_schema") -> 'settings' -> 'closeAfterResponses',
    'closesAt', COALESCE("published_schema", "draft_schema") -> 'settings' -> 'closeAt'
  ))
)
WHERE COALESCE("published_schema", "draft_schema") -> 'settings' ?| array['closeAfterResponses', 'closeAt'];
