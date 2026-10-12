import { integrationKindSchema, type IntegrationKind } from '@formyx/shared';
import jwt from 'jsonwebtoken';
import { z } from 'zod';

/*
 * The `state` that goes to Google or Notion and comes back with the person: which form and
 * integration it is for, and who started it. Signed and short-lived; the callback also checks
 * it was started by the person now signed in, so a link to someone else's callback can't
 * connect their account to your form (or yours to theirs).
 */

const ISSUER = 'formyx-oauth';
const AUDIENCE = 'formyx-integration-callback';
/** Long enough to sign in and choose pages, short enough to be useless later. */
const STATE_TTL_SECONDS = 15 * 60;

const payloadSchema = z.object({
  sub: z.string().min(1),
  formId: z.string().min(1),
  kind: integrationKindSchema,
});
export interface OAuthState {
  userId: string;
  formId: string;
  kind: IntegrationKind;
}

export function signOAuthState(state: OAuthState, secret: string): string {
  return jwt.sign({ formId: state.formId, kind: state.kind }, secret, {
    algorithm: 'HS256',
    subject: state.userId,
    issuer: ISSUER,
    audience: AUDIENCE,
    expiresIn: STATE_TTL_SECONDS,
  });
}

/** The state, if it is ours, unexpired and for `kind`; `null` otherwise. */
export function verifyOAuthState(
  token: string,
  kind: IntegrationKind,
  secret: string,
): OAuthState | null {
  try {
    const payload = payloadSchema.parse(
      jwt.verify(token, secret, { algorithms: ['HS256'], issuer: ISSUER, audience: AUDIENCE }),
    );
    if (payload.kind !== kind) return null;
    return { userId: payload.sub, formId: payload.formId, kind: payload.kind };
  } catch {
    return null;
  }
}
