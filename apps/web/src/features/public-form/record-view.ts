import type { ProgressInput } from '@formyx/shared';
import { recordFormView, reportProgress } from './public-form-api';

const viewKey = (slug: string) => `formyx:view:${slug}`;

/** Views being counted, by slug, so asking twice at once (React may) still counts one. */
const counting = new Map<string, Promise<string | null>>();

/**
 * Counts a view of the form once per browser session, and resolves with the visit's token
 * (kept for the session, so a reload is the same visit). Storage can be unavailable
 * (private windows, blocked site data); then every visit counts, which beats counting none.
 * Views are best effort: `null` when it fails, which never gets in the respondent's way.
 */
export function recordViewOnce(slug: string): Promise<string | null> {
  let view = counting.get(slug);
  if (!view) {
    view = countView(slug).finally(() => {
      counting.delete(slug);
    });
    counting.set(slug, view);
  }
  return view;
}

async function countView(slug: string): Promise<string | null> {
  try {
    const kept = sessionStorage.getItem(viewKey(slug));
    if (kept) return kept;
  } catch {
    // Storage is off: count the view anyway.
  }
  try {
    const token = await recordFormView(slug);
    try {
      sessionStorage.setItem(viewKey(slug), token);
    } catch {
      // Not kept: a reload counts again.
    }
    return token;
  } catch {
    return null;
  }
}

/**
 * Sends a visit's progress as it goes, skipping reports that say nothing new. Anonymous:
 * the token is all that ties reports together.
 */
export function createProgressReporter(slug: string, token: Promise<string | null>) {
  const sent: { pageKey?: string; fieldId?: string } = {};
  return (progress: Omit<ProgressInput, 'token'>) => {
    const pageKey = progress.pageKey !== sent.pageKey ? progress.pageKey : undefined;
    const fieldId = progress.fieldId !== sent.fieldId ? progress.fieldId : undefined;
    if (pageKey === undefined && fieldId === undefined) return;
    if (pageKey !== undefined) sent.pageKey = pageKey;
    if (fieldId !== undefined) sent.fieldId = fieldId;
    void token.then((visit) => {
      if (!visit) return;
      reportProgress(slug, {
        token: visit,
        ...(pageKey !== undefined && { pageKey }),
        ...(fieldId !== undefined && { fieldId }),
      }).catch(() => undefined);
    });
  };
}
