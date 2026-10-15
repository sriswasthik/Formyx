-- Accounts made through Google or Zoho may have no password.
ALTER TABLE "users" ALTER COLUMN "password_hash" DROP NOT NULL;

-- The Google and Zoho accounts people sign in with.
CREATE TABLE "sign_in_identities" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sign_in_identities_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "sign_in_identities_provider_subject_key" ON "sign_in_identities"("provider", "subject");
CREATE INDEX "sign_in_identities_user_id_idx" ON "sign_in_identities"("user_id");

ALTER TABLE "sign_in_identities" ADD CONSTRAINT "sign_in_identities_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
