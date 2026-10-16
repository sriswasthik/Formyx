-- AlterTable
ALTER TABLE "forms" ADD COLUMN     "retired_fields" JSONB NOT NULL DEFAULT '[]';
