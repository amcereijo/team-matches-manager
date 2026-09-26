export type CompetitionId = 'FMP';

export type Competition = {
  id: CompetitionId;
  name: string;
  endpoint: string;
  idm: string;
  idTemp: string;
};

export const COMPETITIONS: Record<CompetitionId, Competition> = {
  FMP: {
    id: 'FMP',
    name: 'Federación Madrileña de Patinaje',
    endpoint: 'https://sidgad.cloud/shared/portales_files/agenda_portales.php',
    idm: '1',
    idTemp: '31',
  },
};

export const COMPETITION_LIST: Competition[] = Object.values(COMPETITIONS);
