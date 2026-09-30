/** Where a form opens from the dashboard: the editor for editors, the read-only page otherwise. */
export function formOpenPath(formId: string, canEdit: boolean): string {
  return canEdit ? `/app/forms/${formId}/edit` : `/app/forms/${formId}`;
}

/** The public page respondents fill in. */
export function publicFormPath(slug: string): string {
  return `/f/${encodeURIComponent(slug)}`;
}

/** The full link to share, on this site. */
export function publicFormUrl(slug: string, origin: string = window.location.origin): string {
  return `${origin}${publicFormPath(slug)}`;
}
