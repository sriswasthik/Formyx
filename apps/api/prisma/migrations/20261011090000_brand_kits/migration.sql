-- AlterTable
ALTER TABLE "workspaces" ADD COLUMN     "default_brand_kit_id" TEXT;

-- CreateTable
CREATE TABLE "brand_kits" (
    "id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "kit" JSONB NOT NULL,
    "created_by_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "brand_kits_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "brand_kits_workspace_id_created_at_idx" ON "brand_kits"("workspace_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "brand_kits_created_by_id_idx" ON "brand_kits"("created_by_id");

-- CreateIndex
CREATE UNIQUE INDEX "workspaces_default_brand_kit_id_key" ON "workspaces"("default_brand_kit_id");

-- AddForeignKey
ALTER TABLE "workspaces" ADD CONSTRAINT "workspaces_default_brand_kit_id_fkey" FOREIGN KEY ("default_brand_kit_id") REFERENCES "brand_kits"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "brand_kits" ADD CONSTRAINT "brand_kits_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "brand_kits" ADD CONSTRAINT "brand_kits_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

