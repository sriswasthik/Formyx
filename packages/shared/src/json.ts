/** JSON with object keys sorted and `undefined` properties left out. */
export function canonicalJson(value: unknown): string {
  return JSON.stringify(value, (_key, current: unknown) => {
    if (current === null || typeof current !== 'object' || Array.isArray(current)) return current;
    return Object.fromEntries(
      Object.entries(current as Record<string, unknown>).sort(([a], [b]) => (a < b ? -1 : 1)),
    );
  });
}

/**
 * Whether two JSON values say the same thing. Postgres `jsonb` reorders object keys, so a
 * stored copy and an in-memory value can differ in key order alone.
 */
export function isSameJson(a: unknown, b: unknown): boolean {
  return canonicalJson(a) === canonicalJson(b);
}
