# Launch checklist

What has to be true before Formyx takes real customers and real money, and how to check it.
The code does what it can (tests, guards, a nightly workflow); the steps here happen in
dashboards and need a person. Tick them in order.

## 1. Business details and policies

- [ ] Fill in the placeholders in `apps/web/src/features/legal/site-config.ts`: the business
      name (`legalName`), registered address (`address`) and the city whose courts settle
      disputes (`courts`). Then remove them from the expected list in
      `apps/web/src/features/legal/legal.test.tsx`, which fails until both agree.
- [ ] Check `refundWindowDays` (7 days of the first payment for a plan, refunded in full) is the
      policy you want, and `supportHours` / `replyWithin` match what you can answer.
- [ ] Have the Terms, Privacy, Refund and Shipping pages (`/terms`, `/privacy`, `/refunds`,
      `/shipping`) read by someone qualified. They are plain-English drafts that match what the
      product does, not legal advice.
- [ ] Razorpay's website check wants Contact, Terms, Privacy, Refund/Cancellation and
      Shipping/Delivery pages reachable from the homepage: all five are in the footer.

## 2. Backups, checked by a restore every night

`.github/workflows/backup.yml` runs at 03:00 IST: it dumps the `public` schema with a role that
can only read, encrypts the dump (AES-256, `gpg`), keeps it as a workflow artifact for 30 days,
then restores the encrypted copy into a throwaway Postgres 17 and checks it
(`.github/scripts/verify-backup.sh`): every key table back with at least 95% of the rows
production had just before, none empty that wasn't, and every applied migration known to the
repository. A failed run emails the repository's owners.

- [ ] Make the read-only role in Neon (SQL editor, as the database owner):

  ```sql
  CREATE ROLE formyx_backup WITH LOGIN PASSWORD '<a long random password>';
  GRANT pg_read_all_data TO formyx_backup;
  ```

- [ ] In GitHub, Settings → Secrets and variables → Actions, add:
  - `BACKUP_DATABASE_URL`: the **direct** (not pooled) connection string, with `formyx_backup`
    as the user and `?sslmode=require`.
  - `BACKUP_PASSPHRASE`: a long random passphrase. Keep a copy in your password manager: the
    backups are useless without it.
- [ ] Actions → Nightly backup → Run workflow, and see it pass once.
- [ ] Practise a restore. Download the `database-backup` artifact, then:

  ```sh
  gpg --decrypt --output formyx.dump formyx-<date>.dump.gpg
  # Into a new Neon branch (or any empty Postgres 17 database):
  pg_restore --clean --if-exists --no-owner --no-privileges --dbname "<branch url>" formyx.dump
  ```

  Neon's own point-in-time restore (history retention depends on the Neon plan) is the faster
  way back from a mistake made minutes ago; these dumps cover losing the project itself.

## 3. Uptime monitoring

`GET /api/health` says the process is up (Render's health check). `GET /api/health/ready` also
checks the database answers within 2 seconds: 200 `{ "status": "ready" }`, or 503.

- [ ] In UptimeRobot or Better Stack (both have free tiers), add HTTP monitors every minute or
      two, alerting by email:
  - `https://<api host>/api/health/ready`, expecting 200;
  - the site's homepage, expecting 200;
  - one published form, `https://<site>/f/<slug>`, expecting 200.
- [ ] Add the site to a status page if you want one to share.

## 4. Error alerts by email

Both apps report errors to Sentry (`SENTRY_DSN`, `VITE_SENTRY_DSN`), with personal details
removed first. Besides crashes and bugs, background jobs that are Formyx's own work (payments
from Razorpay, the hourly upkeep, lifecycle emails) are reported when they give up for good
(`alert: true` in `apps/api/src/jobs/job-types.ts`).

- [ ] In each Sentry project, Alerts → Create alert:
  - "A new issue is created" → email you;
  - "Number of events in an issue is more than 20 in 1 hour" → email you.
- [ ] Turn on Sentry's weekly report email.

## 5. Rate limits (reviewed for launch)

Every endpoint is counted by an API-wide limit (`API_RATE_LIMIT_MAX`, 3000 per 15 minutes per
IP), except public ones, which each have their own; `apps/api/src/routes/authorization.test.ts`
fails if a new endpoint has neither. Counters live in memory, which suits one API instance:
running several needs a shared store (Redis) first.

| Endpoint                    | Limit per IP                                        | Why                               |
| --------------------------- | --------------------------------------------------- | --------------------------------- |
| Sign-up, demo sign-in       | `AUTH_RATE_LIMIT_MAX` (10) / 15 min                 | Slows mass account creation       |
| Log in, password changes    | 10 failed / 15 min                                  | Slows password guessing           |
| Form submissions            | `SUBMISSION_RATE_LIMIT_MAX` (10) / 15 min, per form | Spam                              |
| Form loads, views, progress | 100–600 / 15 min, per form                          | Generous: real traffic            |
| Verification codes          | 5 sent, 20 checked / 15 min, per form               | Each code is an email             |
| Unsubscribe, resubscribe    | 30 / 15 min                                         | Quiet; tokens are signed          |
| Referral code lookup        | 30 / 15 min                                         | Codes can't be enumerated in bulk |
| `/api/health/ready`         | 120 / 15 min                                        | Uptime monitors only              |

- [ ] Set `TRUST_PROXY=1` on Render, so limits count the visitor's IP, not Render's proxy.

## 6. Environment variables

`apps/api/src/config/env.test.ts` fails if `apps/api/.env.example` and the settings the API reads
ever differ. For production:

- [ ] API (Render): `NODE_ENV=production`, `APP_URL` and `CORS_ORIGIN` (the site's address),
      `TRUST_PROXY=1`, a 32+ character `JWT_SECRET`, `ENCRYPTION_KEYS` (from
      `pnpm --filter @formyx/api keys:new`), `RESEND_API_KEY` with `EMAIL_FROM` on a domain
      verified in Resend, `SENTRY_DSN`, `POSTHOG_KEY`, Cloudinary, Google and Notion
      credentials, and `FEEDBACK_EMAIL`.
- [ ] Web (Vercel): `API_URL`, `VITE_APP_URL`, `VITE_REALTIME_URL`, `VITE_SENTRY_DSN`.
- [ ] No secret is in any `.env.example` (they hold names and safe defaults only).
- [ ] `ENTITLEMENTS_MODE`: production is `all_unlocked` during the beta. Switch it to `enforced`
      when plans should count; trials, and referred friends' longer trials, only start then.

## 7. Razorpay: a last test-mode run, then live keys

The API refuses live keys (`rzp_live_…`) unless `RAZORPAY_LIVE=true`, and refuses test keys once
it is, so the switch is deliberate and in one place.

- [ ] On staging (test keys, `ENTITLEMENTS_MODE=enforced`), run through once more:
  - subscribe to Pro monthly with a test card, and see the webhook move the workspace to Pro;
  - upgrade to Business, cancel at the period's end, and resume;
  - let a payment fail (Razorpay's failure test card) and see the grace-period email;
  - **referrals:** sign up a second account through the first one's link (Settings →
    Referrals), pay with it, and check the first account gets its month. Then repeat with a
    first account that already pays: its subscription should pause (Razorpay shows
    `paused`), and `subscription.paused` arrive. To check the resume without waiting a month,
    set that referral's `resume_at` to the past in the staging database and wait for the
    hourly job; see what Razorpay charges on resume, and change the reward email's wording if
    it is not "your next payment is skipped".
- [ ] In the Razorpay dashboard (live mode): make the API keys, then the four plans with
      `pnpm --filter @formyx/api billing:sync-plans -- --create`, run with the live keys.
- [ ] Add the live webhook at `https://<site>/api/webhooks/razorpay` for the `subscription.*`
      and `payment.failed` events, with a new secret.
- [ ] On Render, set `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET`, the
      four `RAZORPAY_PLAN_*` ids and **`RAZORPAY_LIVE=true`**, then deploy.
- [ ] Make one real payment with your own card, see it arrive, then cancel and refund it from
      the Razorpay dashboard.

## 8. Emails

- [ ] Resend: verify the sending domain (SPF, DKIM) and set DMARC; send yourself a welcome
      email by signing up, and check it lands in the inbox with a working "Stop tips and
      reminders" link and Gmail's own unsubscribe button (from the `List-Unsubscribe` header).
