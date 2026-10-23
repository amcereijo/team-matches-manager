import { resolveLink } from '@/lib/server/linkStore';
import { canonicalPathFor } from '@/lib/shortLink';
import { decodeFully } from '@/lib/calendarEvent';
import { escapeHtml } from '@/lib/html';

// Public short-link resolver — no iron-session, no auth, no cookies set.
//
// A short link is an opaque, revocable name for a page the app already
// serves. This route does one thing: it looks the name up and redirects to
// the canonical page. It never renders the page itself — `/t` and `/c` own
// their markup, their caching and their failure branches, and duplicating
// them here would mean two implementations of the same page.
//
// IMPORTANT: this route MUST NOT log IPs, user agents, or any other
// identifying information about the requester. Recipients' privacy depends
// on this. It is also read-only: resolving a link MUST NOT mutate any
// server-side state, so it can be cached by a CDN and by a player's phone.
//
// Unlike its siblings `/c` and `/t`, this route DOES depend on the server's
// store — the hash carries no information. The canonical URLs do not, and
// they remain the fallback for every link already in the wild.

const HTML_HEADERS = { 'Content-Type': 'text/html; charset=utf-8' };

// The redirect may be cached by a CDN and by the player's browser. Five
// minutes is the window in which a deactivated link can still resolve from
// a cache — the same number the /links page tells the club.
const REDIRECT_CACHE_CONTROL = 'public, max-age=300';

function plainPageHtml(title: string, message: string): string {
  return `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="robots" content="noindex">
<meta name="color-scheme" content="light dark">
<title>${title}</title>
<style>
:root{--bg:#f1f5f9;--surface:#fff;--border:#e2e8f0;--text:#0f172a;--muted:#475569}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--text);font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;-webkit-font-smoothing:antialiased}
.page{min-height:100dvh;display:flex;align-items:center;justify-content:center;padding:24px}
.card{width:100%;max-width:440px;background:var(--surface);border:1px solid var(--border);border-radius:14px;padding:28px 24px;text-align:center}
h1{margin:0 0 10px;font-size:20px;line-height:1.3}
p{margin:0;font-size:15px;line-height:1.55;color:var(--muted)}
@media (prefers-color-scheme:dark){:root{--bg:#0f172a;--surface:#1e293b;--border:#334155;--text:#f1f5f9;--muted:#cbd5e1}}
</style>
</head>
<body><main class="page"><div class="card"><h1>${escapeHtml(title)}</h1><p>${escapeHtml(message)}</p></div></main></body>
</html>`;
}

// The same page for every failure mode — a malformed hash, an unknown hash,
// a deactivated hash and a store that cannot be reached. One page for all of
// them means a stranger cannot tell which hashes exist, and the page names
// no table, no club and no upstream host.
const NOT_AVAILABLE_HTML = plainPageHtml(
  'Enlace no disponible',
  'Este enlace ya no está disponible. Comprueba el enlace que recibiste o pídele a tu delegado uno nuevo.',
);

export async function GET(
  _request: Request,
  ctx: { params: { hash: string } },
): Promise<Response> {
  // A link that has been through WhatsApp can arrive carrying an extra
  // encoding layer. `decodeFully` removes whatever is there; the hash is
  // alphanumeric, so a malformed escape just fails the alphabet check.
  const rawHash = decodeFully(ctx.params.hash ?? '');

  let link;
  try {
    link = await resolveLink(rawHash);
  } catch (err) {
    // Log the failure for the operator, but log the error object only — never
    // the request, the IP, or the user agent.
    console.error('[short-link] resolve failed', err);
    return new Response(NOT_AVAILABLE_HTML, {
      status: 404,
      headers: { ...HTML_HEADERS, 'Cache-Control': REDIRECT_CACHE_CONTROL },
    });
  }

  if (!link) {
    return new Response(NOT_AVAILABLE_HTML, {
      status: 404,
      headers: { ...HTML_HEADERS, 'Cache-Control': REDIRECT_CACHE_CONTROL },
    });
  }

  const target = canonicalPathFor(
    { code: link.clubCode, competition: link.competition },
    link.kind,
    link.payload,
  );

  if (!target) {
    return new Response(NOT_AVAILABLE_HTML, {
      status: 404,
      headers: { ...HTML_HEADERS, 'Cache-Control': REDIRECT_CACHE_CONTROL },
    });
  }

  // 302, not 308: the target of a link can legitimately change (a corrected
  // kickoff), and a permanent redirect would be cached far longer than the
  // app can honour.
  return new Response(null, {
    status: 302,
    headers: {
      Location: target,
      'Cache-Control': REDIRECT_CACHE_CONTROL,
    },
  });
}
