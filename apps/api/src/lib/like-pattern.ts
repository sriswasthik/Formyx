/**
 * Escapes `\`, `%` and `_` so text matches literally in LIKE and ILIKE patterns. Prisma's
 * `contains` does not escape them, so they would otherwise act as wildcards.
 */
export function escapeLikePattern(text: string): string {
  return text.replace(/[\\%_]/g, (character) => `\\${character}`);
}
