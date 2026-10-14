import { describe, expect, it } from 'vitest';
import { FORM_TEMPLATE_IDS } from './forms/template-ids.js';
import {
  applyOnboardingUpdate,
  onboardingResponse,
  readOnboardingState,
  updateOnboardingInputSchema,
  USE_CASE_TEMPLATES,
  USE_CASES,
  type OnboardingFacts,
} from './onboarding.js';

const STARTED = '2026-10-01T10:00:00.000Z';

function facts(overrides: Partial<OnboardingFacts> = {}): OnboardingFacts {
  return {
    formsCreated: 0,
    formsPublished: 0,
    responses: 0,
    state: { startedAt: STARTED },
    ...overrides,
  };
}

describe('onboardingResponse', () => {
  it('welcomes a new account and starts its checklist with nothing done', () => {
    expect(onboardingResponse(facts())).toEqual({
      welcome: true,
      useCase: null,
      checklist: {
        create_form: false,
        customise_design: false,
        publish: false,
        first_response: false,
      },
    });
  });

  it('ticks each step off from what the person has done', () => {
    const response = onboardingResponse(
      facts({
        formsCreated: 2,
        formsPublished: 1,
        state: { startedAt: STARTED, welcomedAt: STARTED, useCase: 'events' },
      }),
    );
    expect(response.welcome).toBe(false);
    expect(response.useCase).toBe('events');
    expect(response.checklist).toEqual({
      create_form: true,
      customise_design: false,
      publish: true,
      first_response: false,
    });
  });

  it('hides the checklist once every step is done', () => {
    const response = onboardingResponse(
      facts({
        formsCreated: 1,
        formsPublished: 1,
        responses: 1,
        state: { startedAt: STARTED, welcomedAt: STARTED, designedAt: STARTED },
      }),
    );
    expect(response.checklist).toBeNull();
  });

  it('hides the checklist once dismissed', () => {
    const state = { startedAt: STARTED, checklistDismissedAt: STARTED };
    expect(onboardingResponse(facts({ state })).checklist).toBeNull();
  });

  it('leaves accounts from before onboarding alone', () => {
    expect(onboardingResponse(facts({ state: {} }))).toEqual({
      welcome: false,
      useCase: null,
      checklist: null,
    });
  });
});

describe('readOnboardingState', () => {
  it('reads a stored state, and treats anything malformed as empty', () => {
    expect(readOnboardingState({ startedAt: STARTED, useCase: 'orders' })).toEqual({
      startedAt: STARTED,
      useCase: 'orders',
    });
    expect(readOnboardingState(null)).toEqual({});
    expect(readOnboardingState({ useCase: 'gardening' })).toEqual({});
  });
});

describe('applyOnboardingUpdate', () => {
  const now = new Date('2026-10-02T09:00:00.000Z');

  it('records the use case and when the welcome and checklist were finished', () => {
    expect(
      applyOnboardingUpdate(
        { startedAt: STARTED },
        { useCase: 'hiring', welcomed: true, checklistDismissed: true },
        now,
      ),
    ).toEqual({
      startedAt: STARTED,
      useCase: 'hiring',
      welcomedAt: now.toISOString(),
      checklistDismissedAt: now.toISOString(),
    });
  });

  it('keeps the first time something happened', () => {
    const state = { startedAt: STARTED, welcomedAt: STARTED };
    expect(applyOnboardingUpdate(state, { welcomed: true }, now).welcomedAt).toBe(STARTED);
  });

  it('accepts only what the person may change', () => {
    expect(updateOnboardingInputSchema.safeParse({ designedAt: STARTED }).success).toBe(false);
    expect(updateOnboardingInputSchema.safeParse({ welcomed: false }).success).toBe(false);
  });
});

describe('USE_CASE_TEMPLATES', () => {
  it('suggests three real templates for every use', () => {
    for (const useCase of USE_CASES) {
      expect(USE_CASE_TEMPLATES[useCase]).toHaveLength(3);
      for (const id of USE_CASE_TEMPLATES[useCase]) expect(FORM_TEMPLATE_IDS).toContain(id);
    }
  });
});
