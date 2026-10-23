import { headers } from 'next/headers';
import { getCurrentClub } from '@/lib/sessionServer';
import { listLinksForClub } from '@/lib/server/linkStore';
import { linkView } from '@/lib/shortLink';
import { squadsForMatches } from '@/lib/clubTeams';
import { getMatchesForClub } from '@/services/competition';
import { LinkList } from './LinkList';

export const dynamic = 'force-dynamic';

// The club's short links.
//
// Same shape as the Calendario: a server component reads the store and hands
// the rows to a client component that owns the actions (copy, deactivate,
// re-activate, create).
//
// The page lives inside the protected `(app)` layout, so an anonymous
// request never reaches it — the layout redirects to `/login` first.

/**
 * The public origin of the app, for the absolute short URLs the club copies.
 *
 * `NEXT_PUBLIC_WEB_APP_URL` is the deployed origin and is set at build time;
 * it is the same rule the calendar links follow. Without it — local
 * development — the incoming request's own host is used.
 */
function resolveBaseUrl(): string {
  const configured = process.env.NEXT_PUBLIC_WEB_APP_URL;
  if (configured) return configured.replace(/\/$/, '');

  const requestHeaders = headers();
  const host = requestHeaders.get('x-forwarded-host') ?? requestHeaders.get('host');
  if (!host) return '';
  const proto =
    requestHeaders.get('x-forwarded-proto') ??
    (host.startsWith('localhost') || host.startsWith('127.0.0.1') ? 'http' : 'https');
  return `${proto}://${host}`;
}

export default async function LinksPage() {
  const club = await getCurrentClub();
  if (!club) return null;

  const baseUrl = resolveBaseUrl();

  const links = await listLinksForClub(club);

  // The squad picker offers the club's own squads, derived from the fixture
  // data exactly as the Calendario's team filter derives them. A squad typed
  // by hand is accepted too: an unmatched squad resolves to an empty
  // calendar, not an error — the `/t` contract already in force.
  let squads: string[] = [];
  try {
    const data = await getMatchesForClub(club);
    squads = squadsForMatches(data.matches, club.name);
  } catch (err) {
    console.error('[links] failed to load squads', err);
  }

  return (
    <LinkList
      initialLinks={links.map((link) => linkView(link, baseUrl))}
      squads={squads}
    />
  );
}
