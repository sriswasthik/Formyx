-- CreateEnum
CREATE TYPE "form_status" AS ENUM ('DRAFT', 'PUBLISHED', 'CLOSED');

-- CreateTable
CREATE TABLE "forms" (
    "id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "status" "form_status" NOT NULL DEFAULT 'DRAFT',
    "draft_schema" JSONB NOT NULL,
    "published_schema" JSONB,
    "theme" JSONB NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "published_at" TIMESTAMP(3),
    "created_by_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "forms_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "submissions" (
    "id" TEXT NOT NULL,
    "form_id" TEXT NOT NULL,
    "answers" JSONB NOT NULL,
    "metadata" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "submissions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "forms_slug_key" ON "forms"("slug");

-- CreateIndex
CREATE INDEX "forms_workspace_id_updated_at_idx" ON "forms"("workspace_id", "updated_at" DESC);

-- CreateIndex
CREATE INDEX "forms_workspace_id_status_idx" ON "forms"("workspace_id", "status");

-- CreateIndex
CREATE INDEX "forms_created_by_id_idx" ON "forms"("created_by_id");

-- CreateIndex
CREATE INDEX "submissions_form_id_created_at_idx" ON "submissions"("form_id", "created_at" DESC);

-- AddForeignKey
ALTER TABLE "forms" ADD CONSTRAINT "forms_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "forms" ADD CONSTRAINT "forms_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "submissions" ADD CONSTRAINT "submissions_form_id_fkey" FOREIGN KEY ("form_id") REFERENCES "forms"("id") ON DELETE CASCADE ON UPDATE CASCADE;
