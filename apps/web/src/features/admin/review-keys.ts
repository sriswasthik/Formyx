/** Query keys for /admin's review queue and the forms in it. */
export const reviewKeys = {
  queue: ['admin', 'review'] as const,
  form: (formId: string) => ['admin', 'review', formId] as const,
};
