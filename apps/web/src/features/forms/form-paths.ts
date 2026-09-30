/** Where "Open" goes: the editor for editors, the read-only page for everyone else. */
export function formOpenPath(formId: string, canEdit: boolean): string {
  return canEdit ? `/app/forms/${formId}/edit` : `/app/forms/${formId}`;
}
