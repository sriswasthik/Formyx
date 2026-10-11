import type { FormSchema } from '../forms/form-schema.js';
import { FEATURE_IDS, type FeatureId } from './features.js';

/**
 * The plan features a form's logic uses. Pages, piping, shuffling, saving progress in the
 * browser and drop-off analytics are free; publishing checks the rest (see `missingFeatures`).
 */
export function requiredLogicFeatures(schema: Pick<FormSchema, 'logic' | 'settings'>): FeatureId[] {
  const needed = new Set<FeatureId>();
  const { logic } = schema;
  const jumps = Object.values(logic.pages).some((page) => (page.jumps?.length ?? 0) > 0);
  if (
    jumps ||
    logic.variables.length > 0 ||
    logic.rules.length > 0 ||
    logic.endScreens.length > 1 ||
    logic.endScreens.some((screen) => screen.redirect) ||
    schema.settings.saveProgress === 'email'
  ) {
    needed.add('advanced_logic');
  }
  if (logic.quiz?.enabled) needed.add('quiz_mode');
  return FEATURE_IDS.filter((id) => needed.has(id));
}
