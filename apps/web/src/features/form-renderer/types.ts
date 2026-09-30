import type { AnswerValue, Field } from '@formyx/shared';

/**
 * `editor`: the builder's canvas. Looks exactly like the live form but cannot be operated,
 * so clicking a question selects it. `respondent`: working inputs (preview and public form).
 */
export type RenderMode = 'editor' | 'respondent';

export interface ControlProps<F extends Field = Field> {
  field: F;
  /** Id of the input, or of the first input in a group. */
  controlId: string;
  /** Ids of the description and error, for `aria-describedby`. */
  describedBy: string | undefined;
  invalid: boolean;
  value: AnswerValue | undefined;
  onChange: (value: AnswerValue) => void;
}
