import {
  applyOnboardingUpdate,
  onboardingResponse,
  readOnboardingState,
  type OnboardingResponse,
  type OnboardingState,
  type UpdateOnboardingInput,
} from '@formyx/shared';
import type { Database } from '../lib/prisma.js';

/*
 * The welcome and the getting-started checklist. The checklist is worked out from the person's
 * own forms each time it is read, except "customise the design", which is recorded when they
 * first save a form's look (`markDesigned`).
 */

export interface OnboardingService {
  get(userId: string): Promise<OnboardingResponse>;
  update(userId: string, input: UpdateOnboardingInput): Promise<OnboardingResponse>;
  /** Whether the checklist is still waiting for its "customise the design" step. */
  awaitingDesign(userId: string): Promise<boolean>;
  /** Records the first saved change to a form's design, for accounts being onboarded. */
  markDesigned(userId: string): Promise<void>;
}

export function createOnboardingService(
  prisma: Database,
  now: () => Date = () => new Date(),
): OnboardingService {
  async function readState(userId: string): Promise<OnboardingState> {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { onboarding: true },
    });
    return readOnboardingState(user?.onboarding);
  }

  async function respond(userId: string, state: OnboardingState): Promise<OnboardingResponse> {
    // Accounts from before onboarding see none of it: no need to count anything.
    if (state.startedAt === undefined) {
      return onboardingResponse({ formsCreated: 0, formsPublished: 0, responses: 0, state });
    }
    // Each step only needs to know whether there is at least one.
    const mine = { createdById: userId };
    const [created, published, response] = await Promise.all([
      prisma.form.findFirst({ where: mine, select: { id: true } }),
      prisma.form.findFirst({
        where: { ...mine, publishedAt: { not: null } },
        select: { id: true },
      }),
      prisma.submission.findFirst({ where: { form: mine }, select: { id: true } }),
    ]);
    return onboardingResponse({
      formsCreated: created ? 1 : 0,
      formsPublished: published ? 1 : 0,
      responses: response ? 1 : 0,
      state,
    });
  }

  return {
    async get(userId) {
      return respond(userId, await readState(userId));
    },

    async update(userId, input) {
      const state = applyOnboardingUpdate(await readState(userId), input, now());
      await prisma.user.update({ where: { id: userId }, data: { onboarding: state } });
      return respond(userId, state);
    },

    async awaitingDesign(userId) {
      const state = await readState(userId);
      return state.startedAt !== undefined && state.designedAt === undefined;
    },

    async markDesigned(userId) {
      const state = await readState(userId);
      if (state.startedAt === undefined || state.designedAt !== undefined) return;
      await prisma.user.update({
        where: { id: userId },
        data: { onboarding: { ...state, designedAt: now().toISOString() } },
      });
    },
  };
}
