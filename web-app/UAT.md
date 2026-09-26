# Manual UAT checklist (web-app)

Use this to walk through the scenarios in
`openspec/changes/add-web-app-vercel-deploy/specs/web-client/spec.md`
before shipping. None of these are automated yet.

Start the dev server:

```bash
cd web-app
npm install   # one-time
npm run dev   # http://localhost:5173
```

## Scenarios

- [ ] **Successful login**
  - Open `/login`, select `TISO PATIN` (code 411), enter `tiso` / `tiso`,
    click **Entrar**. Land on `/` (Inicio) showing "Bienvenido, está
    gestionando el club TISO PATIN".
- [ ] **Failed login**
  - Same screen, wrong password or a different club, click **Entrar**.
    Red error appears, you stay on `/login`.
- [ ] **Reload while logged in**
  - While logged in, press the browser reload button. Land on the
    Inicio / Calendario / Configuración screen per your saved setting.
- [ ] **Reload while logged out**
  - Logout, then reload. Land on `/login`.
- [ ] **Navigate to Calendario**
  - Click **Calendario** in the drawer. Loading spinner appears, then
    either a list of matches or "No hay próximos partidos".
- [ ] **Share via WhatsApp**
  - Click **Enviar** on a match row. A new tab opens `wa.me/?text=...`
    pre-filled with the match message.
- [ ] **Change initial screen**
  - Go to **Configuración**, pick **Calendario** in the picker. Reload
    — the app should now open on `/calendario`.
- [ ] **Logout from Inicio**
  - From Inicio, click **Cerrar sesión**. Storage is cleared, you land
    on `/login`.

## Known manual-only follow-ups (not blockers)

- Visual styling is adapted from the React Native `StyleSheet`. Pixel
  parity with `client-app/` is not a goal of this change.
- The Calendario screen posts to the FMP endpoint directly from the
  browser; if your network blocks CORS, you'll see "No se pudo cargar
  la agenda" — that's the README's documented follow-up.
