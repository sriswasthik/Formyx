-- CreateEnum
CREATE TYPE "plan" AS ENUM ('FREE', 'PRO', 'BUSINESS');

-- CreateEnum
CREATE TYPE "plan_status" AS ENUM ('ACTIVE', 'TRIALING', 'PAST_DUE', 'CANCELED');

-- AlterTable
ALTER TABLE "workspaces" ADD COLUMN     "plan" "plan" NOT NULL DEFAULT 'FREE',
ADD COLUMN     "plan_status" "plan_status" NOT NULL DEFAULT 'ACTIVE',
ADD COLUMN     "trial_ends_at" TIMESTAMP(3);
