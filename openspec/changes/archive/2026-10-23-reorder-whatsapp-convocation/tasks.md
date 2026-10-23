# Tasks

## 1. The message layout

- [x] 1.1 In `buildWhatsappUrl()` (`src/app/(app)/calendario/MatchesBoard.tsx`), add the `Jugadores:` / `1.` block immediately after the `📅 Añadir al calendario:` link, inside the same `if (calendarUrl)` branch, separated from the link and from the `Porteros:` block by one blank line on each side.
- [x] 1.2 Move the `📅 Calendario del equipo:` block to the end of the message — after the `No puede:` block — keeping its leading blank line, and keep the message's trailing newlines after it.
- [x] 1.3 Leave the `Porteros:` / `Delegado:` / `Anotador:` / `No puede:` scaffold, the fixture facts, both link builders and the short-link resolution untouched.

## 2. Verification

- [x] 2.1 Type-check, lint and build pass with no new warnings.
- [x] 2.2 Build the message for a ready match and assert the exact block order: header → facts → `📅 Añadir al calendario:` → `Jugadores:` / `1.` → `Porteros:` / `1.` → `Delegado:` → `No puede:` → `📅 Calendario del equipo:`, with exactly one blank line on each side of the `Jugadores:` block.
- [x] 2.3 Build the message for a pending match (no confirmed kickoff) and assert the `📅 Añadir al calendario:` line AND the `Jugadores:` block are both absent, while the `📅 Calendario del equipo:` line is still present.
- [x] 2.4 Assert the roster scaffold (`Porteros:` / `Delegado:` / `Anotador:` / `No puede:`) is byte-for-byte the same as before this change, and that every other line of the message is unchanged.
- [x] 2.5 Assert neither URL carries a `&` or `?` character, and that both still resolve (short link → canonical page).

> **How 2.2-2.5 were verified.** The message builder was compiled out of the real module and driven directly, so the assertions ran against the shipped code — not against a copy of it. The ready-match message was asserted byte-for-byte against the expected layout, and the short-link substitution was asserted to leave the layout identical.
