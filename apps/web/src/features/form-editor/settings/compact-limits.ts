/** Drops unset limits, and the whole object once nothing is left. */
export function compact<T extends Record<string, number | undefined>>(value: T): T | undefined {
  const entries = Object.entries(value).filter(([, limit]) => limit !== undefined);
  return entries.length > 0 ? (Object.fromEntries(entries) as T) : undefined;
}
