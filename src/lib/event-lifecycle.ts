export function isEventReadOnly(startsAt: string | null | undefined, now: number = Date.now()): boolean {
  if (!startsAt) return false;
  const startMs = new Date(startsAt).getTime();
  if (Number.isNaN(startMs)) return false;
  return now >= startMs;
}

export function mergeOrganizerIntent(description: string, intent: string): string {
  const cleanDescription = description.trim();
  const cleanIntent = intent.trim();
  const chunks = [cleanDescription, cleanIntent].filter(Boolean);
  return chunks.join("\n\n");
}
