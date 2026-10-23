## Context

See `proposal.md` — Why, for the motivation. This change is a layout fix to one function: `buildWhatsappUrl()` in `src/app/(app)/calendario/MatchesBoard.tsx`, the only place the WhatsApp message is assembled.

The message today is built by appending to a single `text` string, block by block:

```
*{local} - {visit}*
🗓 {day}, {time}
📍 {location}
🗺 {map}
📅 Añadir al calendario:
{url}
📅 Calendario del equipo:
{url}
Porteros:
1.
Delegado:
[Anotador:]
No puede:
```

Two constraints shape the fix:

- **The blocks are positional.** Every block is appended in source order, so "move the team link to the bottom" is a matter of moving one `if` block — and the blank line that introduces it has to travel with it, or the spacing goes wrong.
- **The roster scaffold is pinned.** `match-send-tracking` states that the `Porteros:` / `Delegado:` / `Anotador:` / `No puede:` block is byte-for-byte identical to its current form. This change keeps that block exactly as it is; only the blocks around it move.

## Goals / Non-Goals

**Goals:**

- The squad-calendar link is the last block of the message.
- A `Jugadores:` / `1.` roster block sits right after the add-to-calendar link, with one blank line on each side.
- Every other line of the message is unchanged, including the roster scaffold.

**Non-Goals:**

- No change to the links, their targets, the short-link resolution or the `wa.me` deep link.
- No change to which matches get a message (the Enviar button's readiness gate is untouched).
- No new roster fields — the other roster lines keep their current shape, and the `Jugadores:` block mirrors them rather than inventing a format.

## Decisions

### D1 — The `Jugadores:` block hangs off the add-to-calendar link, not off the roster

The block is emitted **inside** the `if (calendarUrl)` branch, right after the link. The alternative — emitting it with the rest of the roster scaffold — would put a `Jugadores:` list in a message that has no add-to-calendar link, i.e. a player roster in a message that never asks for one.

It also keeps the code honest about the dependency: the block exists because that link exists, and the two disappear together.

### D2 — The team link keeps its blank line, and the message keeps its trailing newlines

The current builder emits `'\n\n'` between the roster and the end of the message. Moving the team link to the bottom keeps the same shape as the other link blocks — a blank line, then `📅 Calendario del equipo:`, then the URL — so the message reads the same way wherever a reader lands on it.

The trailing `'\n\n'` stays at the very end, after the team link, so the message still ends with a clean line break and WhatsApp does not glue the last line to the input field.

### D3 — No new formatter abstraction

The message is assembled by string concatenation in one function. A template literal with placeholders would be tidier, but it would be a rewrite of a function that works and that `match-send-tracking` pins scenario by scenario. Two `if` blocks move; the rest of the function is untouched.

## Risks / Trade-offs

- **[A message already pasted into a WhatsApp group does not change]** → The layout only affects messages built from now on. Nothing breaks: the old and new messages carry the same links, the same facts and the same roster fields.
- **[The `Jugadores:` block is easy to forget when the link is omitted]** → It lives inside the same `if` as the link, so the two cannot drift apart.
- **[The blank line before the team link could be lost in a future move]** → The link block carries its own leading `\n\n`, the same as it did in its old position.
