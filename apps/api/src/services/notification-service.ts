import type { NotificationSettings } from '@formyx/shared';
import type { Database } from '../lib/prisma.js';

export interface Recipient {
  email: string;
  name: string;
}

export interface NotificationService {
  get(formId: string, userId: string): Promise<NotificationSettings>;
  set(
    formId: string,
    userId: string,
    settings: NotificationSettings,
  ): Promise<NotificationSettings>;
  /**
   * Who to email about a new response: members who asked to be, and are still members of
   * the form's workspace (leaving a workspace does not delete the preference).
   */
  recipients(formId: string): Promise<Recipient[]>;
}

export function createNotificationService(prisma: Database): NotificationService {
  return {
    async get(formId, userId) {
      const subscription = await prisma.formSubscription.findUnique({
        where: { userId_formId: { userId, formId } },
        select: { userId: true },
      });
      return { emailOnSubmission: subscription !== null };
    },

    async set(formId, userId, { emailOnSubmission }) {
      if (emailOnSubmission) {
        await prisma.formSubscription.upsert({
          where: { userId_formId: { userId, formId } },
          create: { userId, formId },
          update: {},
        });
      } else {
        await prisma.formSubscription.deleteMany({ where: { userId, formId } });
      }
      return { emailOnSubmission };
    },

    async recipients(formId) {
      const subscriptions = await prisma.formSubscription.findMany({
        where: {
          formId,
          user: { memberships: { some: { workspace: { forms: { some: { id: formId } } } } } },
        },
        select: { user: { select: { email: true, name: true } } },
        orderBy: { createdAt: 'asc' },
      });
      return subscriptions.map(({ user }) => user);
    },
  };
}
