-- AlterTable
ALTER TABLE "forms" ADD COLUMN     "published_title" TEXT;

-- AlterTable
ALTER TABLE "submissions" ADD COLUMN     "completion_time_ms" INTEGER;

-- CreateTable
CREATE TABLE "form_views" (
    "id" TEXT NOT NULL,
    "form_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "form_views_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "form_views_form_id_created_at_idx" ON "form_views"("form_id", "created_at");

-- AddForeignKey
ALTER TABLE "form_views" ADD CONSTRAINT "form_views_form_id_fkey" FOREIGN KEY ("form_id") REFERENCES "forms"("id") ON DELETE CASCADE ON UPDATE CASCADE;
