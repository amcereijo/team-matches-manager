// Both the FMP and FGP agendas are scraped from the same sidgad HTML, so they
// share the same `dd/mm/yyyy` (+ optional `hh:mm`) row format regardless of
// competition. Centralising the parser here keeps that format in one place.
export function parseSidgadDate(
  date?: string | null,
  time?: string | null,
): Date | null {
  if (!date) return null;
  const [day, month, year] = date.split('/');
  if (!day || !month || !year) return null;
  const [hh = '00', mm = '00'] = (time ?? '').split(':');
  const pad = (n: string) => n.padStart(2, '0');
  const d = new Date(
    `${year}-${pad(month)}-${pad(day)}T${pad(hh)}:${pad(mm)}:00`,
  );
  return isNaN(d.getTime()) ? null : d;
}