-- The welcome and getting-started checklist; empty for accounts from before them.
ALTER TABLE "users" ADD COLUMN "onboarding" JSONB NOT NULL DEFAULT '{}';
