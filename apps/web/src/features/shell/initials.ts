/** "Ada Lovelace" -> "AL", "grace" -> "G". Handles characters outside the Basic Multilingual Plane. */
export function getInitials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  const first = words[0];
  if (!first) return '?';
  const last = words.length > 1 ? words[words.length - 1] : undefined;
  const letters = [first, last].map((word) => (word ? (Array.from(word)[0] ?? '') : ''));
  return letters.join('').toLocaleUpperCase();
}
