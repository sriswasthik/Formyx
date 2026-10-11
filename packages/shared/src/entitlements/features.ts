import { z } from 'zod';
import type { Plan } from './plans.js';

export interface FeatureDefinition {
  name: string;
  /** One line for upgrade prompts. */
  description: string;
  /** The least plan that includes it. */
  minPlan: Plan;
}

/** Everything a plan can include. Check them with `hasFeature`, never by plan name. */
export const FEATURES = {
  premium_fonts: {
    name: 'Premium fonts',
    description: 'Display and editorial typefaces for headings and text.',
    minPlan: 'PRO',
  },
  premium_textures: {
    name: 'Premium textures',
    description: 'Paper, linen and other material textures.',
    minPlan: 'PRO',
  },
  mesh_gradients: {
    name: 'Mesh gradients',
    description: 'Soft, many-colour backgrounds.',
    minPlan: 'PRO',
  },
  custom_shapes: {
    name: 'Custom shapes',
    description: 'Blobs, sparkles and other decorative shapes.',
    minPlan: 'PRO',
  },
  conversational_layout: {
    name: 'Conversational layout',
    description: 'One question at a time.',
    minPlan: 'PRO',
  },
  remove_branding: {
    name: 'Remove Formyx branding',
    description: 'Hide "Made with Formyx" under your forms.',
    minPlan: 'PRO',
  },
  ai_generate: {
    name: 'Generate with AI',
    description: 'Draft a form from a short description.',
    minPlan: 'PRO',
  },
  ai_insights: {
    name: 'AI insights',
    description: 'Summaries and themes across your responses.',
    minPlan: 'BUSINESS',
  },
  google_sheets: {
    name: 'Google Sheets',
    description: 'Send every response to a spreadsheet.',
    minPlan: 'PRO',
  },
  advanced_logic: {
    name: 'Advanced logic',
    description: 'Page jumps, calculations, several end screens, redirects and save for later.',
    minPlan: 'PRO',
  },
  quiz_mode: {
    name: 'Quizzes',
    description: 'Right answers, points, scores and a pass mark.',
    minPlan: 'PRO',
  },
} as const satisfies Record<string, FeatureDefinition>;

export type FeatureId = keyof typeof FEATURES;
export const FEATURE_IDS = Object.keys(FEATURES) as [FeatureId, ...FeatureId[]];
export const featureIdSchema = z.enum(FEATURE_IDS);

/** `null` means no limit. */
export type LimitValue = number | null;

export interface LimitDefinition {
  name: string;
  unit: string;
  values: Record<Plan, LimitValue>;
}

/**
 * How much of something each plan allows. Defined and reported for now; enforcing them
 * (counting responses per month, for one) comes with billing.
 */
export const LIMITS = {
  responses_per_month: {
    name: 'Responses per month',
    unit: 'responses',
    values: { FREE: 100, PRO: 10_000, BUSINESS: null },
  },
  file_upload_size_mb: {
    name: 'File upload size',
    unit: 'MB',
    values: { FREE: 10, PRO: 25, BUSINESS: 100 },
  },
  ai_credits_per_month: {
    name: 'AI credits per month',
    unit: 'credits',
    values: { FREE: 20, PRO: 500, BUSINESS: 2000 },
  },
  brand_kits: {
    name: 'Brand kits',
    unit: 'kits',
    values: { FREE: 1, PRO: 10, BUSINESS: null },
  },
} as const satisfies Record<string, LimitDefinition>;

export type LimitId = keyof typeof LIMITS;
export const LIMIT_IDS = Object.keys(LIMITS) as [LimitId, ...LimitId[]];
export const limitIdSchema = z.enum(LIMIT_IDS);
