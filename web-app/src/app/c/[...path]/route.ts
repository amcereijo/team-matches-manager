import {
  buildGoogleCalendarUrl,
  formatSpanishKickoff,
  parseEventPath,
} from '@/lib/calendarEvent';

// Public calendar landing page — no iron-session, no auth, no I/O, no state.
// The URL is shared via WhatsApp to recipients who are NOT club admins.
//
// IMPORTANT: this route MUST NOT log IPs, user agents, or any other
// identifying information about the requester. Recipients' privacy depends
// on this.
//
// Why a landing page instead of putting the Google Calendar link straight in
// the message: a `calendar.google.com/...?a=1&b=2…` URL is long and full of
// `&` separators, which WhatsApp wraps mid-token — the link renders as broken
// fragments and stops being tappable as one unit. Path segments contain no
// `&`, so this page's URL survives the message intact, and the page gives the
// recipient something readable before they commit.
//
// Why no `.ics` and no `webcal://`: `https://` + an iCalendar payload makes
// Android and iOS download the file rather than hand it to the calendar app,
// and `webcal://` is not honoured by every browser/OS combination (on Android
// Chrome the button did nothing at all). The Google Calendar link is the one
// mechanism that works on both Android and desktop without a download.

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// `buildCalendarUrl` packs `<location> (<map URL>)` into a single segment.
function splitVenue(location: string): { venue: string; map: string | null } {
  const m = location.match(/^(.*?)\s*\((https?:\/\/[^)]+)\)$/);
  if (m) return { venue: m[1].trim(), map: m[2] };
  return { venue: location, map: null };
}

function buildPageHtml(event: {
  title: string;
  date: string;
  time: string;
  location: string;
}): string {
  const googleUrl = buildGoogleCalendarUrl(event);
  const when = formatSpanishKickoff(event.date, event.time);
  const { venue, map } = splitVenue(event.location);
  const title = escapeHtml(event.title);

  const venueBlock = venue
    ? `<p class="venue"><span aria-hidden="📍</span> ${escapeHtml(venue)}${
        map
          ? ` · <a class="map" href="${escapeHtml(map)}" target="_blank" rel="noopener noreferrer">Cómo llegar</a>`
          : ''
      }</p>`
    : '';

  const buttonBlock = googleUrl
    ? `<a class="add" href="${escapeHtml(googleUrl)}" target="_blank" rel="noopener noreferrer">
         <span aria-hidden>📆</span><span>Añadir al calendario</span>
       </a>`
    : `<p class="unavailable">No se pudo generar el enlace de calendario.</p>`;

  return `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="robots" content="noindex">
<meta name="color-scheme" content="light dark">
<title>${title} — Añadir al calendario</title>
<style>
:root{--bg:#f1f5f9;--surface:#fff;--border:#e2e8f0;--text:#0f172a;--muted:#475569;--subtle:#64748b;--accent:#2563eb;--accent-hover:#1d4ed8}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--text);font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;-webkit-font-smoothing:antialiased}
.page{min-height:100dvh;display:flex;align-items:center;justify-content:center;padding:24px}
.card{width:100%;max-width:440px;background:var(--surface);border:1px solid var(--border);border-radius:14px;box-shadow:0 4px 12px rgba(15,23,42,.08);padding:28px 24px;text-align:center}
.eyebrow{margin:0 0 6px;font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:var(--subtle)}
.title{margin:0 0 16px;font-size:22px;line-height:1.3;font-weight:700}
.when,.venue{margin:0 0 8px;font-size:15px;line-height:1.5;color:var(--muted)}
.when{font-weight:600;color:var(--text)}
a.map{color:var(--accent)}
a.add{display:flex;align-items:center;justify-content:center;gap:10px;width:100%;margin-top:22px;padding:15px 20px;font-size:16px;font-weight:600;color:#fff;background:var(--accent);border-radius:10px;box-shadow:0 1px 3px rgba(15,23,42,.08);text-decoration:none}
a.add:hover{background:var(--accent-hover)}
.hint{margin:12px 0 0;font-size:13px;line-height:1.5;color:var(--subtle)}
.unavailable{margin:22px 0 0;font-size:14px;color:var(--subtle)}
@media (prefers-color-scheme:dark){:root{--bg:#0f172a;--surface:#1e293b;--border:#334155;--text:#f1f5f9;--muted:#cbd5e1;--subtle:#94a3b8;--accent:#3b82f6;--accent-hover:#2563eb}}
</style>
</head>
<body>
<main class="page">
  <div class="card">
    <p class="eyebrow">Convocatoria</p>
    <h1 class="title">${title}</h1>
    <p class="when"><span aria-hidden>🗓</span> ${escapeHtml(when)}</p>
    ${venueBlock}
    ${buttonBlock}
    <p class="hint">Se abrirá Google Calendar para confirmar el evento${
      venue ? ` en ${escapeHtml(venue)}` : ''
    }.</p>
  </div>
</main>
</body>
</html>`;
}

const NOT_READY_HTML = `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>No disponible</title></head><body style="font-family:sans-serif;padding:24px"><h1>No se pudo abrir el partido</h1><p>Es posible que la fecha y la hora todavía no estén confirmadas por la federación. Inténtalo de nuevo cuando se publiquen.</p></body></html>`;

export async function GET(
  request: Request,
  ctx: { params: { path?: string[] } },
): Promise<Response> {
  const event = parseEventPath(ctx.params.path ?? []);

  // Opt-in diagnostic for "the link 400s but the fixture is fine". Answers
  // *how* the segments arrived (encoded once, twice, or split on the date's
  // slashes) without ever revealing who asked — the segments are fixture
  // data the organiser already owns, and nothing about the requester (IP,
  // user agent, session) is read or logged. Remove once the cause is settled.
  if (new URL(request.url).searchParams.has('debug')) {
    return new Response(
      `<!doctype html><meta charset="utf-8"><title>debug</title><pre>${escapeHtml(
        JSON.stringify(
          {
            segments: ctx.params.path ?? [],
            segmentCount: (ctx.params.path ?? []).length,
            parsed: event,
          },
          null,
          2,
        ),
      )}</pre>`,
      { status: 200, headers: { 'Content-Type': 'text/html; charset=utf-8' } },
    );
  }

  if (!event) {
    return new Response(NOT_READY_HTML, {
      status: 400,
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'public, max-age=300',
      },
    });
  }

  return new Response(buildPageHtml(event), {
    status: 200,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'public, max-age=300',
    },
  });
}