import { NextResponse } from 'next/server';
import { getCurrentClub } from '@/lib/sessionServer';
import {
  createOrReuseLink,
  listLinksForClub,
  setLinkActive,
} from '@/lib/server/linkStore';
import {
  linkView,
  type LinkKind,
  type LinkRequest,
  type LinkView,
} from '@/lib/shortLink';

// The management API for the club's short links.
//
// Every method takes the club from the iron-session, never from the body or
// the query string: a club must not be able to read, create or kill another
// club's links. This is the same rule the sent-match API follows.
//
// The public resolver at `/link/[hash]` is the only anonymous route in this
// feature; everything here is behind the session.

const LINK_KINDS: LinkKind[] = ['team_calendar', 'match_calendar'];

/**
 * The public origin of the app.
 *
 * `NEXT_PUBLIC_WEB_APP_URL` is the deployed origin and is set at build time;
 * it is the same rule the calendar links follow. Without it — local
 * development — the incoming request's own origin is used, so the URL the
 * club copies points at the server they are actually talking to.
 */
function resolveBaseUrl(request: Request): string {
  const configured = process.env.NEXT_PUBLIC_WEB_APP_URL;
  if (configured) return configured.replace(/\/$/, '');
  try {
    return new URL(request.url).origin;
  } catch {
    return '';
  }
}

function parseLinkRequest(raw: unknown): LinkRequest | null {
  if (!raw || typeof raw !== 'object') return null;
  const body = raw as Record<string, unknown>;

  const kind = body.kind;
  if (typeof kind !== 'string' || !LINK_KINDS.includes(kind as LinkKind)) return null;

  if (kind === 'team_calendar') {
    const squad = typeof body.squad === 'string' ? body.squad.trim() : '';
    if (!squad) return null;
    // The league is part of the squad's identity: the same team name exists
    // in several leagues, and only the pair names one team. It is optional so
    // a hand-typed squad without a league still resolves (to an empty
    // calendar, never an error).
    const league = typeof body.league === 'string' ? body.league.trim() : '';
    return { kind: 'team_calendar', squad, league: league || null };
  }

  const date = typeof body.date === 'string' ? body.date.trim() : '';
  const time = typeof body.time === 'string' ? body.time.trim() : '';
  const local = typeof body.local === 'string' ? body.local.trim() : '';
  const visit = typeof body.visit === 'string' ? body.visit.trim() : '';
  if (!date || !time || !local || !visit) return null;

  const location = typeof body.location === 'string' ? body.location : null;
  const map = typeof body.map === 'string' ? body.map : null;
  const localCode = typeof body.localCode === 'number' ? body.localCode : null;
  const visitCode = typeof body.visitCode === 'number' ? body.visitCode : null;

  return {
    kind: 'match_calendar',
    date,
    time,
    local,
    visit,
    localCode,
    visitCode,
    location,
    map,
  };
}

export async function GET(request: Request) {
  const club = await getCurrentClub();
  if (!club) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const links = await listLinksForClub(club);
  const baseUrl = resolveBaseUrl(request);

  return NextResponse.json({
    links: links.map((link) => linkView(link, baseUrl)),
  });
}

export async function POST(request: Request) {
  const club = await getCurrentClub();
  if (!club) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  if (!body || typeof body !== 'object') {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  // A batch is accepted so the Enviar flow needs ONE round trip for both
  // kinds. A single request object is accepted too, for convenience.
  const rawItems = Array.isArray((body as Record<string, unknown>).links)
    ? ((body as Record<string, unknown>).links as unknown[])
    : [body];

  if (rawItems.length === 0) {
    return NextResponse.json({ error: 'No links requested' }, { status: 400 });
  }

  const requests: LinkRequest[] = [];
  for (const raw of rawItems) {
    const parsed = parseLinkRequest(raw);
    if (!parsed) {
      return NextResponse.json(
        { error: 'Invalid link request: kind, and the fields it needs, are required' },
        { status: 400 },
      );
    }
    requests.push(parsed);
  }

  // NOTE: the request body may carry a `clubCode`/`competition` field. It is
  // ignored — the owning club comes from the session, always.

  const baseUrl = resolveBaseUrl(request);
  const links: LinkView[] = [];

  for (const linkRequest of requests) {
    const link = await createOrReuseLink(club, linkRequest.kind, linkRequest);
    links.push(linkView(link, baseUrl));
  }

  return NextResponse.json({ links }, { status: 200 });
}

export async function PATCH(request: Request) {
  const club = await getCurrentClub();
  if (!club) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  if (!body || typeof body !== 'object' || !('hash' in body)) {
    return NextResponse.json({ error: 'hash is required' }, { status: 400 });
  }

  const { hash, active } = body as { hash: unknown; active: unknown };
  if (typeof hash !== 'string' || !hash) {
    return NextResponse.json({ error: 'hash must be a non-empty string' }, { status: 400 });
  }
  if (typeof active !== 'boolean') {
    return NextResponse.json({ error: 'active must be a boolean' }, { status: 400 });
  }

  const updated = await setLinkActive(club, hash, active);
  if (!updated) {
    // Refused. The caller cannot tell "no such link" from "not yours", and
    // neither is a link the requesting club may touch.
    return NextResponse.json({ error: 'Link not found' }, { status: 404 });
  }

  return NextResponse.json({ ok: true, hash, active });
}
