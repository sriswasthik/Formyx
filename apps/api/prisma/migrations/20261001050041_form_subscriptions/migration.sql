-- CreateTable
CREATE TABLE "form_subscriptions" (
    "user_id" TEXT NOT NULL,
    "form_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "form_subscriptions_pkey" PRIMARY KEY ("user_id","form_id")
);

-- CreateIndex
CREATE INDEX "form_subscriptions_form_id_idx" ON "form_subscriptions"("form_id");

-- AddForeignKey
ALTER TABLE "form_subscriptions" ADD CONSTRAINT "form_subscriptions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "form_subscriptions" ADD CONSTRAINT "form_subscriptions_form_id_fkey" FOREIGN KEY ("form_id") REFERENCES "forms"("id") ON DELETE CASCADE ON UPDATE CASCADE;
