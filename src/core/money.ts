export function peso(value: unknown): string {
  if (!isFinite(value as number)) return '\u2014';
  return (
    '\u20b1' +
    (Math.round((value as number) * 100) / 100).toLocaleString('en-PH', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })
  );
}

export function pct(value: unknown): string {
  if (!isFinite(value as number)) return '\u2014';
  return `${Math.round((value as number) * 10) / 10}%`;
}

export function num(value: unknown): number {
  const parsed = parseFloat(value as string);
  return isNaN(parsed) ? 0 : parsed;
}
