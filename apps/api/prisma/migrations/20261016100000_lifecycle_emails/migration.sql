-- When each account last used the app, for the "we miss you" email.
ALTER TABLE "users" ADD COLUMN "last_active_at" TIMESTAMP(3);
CREATE INDEX "users_last_active_at_idx" ON "users"("last_active_at");

-- Lifecycle emails sent, each kind once per account and period.
CREATE TABLE "lifecycle_emails" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "period_key" TEXT NOT NULL DEFAULT '',
    "sent_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "lifecycle_emails_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "lifecycle_emails_user_id_kind_period_key_key" ON "lifecycle_emails"("user_id", "kind", "period_key");

ALTER TABLE "lifecycle_emails" ADD CONSTRAINT "lifecycle_emails_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
