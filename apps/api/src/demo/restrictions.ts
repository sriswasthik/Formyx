import { AppError } from '../lib/app-error.js';
import type { Database } from '../lib/prisma.js';

/**
 * What the shared demo account may not do: anything that reaches outside Formyx (emails,
 * invites, webhooks, uploads) or changes who is in its workspace, or the workspace itself.
 * Forms and responses stay editable; the nightly reset puts them back.
 */
export function demoRestricted(
  message = "That's switched off in the demo. Create a free account to try it.",
): AppError {
  return new AppError(403, 'DEMO_RESTRICTED', message);
}

export async function isDemoUser(prisma: Database, userId: string): Promise<boolean> {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { isDemo: true } });
  return user?.isDemo === true;
}

/** Whether the form lives in the demo workspace, whose respondents may not upload files. */
export async function isDemoForm(prisma: Database, formId: string): Promise<boolean> {
  const count = await prisma.form.count({
    where: { id: formId, workspace: { memberships: { some: { user: { isDemo: true } } } } },
  });
  return count > 0;
}
