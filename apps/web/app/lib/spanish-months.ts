// Shared Spanish month-name formatting for period labels rendered across
// apps/web (dashboard royalty period, KDP preview period header). Not reused
// from packages/connectors/src/kdp-xlsx.ts's SPANISH_MONTHS map because that
// map is a private (unexported) parsing table in a package apps/web does not
// depend on (@anclora/connectors is not a dependency of apps/web) — this is
// the smallest local equivalent, kept in one place to avoid a second copy
// per component.
const SPANISH_MONTH_NAMES = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
];

/** Formats a "YYYY-MM" period key into a Spanish "<mes> <año>" label, e.g. "2026-07" -> "julio 2026". Returns the raw key if it doesn't parse. */
export function formatSpanishPeriod(period: string): string {
  const [year, month] = period.split('-');
  const monthIndex = month ? Number(month) - 1 : NaN;
  const monthName = SPANISH_MONTH_NAMES[monthIndex];
  return monthName && year ? `${monthName} ${year}` : period;
}

/** Formats one or more "YYYY-MM" period keys as a label — a single period renders as "<mes> <año>"; multiple periods render as a "<primero> – <último>" range (chronologically sorted). */
export function formatSpanishPeriodRange(periods: string[]): string {
  if (periods.length === 0) return '';
  const sorted = [...periods].sort();
  const first = sorted[0]!;
  const last = sorted[sorted.length - 1]!;
  return first === last ? formatSpanishPeriod(first) : `${formatSpanishPeriod(first)} – ${formatSpanishPeriod(last)}`;
}
