# Team Matches Manager — Web

Vite + React + TypeScript port of the React Native client app
(`/client-app`). Ships the same login → drawer → calendar → WhatsApp flow
to any modern browser so a coach can check the next match from a laptop
without installing the native app.

The web app talks to the same FMP endpoint the mobile app uses and stores
login state in `localStorage`. No backend change.

## Develop

```bash
cd web-app
npm install
npm run dev          # http://localhost:5173
```

## Build

```bash
npm run build        # tsc --noEmit && vite build, output -> web-app/dist
npm run preview      # serve the built bundle locally
```

## Deploy to Vercel

Vercel's Vite preset is detected automatically:

1. Install the CLI if needed: `npm i -g vercel`.
2. From inside `web-app/`, run `vercel` and accept the prompts (project
   name, framework preset: **Vite**). Vercel infers `build` and `output`
   from the preset — no `vercel.json` is required for the happy path.
3. Promote the staging deployment with `vercel --prod`. Capture the
   production URL and paste it into the "Production URL" section below.

### SPA deep-link reloads

If Vercel returns a 404 for a deep-link such as `/calendario` on reload,
add a `vercel.json` next to `package.json` with:

```json
{
  "rewrites": [{ "source": "/(.*)", "destination": "/" }]
}
```

The preset handles most cases; this rewrite is a fallback.

## Hardcoded credentials (matching `client-app`)

| Field    | Value            |
| -------- | ---------------- |
| Club     | `TISO PATIN` (411) |
| Username | `tiso`           |
| Password | `tiso`           |

## Production URL

<!-- Paste the Vercel production URL after `vercel --prod`. -->
