import {
  FEATURE_IDS,
  readLiveSettings,
  themeForFeatures,
  type DowngradedForm,
  type FeatureId,
} from '@formyx/shared';
import type { Database } from '../lib/prisma.js';
import { parsePublishedTheme } from '../services/form-service.js';
import { storedIntegrationFeature } from '../services/integration-service.js';

/*
 * What a plan without some features changes about a workspace's published forms, for the
 * owner to see after a downgrade: looks drawn with free stand-ins, and work that pauses
 * (emails to extra addresses, the autoresponder, chat posts, syncing, a custom link image).
 * Logic, quizzes and verified responses keep running on published forms, so a live form
 * never breaks; they only need the plan to be published again.
 */

export async function downgradedForms(
  prisma: Database,
  workspaceId: string,
  features: Readonly<Record<FeatureId, boolean>>,
): Promise<DowngradedForm[]> {
  const forms = await prisma.form.findMany({
    where: { workspaceId, publishedAt: { not: null } },
    orderBy: { updatedAt: 'desc' },
    select: {
      id: true,
      title: true,
      publishedTitle: true,
      publishedTheme: true,
      theme: true,
      liveSettings: true,
      slackWebhookEncrypted: true,
      discordWebhookEncrypted: true,
      integrations: { select: { kind: true } },
    },
  });

  return forms.flatMap((form) => {
    const used = new Set<FeatureId>();
    const theme = parsePublishedTheme(form.publishedTheme ?? form.theme);
    if (theme) {
      for (const { feature } of themeForFeatures(theme, features).fallbacks) used.add(feature);
    }
    const settings = readLiveSettings(form.liveSettings);
    if (settings.autoresponder.enabled) used.add('autoresponder');
    if (settings.notifications.emails.length > 0) used.add('extra_recipients');
    if (settings.sharing.socialImageUrl || settings.sharing.faviconUrl) used.add('custom_social');
    if (form.slackWebhookEncrypted || form.discordWebhookEncrypted) used.add('chat_notifications');
    for (const { kind } of form.integrations) used.add(storedIntegrationFeature(kind));

    const lost = FEATURE_IDS.filter((id) => used.has(id) && !features[id]);
    if (lost.length === 0) return [];
    return [{ formId: form.id, title: form.publishedTitle ?? form.title, features: lost }];
  });
}
