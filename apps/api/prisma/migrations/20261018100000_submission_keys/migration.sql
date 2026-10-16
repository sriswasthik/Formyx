-- AlterTable
ALTER TABLE "submissions" ADD COLUMN     "submission_key" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "submissions_form_id_submission_key_key" ON "submissions"("form_id", "submission_key");
