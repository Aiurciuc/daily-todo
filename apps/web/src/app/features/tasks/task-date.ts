export function localToday(): string {
  const now = new Date();
  return `${now.getFullYear().toString().padStart(4, '0')}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

export function adjacentDay(day: string, offset: number): string | undefined {
  const date = new Date(`${day}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + offset);
  const year = date.getUTCFullYear();
  return year < 1 || year > 9999 ? undefined : date.toISOString().slice(0, 10);
}
