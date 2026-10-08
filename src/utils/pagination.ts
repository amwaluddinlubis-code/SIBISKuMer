/** Nomor halaman ringkas dengan ellipsis, mis. 1 … 4 5 6 … 12. */
export function getPageNumbers(total: number, current: number): (number | '…')[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  const set = new Set(
    [1, 2, current - 1, current, current + 1, total - 1, total].filter((n) => n >= 1 && n <= total)
  );
  const sorted = [...set].sort((a, b) => a - b);
  const out: (number | '…')[] = [];
  for (let i = 0; i < sorted.length; i++) {
    if (i > 0 && sorted[i] - sorted[i - 1] > 1) out.push('…');
    out.push(sorted[i]);
  }
  return out;
}
