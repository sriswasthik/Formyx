import type { UpdateFormSettingsInput } from '../settings/settings-api.js';
import { FEATURE_IDS, type FeatureId } from './features.js';

/**
 * The plan features the settings in `update` turn on. Live settings take effect when saved,
 * so the API checks these on save (not on publish, as for looks and logic). Turning a
 * feature off, or leaving it off, never needs anything.
 */
export function requiredSettingsFeatures(update: UpdateFormSettingsInput): FeatureId[] {
  const needed = new Set<FeatureId>();
  if (update.access?.oneResponsePer === 'email') needed.add('verified_responses');
  if (update.autoresponder?.enabled) needed.add('autoresponder');
  if ((update.notifications?.emails.length ?? 0) > 0) needed.add('extra_recipients');
  if (update.sharing?.socialImageUrl !== undefined || update.sharing?.faviconUrl !== undefined) {
    needed.add('custom_social');
  }
  return FEATURE_IDS.filter((id) => needed.has(id));
}
