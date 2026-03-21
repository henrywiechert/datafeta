/**
 * Short number labels for dense UI (e.g. 143_254_444 → "143M").
 */
export function formatCompactCount(n: number): string {
  if (!Number.isFinite(n) || n < 0) return '—';
  const x = Math.floor(n);
  if (x < 1000) return String(x);

  const units = ['K', 'M', 'B', 'T'] as const;
  let v = x;
  let u = -1;
  while (v >= 1000 && u < units.length - 1) {
    v /= 1000;
    u += 1;
  }
  // Re-promote if rounding pushed us to the next unit (e.g. 999.9K → 1M)
  if (v >= 999.5 && u < units.length - 1) {
    v /= 1000;
    u += 1;
  }
  const rounded = v >= 100 ? Math.round(v) : Math.round(v * 10) / 10;
  const s = Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1).replace(/\.0$/, '');
  return `${s}${units[u]}`;
}
