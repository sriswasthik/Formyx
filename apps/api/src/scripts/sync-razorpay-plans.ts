/* eslint-disable no-console -- a command-line check: printing is how it reports. */
// Checks the Razorpay plans in RAZORPAY_PLAN_* exist and charge what pricing.ts says:
// `pnpm --filter @formyx/api billing:sync-plans`. With `--create`, makes the missing plans in
// Razorpay (test mode) and prints the lines to add to .env. Exits with 1 when something is off.
import { parseEnv } from '../config/env.js';
import { checkRazorpayPlans } from '../billing/plan-check.js';
import { createRazorpayClient } from '../billing/razorpay.js';

const env = parseEnv(process.env);
if (!env.RAZORPAY_KEY_ID || !env.RAZORPAY_KEY_SECRET) {
  console.error('Set RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET (test mode) first.');
  process.exit(1);
}

const create = process.argv.includes('--create');
const checks = await checkRazorpayPlans(env, createRazorpayClient(env), { create });
for (const check of checks) {
  const state = check.created ? 'created' : check.problem ? `✗ ${check.problem}` : '✓';
  console.log(`${check.env.padEnd(31)} ${(check.planId ?? '-').padEnd(20)} ${state}`);
}
const created = checks.filter((check) => check.created);
if (created.length > 0) {
  console.log('\nAdd to apps/api/.env:');
  for (const check of created) console.log(`${check.env}=${check.planId ?? ''}`);
}
if (checks.some((check) => check.problem)) process.exitCode = 1;
