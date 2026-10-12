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

/** A form's settings, at a section and setting when given. */
export function formSettingsPath(
  formId: string,
  { section, setting }: { section?: string; setting?: string } = {},
): string {
  const params = new URLSearchParams();
  if (section) params.set('section', section);
  if (setting) params.set('setting', setting);
  const query = params.toString();
  return `/app/forms/${formId}/settings${query ? `?${query}` : ''}`;
}

/** A form's Integrations page. */
export function formIntegrationsPath(formId: string): string {
  return `/app/forms/${formId}/integrations`;
}
