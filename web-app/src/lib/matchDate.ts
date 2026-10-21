// Both the FMP and FGP agendas are scraped from the same sidgad HTML, so they
// share the same `dd/mm/yyyy` (+ optional `hh:mm`) row format regardless of
// competition. Centralising the parser here keeps that format in one place.
//
// sidgad's `time` column is the kickoff in Spain-local (Europe/Madrid) wall
// clock. Parsing the string with `new Date('YYYY-MM-DDTHH:mm:00')` (no `Z`)
// interprets the components in whatever the *server's* local timezone happens
// to be — which on Vercel is UTC, on a developer Mac is Europe/Madrid. That
// mismatch used to make "15:30 Madrid time on 2026-10-18" compare against a
// different absolute instant on prod vs. local, dropping or keeping fixtures
// inconsistently across environments.
//
// To avoid that, both `parseSidgadDate` and `nowInMadrid` return Dates whose
// **UTC fields** encode the Europe/Madrid wall-clock components. So:
//   - getUTCFullYear / getUTCMonth / getUTCDate / getUTCHours / getUTCMinutes
//     return the original Madrid numbers (formatting code that uses
//     `toLocaleDateString('es-ES', ...)` on the result keeps producing the
//     expected Spanish date/time strings regardless of the host TZ).
//   - getTime() returns a millis-since-epoch that is independent of the
//     host timezone (the underlying instant is fixed), so two calls
//     compared via getTime() compare like-for-like on prod and locally.
// The absolute instant of the returned Date is not the real Madrid instant
// in absolute UTC terms — but since both `parseSidgadDate` and `nowInMadrid`
// use the same UTC-as-encoding convention, `getTime()` comparisons between
// them are correct for ordering (kickoff in the past vs. now).

const MADRID_TZ = 'Europe/Madrid';

function pad(n: string): string {
  return n.padStart(2, '0');
}

function partsToDate(year: number, month: number, day: number, hour: number, minute: number): Date {
  // Date.UTC takes (year, monthIndex, day, hours, minutes) — monthIndex is
  // 0-based, so subtract 1.
  return new Date(Date.UTC(year, month - 1, day, hour, minute));
}

export function parseSidgadDate(
  date?: string | null,
  time?: string | null,
): Date | null {
  if (!date) return null;
  const [day, month, year] = date.split('/');
  if (!day || !month || !year) return null;
  // A missing time must degrade to midnight, not poison the whole parse.
  //
  // `''.split(':')` yields `['']`, so destructuring with defaults
  // (`const [hh = '00'] = ...`) does NOT fall back to '00' — the empty
  // string is a present element, not `undefined`. That left `hh = ''`,
  // `parseInt('', 10) === NaN`, and the `Number.isFinite` guard below threw
  // away a perfectly valid date. Every date-only caller (formatDayLabel,
  // formatMatchDay) passes `null` for `time`, so the day label rendered as
  // "Sin fecha y hora" even though the fixture had a full date (and, once
  // a time exists, `isMatchReady` happily showed the time next to it).
  // Coerce blank/undefined segments to '00' *before* parsing.
  const [rawHh = '', rawMm = ''] = (time ?? '').split(':');
  const hh = rawHh.trim() === '' ? '00' : rawHh.trim();
  const mm = rawMm.trim() === '' ? '00' : rawMm.trim();
  const y = Number.parseInt(year, 10);
  const mo = Number.parseInt(month, 10);
  const d = Number.parseInt(day, 10);
  const h = Number.parseInt(hh, 10);
  const mi = Number.parseInt(mm, 10);
  if ([y, mo, d, h, mi].some((n) => !Number.isFinite(n))) return null;
  return partsToDate(y, mo, d, h, mi);
}

// Returns the current Madrid wall-clock instant encoded the same way as
// parseSidgadDate: UTC fields = Madrid components, getTime() comparable to
// a parseSidgadDate result.
export function nowInMadrid(): Date {
  const fmt = new Intl.DateTimeFormat('en-GB', {
    timeZone: MADRID_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
  const parts = fmt.formatToParts(new Date());
  const get = (type: string) => Number.parseInt(parts.find((p) => p.type === type)?.value ?? '0', 10);
  // en-GB gives hour '24' for midnight in some Node versions; normalise.
  const hour = get('hour') % 24;
  return partsToDate(get('year'), get('month'), get('day'), hour, get('minute'));
}