-- Referral links, and what brought each account.
ALTER TABLE "users" ADD COLUMN "referral_code" TEXT;
ALTER TABLE "users" ADD COLUMN "signup_source" TEXT;
CREATE UNIQUE INDEX "users_referral_code_key" ON "users"("referral_code");

-- Who signed up through whose link, and the reward for it.
CREATE TABLE "referrals" (
    "id" TEXT NOT NULL,
    "referrer_id" TEXT NOT NULL,
    "friend_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "rewarded_at" TIMESTAMP(3),
    "reward" TEXT,
    "reward_workspace_id" TEXT,
    "paused_subscription_id" TEXT,
    "resume_at" TIMESTAMP(3),
    "resumed_at" TIMESTAMP(3),

    CONSTRAINT "referrals_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "referrals_friend_id_key" ON "referrals"("friend_id");
CREATE INDEX "referrals_referrer_id_idx" ON "referrals"("referrer_id");
CREATE INDEX "referrals_resume_at_idx" ON "referrals"("resume_at");

ALTER TABLE "referrals" ADD CONSTRAINT "referrals_referrer_id_fkey" FOREIGN KEY ("referrer_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "referrals" ADD CONSTRAINT "referrals_friend_id_fkey" FOREIGN KEY ("friend_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
