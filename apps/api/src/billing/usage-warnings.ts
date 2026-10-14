import { crossedThreshold } from '@formyx/shared';
import type { Logger } from 'pino';
import type { Env } from '../config/env.js';
import type { EventBus } from '../lib/events.js';
import { renderUsageWarningEmail } from '../notifications/billing-email.js';
import { createEntitlementService } from '../services/entitlement-service.js';
import { sendBillingNotice, type NoticeDependencies } from './notices.js';
import { countResponses, workspaceUsagePeriod } from './usage.js';

/*
 * Warns a workspace's owners, once per usage period, when its responses reach 80% and then
 * 100% of what its plan includes. Responses are always saved, whatever the count: the app
 * shows the same warning as a banner (see the billing summary).
 */

export interface UsageWarningDependencies extends NoticeDependencies {
  env: NoticeDependencies['env'] & Pick<Env, 'ENTITLEMENTS_MODE' | 'ENFORCEMENT_MODE'>;
  events: EventBus;
  logger: Logger;
}

export function registerUsageWarnings(deps: UsageWarningDependencies): () => void {
  const { prisma, events, env, logger } = deps;
  const entitlements = createEntitlementService(prisma, env.ENTITLEMENTS_MODE);

  return events.on('submission.created', async ({ formId }) => {
    try {
      const form = await prisma.form.findUnique({
        where: { id: formId },
        select: { workspaceId: true },
      });
      if (!form) return;
      const limit = (await entitlements.forWorkspace(form.workspaceId)).limits.responses_per_month;
      if (limit === null) return;
      const period = await workspaceUsagePeriod(prisma, form.workspaceId);
      const used = await countResponses(prisma, form.workspaceId, period);
      const threshold = crossedThreshold(used - 1, used, limit);
      if (threshold === null) return;
      await sendBillingNotice(deps, {
        workspaceId: form.workspaceId,
        kind: `usage_${String(Math.round(threshold * 100))}`,
        periodKey: period.start.toISOString(),
        render: (context) =>
          renderUsageWarningEmail(context, {
            used,
            limit,
            threshold,
            enforcement: env.ENFORCEMENT_MODE,
            periodEnd: period.end,
          }),
      });
    } catch (error) {
      logger.error({ formId, err: error }, 'Could not check the response limit');
    }
  });
}
