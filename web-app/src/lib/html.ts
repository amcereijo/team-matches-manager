// HTML helpers shared by the public routes (`/c/[...]` and `/t/[...]`).
//
// Both routes hand-build their response as a string and write it straight to
// a `Response`. That means every value that came from the scraped sidgad feed
// — team names, venues, map URLs, kickoff strings — is interpolated into markup
// without React's automatic escaping anywhere in the path. These helpers are
// the only thing standing between a scraped `<script>` and the reader, so they
// live here rather than being duplicated per route.

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Split `<venue> (<map URL>)` back into its two parts.
 *
 * The single-match calendar link packs both into one path segment, so this is
 * its inverse. The `/t` team page does not need it — it reads `location` and
 * `map` as separate fields from the scraped fixture — but it stays here so
 * `/c` and `/t` share one venue-parsing definition.
 */
export function splitVenue(location: string): { venue: string; map: string | null } {
  const m = location.match(/^(.*?)\s*\((https?:\/\/[^)]+)\)$/);
  if (m) return { venue: m[1].trim(), map: m[2] };
  return { venue: location, map: null };
}