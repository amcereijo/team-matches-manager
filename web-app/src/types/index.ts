import type { CompetitionId, Competition } from '@/constants/competitions';

export type { CompetitionId, Competition };

export type CompetitionListItem = {
  id: CompetitionId;
  name: string;
};

export type Game = {
  league: string | null;
  date: string | null;
  time: string | null;
  local: string | null;
  visit: string | null;
  location: string | null;
  map: string | null;
  localCode: number | null;
  visitCode: number | null;
  gameId: number | null;
};

export type Field = {
  name: string;
  map: string | null;
};

export type Team = {
  name: string;
};

/**
 * A squad of the club: the team as the federation names it, plus the league
 * it plays in.
 *
 * The league is part of the identity, not decoration. A club fields the same
 * team name in several leagues (`DOMINICOS A` in ALEVÍN GRUPO A, INFANTIL
 * GRUPO B, JUVENIL GRUPO B and SENIOR MASCULINO), and each of those is a
 * separate team with its own fixtures. Anything that identifies "which of my
 * teams" — the Calendario filter, the squad calendar link, the public team
 * calendar page — must therefore carry the league too.
 */
export type Squad = {
  name: string;
  league: string | null;
};

export type ClubType = {
  code: number;
  name: string;
  competition: CompetitionId;
  username: string;
};

export type MatchesResponse = {
  competition: CompetitionId;
  club: { code: number; name: string };
  teams: Team[];
  fields: Field[];
  matches: Game[];
};
