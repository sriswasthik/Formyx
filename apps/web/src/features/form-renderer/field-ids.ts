import type { Field } from '@formyx/shared';

export interface FieldIds {
  control: string;
  label: string;
  description: string;
  error: string;
}

export function fieldIds(prefix: string, field: Field): FieldIds {
  const base = `${prefix}-${field.id}`;
  return {
    control: `${base}-control`,
    label: `${base}-label`,
    description: `${base}-description`,
    error: `${base}-error`,
  };
}

/** Ids for `aria-describedby`: the description (if any) and the error (if shown). */
export function describedBy(ids: FieldIds, field: Field, error: string | undefined) {
  const parts = [field.description ? ids.description : null, error ? ids.error : null];
  return parts.filter(Boolean).join(' ') || undefined;
}
