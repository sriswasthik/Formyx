import { findPublishIssues, type FormSchema, type ValidationIssue } from '@formyx/shared';
import { createContext, useContext } from 'react';

/**
 * What still stops the draft being published, with the same paths as draft issues
 * (`draftSchema.fields.0.label`) so settings can show them next to the right input.
 */
export function findDraftPublishIssues(schema: FormSchema): ValidationIssue[] {
  return findPublishIssues(schema).map((issue) => ({
    ...issue,
    path: `draftSchema.${issue.path}`,
  }));
}

/** Publish problems to point out in the settings; empty until publishing was tried. */
export const PublishIssuesContext = createContext<readonly ValidationIssue[]>([]);

export function usePublishIssues(): readonly ValidationIssue[] {
  return useContext(PublishIssuesContext);
}
