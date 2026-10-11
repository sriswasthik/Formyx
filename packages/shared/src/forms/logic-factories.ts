import { createId } from './ids.js';
import type { EndScreen, FormLogic, Jump, JumpTarget, Rule, Variable } from './logic-schema.js';

/** The end screen every form starts with, and v2 forms' thank-you message became. */
export const DEFAULT_END_SCREEN_ID = 'end_default';

export const DEFAULT_END_MESSAGE = 'Thanks! Your response has been recorded.';

export function createEndScreen(props: Partial<EndScreen> = {}): EndScreen {
  return {
    id: createId('end'),
    name: '',
    title: '',
    message: '',
    align: 'center',
    showScore: false,
    when: [],
    match: 'all',
    ...props,
  };
}

/** The logic of a new form: no jumps or values, one end screen. */
export function createDefaultLogic(): FormLogic {
  return {
    pages: {},
    variables: [],
    rules: [],
    endScreens: [
      createEndScreen({ id: DEFAULT_END_SCREEN_ID, name: 'Default', message: DEFAULT_END_MESSAGE }),
    ],
  };
}

export function createVariable(kind: Variable['kind'] = 'score'): Variable {
  const names = { score: 'Score', price: 'Price', number: 'Value' } as const;
  return {
    id: createId('var'),
    name: names[kind],
    kind,
    initial: 0,
    ...(kind === 'price' && { currency: 'INR' }),
  };
}

/** A jump with no conditions yet, which means it always applies. */
export function createJump(to: JumpTarget): Jump {
  return { id: createId('jmp'), when: [], match: 'all', to };
}

export function createRule(variableId: string): Rule {
  return {
    id: createId('rul'),
    when: [],
    match: 'all',
    variableId,
    operation: 'add',
    amount: { kind: 'number', value: 1 },
  };
}
