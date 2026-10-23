## Why

The WhatsApp convocatoria reads in the wrong order. The squad's calendar link — the standing reference a player can return to — sits in the middle of the message, between the two links a volunteer actually acts on, and pushes the roster scaffold down. And the player roster is missing: the message asks for goalkeepers, a delegate, a scorer and absences, but never for the squad's players, so the volunteers have nowhere to write the numbers down.

## What Changes

- Move the `📅 Calendario del equipo:` block to the **bottom** of the message, after the roster scaffold, so the two action links stay together and the roster reads as one block.
- Add a `Jugadores:` roster block immediately after the `📅 Añadir al calendario:` link, separated from it and from the `Porteros:` block by one blank line on each side. It follows the same shape as the other roster lines (`Jugadores:` / `1.`), and it appears only when the add-to-calendar link is present — that is, for the ready matches the message is built for.
- The roster scaffold itself (`Porteros:` / `Delegado:` / `Anotador:` / `No puede:`) is byte-for-byte unchanged, and so is every other line of the message.

**Not breaking:** the message's content, its two links and their targets are unchanged; only their order and the added roster block move.

## Capabilities

### New Capabilities

None. This change adjusts an existing message contract.

### Modified Capabilities

- `match-send-tracking`: the requirement "Convocatoria includes a one-tap 'Add to calendar' link for ready matches" changes — the squad-calendar link moves to the bottom of the message, and a `Jugadores:` roster block is added after the add-to-calendar link.

## Impact

- **Changed code**: `src/app/(app)/calendario/MatchesBoard.tsx` — the message builder in `buildWhatsappUrl()`.
- **Unchanged**: both link builders, the short-link resolution, the `wa.me` deep link, and every other part of the message.
- **Data / APIs / dependencies**: none.
