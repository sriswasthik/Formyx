import { validationIssueSchema } from '@formyx/shared';
import type { FieldValues, Path, UseFormSetError } from 'react-hook-form';
import { z } from 'zod';
import { ApiRequestError } from '@/lib/api';

const issuesSchema = z.array(validationIssueSchema);

/**
 * Puts an API error on a form. Issues about known fields are shown next to those fields;
 * anything else is returned as a single message for the whole form (`null` if there is none).
 */
export function applyServerError<T extends FieldValues>(
  error: unknown,
  fields: readonly Path<T>[],
  setError: UseFormSetError<T>,
): string | null {
  if (!(error instanceof ApiRequestError)) {
    return 'Something went wrong. Please try again.';
  }

  const issues = issuesSchema.safeParse(error.details);
  if (issues.success && issues.data.length > 0) {
    const fieldIssues = issues.data.filter((issue) =>
      (fields as readonly string[]).includes(issue.path),
    );
    fieldIssues.forEach((issue, index) => {
      setError(
        issue.path as Path<T>,
        { type: 'server', message: issue.message },
        { shouldFocus: index === 0 },
      );
    });
    if (fieldIssues.length === issues.data.length) return null;
  }

  if (error.code === 'NETWORK_ERROR') {
    return 'Could not reach Formyx. Check your connection and try again.';
  }
  if (error.status >= 500 || error.code === 'INVALID_RESPONSE' || error.code === 'UNKNOWN_ERROR') {
    return 'Something went wrong on our side. Please try again.';
  }
  return error.message;
}
