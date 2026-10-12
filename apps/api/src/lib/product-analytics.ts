import { createHmac } from 'node:crypto';
import {
  effectivePlan,
  premiumAssetsUsed,
  readAccountPreferences,
  type FeatureId,
  type FormDetail,
  type FormTheme,
  type IntegrationKind,
} from '@formyx/shared';
import type { Logger } from 'pino';
import type { Env } from '../config/env.js';
import { isDemoUser } from '../demo/restrictions.js';
import type { Database } from './prisma.js';

/*
 * Product analytics: a handful of server-side events in PostHog, to learn which features
 * people value before pricing them. Privacy first:
 * - people and workspaces are sent as keyed hashes, never ids, names or emails;
 * - no person profiles, no IP or location (GeoIP off), no cookies, nothing from the browser;
 * - never anything from forms' content or responses;
 * - nothing at all for people who turned "Share feature usage" off, or for the demo account.
 * Events are sent as they happen, without waiting or retrying: losing one is fine.
 */

export type ProductEvent =
  | { name: 'signed_up'; properties?: undefined }
  | { name: 'form_created'; properties: { source: 'template' | 'duplicate'; template?: string } }
  | {
      name: 'form_published';
      properties: {
        layout: FormTheme['layout']['mode'];
        fieldCount: number;
        fieldTypes: string[];
        logicRules: number;
        quiz: boolean;
      };
    }
  | { name: 'premium_asset_used'; properties: { feature: FeatureId; assets: string[] } }
  | { name: 'integration_connected'; properties: { kind: IntegrationKind } }
  | { name: 'feedback_sent'; properties: { kind: string } };

/** Who did it: the person, and the workspace (directly, or as the form's). */
export interface ProductActor {
  userId: string;
  workspaceId?: string;
  formId?: string;
}

export interface ProductAnalytics {
  /** Sends the event in the background (or not, see above). Never throws. */
  track(event: ProductEvent, who: ProductActor): void;
  /** Waits for events still being sent, for tests and shutdown. */
  flush(): Promise<void>;
}

const SEND_TIMEOUT_MS = 5000;

/** A stable id PostHog can count but not reverse or match with anything else. */
export function pseudonym(secret: string, kind: 'user' | 'workspace', id: string): string {
  return createHmac('sha256', secret).update(`formyx-analytics:${kind}:${id}`).digest('hex');
}

export function createProductAnalytics({
  env,
  prisma,
  logger,
  fetch: send = fetch,
}: {
  env: Pick<Env, 'POSTHOG_KEY' | 'POSTHOG_HOST' | 'JWT_SECRET' | 'NODE_ENV'>;
  prisma: Database;
  logger: Logger;
  fetch?: typeof fetch;
}): ProductAnalytics {
  const { POSTHOG_KEY: apiKey } = env;
  const pending = new Set<Promise<void>>();

  async function capture(event: ProductEvent, who: ProductActor) {
    if (!apiKey) return;
    const user = await prisma.user.findUnique({
      where: { id: who.userId },
      select: { preferences: true },
    });
    if (!user || !readAccountPreferences(user.preferences).productAnalytics) return;
    if (await isDemoUser(prisma, who.userId)) return;

    const workspaceId =
      who.workspaceId ??
      (who.formId
        ? (
            await prisma.form.findUnique({
              where: { id: who.formId },
              select: { workspaceId: true },
            })
          )?.workspaceId
        : undefined);
    const workspace = workspaceId
      ? await prisma.workspace.findUnique({
          where: { id: workspaceId },
          select: { plan: true, planStatus: true, trialEndsAt: true },
        })
      : null;

    const response = await send(`${env.POSTHOG_HOST}/i/v0/e/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: AbortSignal.timeout(SEND_TIMEOUT_MS),
      body: JSON.stringify({
        api_key: apiKey,
        event: event.name,
        distinct_id: pseudonym(env.JWT_SECRET, 'user', who.userId),
        timestamp: new Date().toISOString(),
        properties: {
          ...event.properties,
          ...(workspace &&
            workspaceId && {
              workspace: pseudonym(env.JWT_SECRET, 'workspace', workspaceId),
              plan: effectivePlan(workspace),
            }),
          environment: env.NODE_ENV,
          $process_person_profile: false,
          $geoip_disable: true,
          $lib: 'formyx-api',
        },
      }),
    });
    if (!response.ok) throw new Error(`PostHog answered ${String(response.status)}`);
  }

  return {
    track(event, who) {
      if (!apiKey) return;
      const sending = capture(event, who)
        .catch((error: unknown) => {
          logger.debug({ err: error, event: event.name }, 'Could not send a product event');
        })
        .finally(() => {
          pending.delete(sending);
        });
      pending.add(sending);
    },
    async flush() {
      await Promise.all(pending);
    },
  };
}

/** What publishing `form` tells us: its shape, and each premium look it uses. */
export function publishEvents(form: Pick<FormDetail, 'draftSchema' | 'theme'>): ProductEvent[] {
  const { fields, logic } = form.draftSchema;
  return [
    {
      name: 'form_published',
      properties: {
        layout: form.theme.layout.mode,
        fieldCount: fields.length,
        fieldTypes: [...new Set(fields.map((field) => field.type))].sort(),
        logicRules: logic.rules.length,
        quiz: logic.quiz?.enabled ?? false,
      },
    },
    ...premiumAssetsUsed(form.theme).map((use): ProductEvent => ({
      name: 'premium_asset_used',
      properties: use,
    })),
  ];
}

/** Keeps events in memory instead, for tests. */
export function createRecordingAnalytics(): ProductAnalytics & {
  events: ({ event: ProductEvent } & ProductActor)[];
} {
  const events: ({ event: ProductEvent } & ProductActor)[] = [];
  return {
    events,
    track(event, who) {
      events.push({ event, ...who });
    },
    flush: () => Promise.resolve(),
  };
}
