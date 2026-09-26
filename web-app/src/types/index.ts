import type { CompetitionId, Competition } from '@/constants/competitions';

export type { CompetitionId, Competition };

export type Game = {
  league: string | null;
  date: string | null;
  time: string | null;
  local: string | null;
  visit: string | null;
  location: string | null;
  map: string | null;
};

export type Field = {
  name: string;
  map: string | null;
};

export type Team = {
  name: string;
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
