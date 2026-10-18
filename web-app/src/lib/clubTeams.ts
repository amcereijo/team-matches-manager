// Shared helpers for matching team names to a club's own squads. Lives in
// `lib/` (not `services/`) because it is imported by both server modules
// (`services/competition.ts`, which uses it to filter the agenda server-side)
// and client components (`app/(app)/calendario/MatchesBoard.tsx`, which uses
// it to derive the squad filter dropdown). Keeping a single definition
// guarantees the two surfaces agree on "what counts as my team".

export function normalizeClubName(name: string): string {
  return name.replace(/\s+/g, ' ').trim().toUpperCase();
}

export function clubAliases(name: string): string[] {
  const upper = normalizeClubName(name);
  const aliases = new Set<string>([upper]);
  for (const suffix of [' A', ' B', ' C', ' D', ' E']) {
    if (upper.endsWith(suffix)) {
      aliases.add(upper.slice(0, -suffix.length));
    }
  }
  return Array.from(aliases);
}

export function isClubMatch(team: string | null, aliases: string[]): boolean {
  if (!team) return false;
  const upper = normalizeClubName(team);
  return aliases.some((alias) => upper === alias || upper.startsWith(`${alias} `));
}