import { Game } from './fmp';
import { getClubName as teamGetClubName } from './team';

function formatDate(date?: string | null): string {
  if (!date) return '';

  const [day, month, year] = date.split('/');
  const stringDate = `${year}-${month}-${day}`;
  const dateObj = new Date(stringDate);

  if (isNaN(dateObj.getTime())) {
    console.error('Invalid date');
    return '';
  }

  const options: Intl.DateTimeFormatOptions = {
    weekday: 'long',
    month: 'long',
    day: '2-digit',
  };
  return dateObj.toLocaleDateString('es-ES', options);
}

async function buildMessage(game: Game): Promise<string> {
  let text = '';
  text += `Próximo partido *${formatDate(game.date)}* a las *${game.time}* en ${game.location} - ${game.map}`;
  text += `\n\n${game.local} - ${game.visit}`;
  text += '\n\n1.';
  text += '\n\nPorteros:\n1.';
  text += '\n\nDelegado:';

  const loggedClubName = await teamGetClubName();
  if ((game.local || '').match(loggedClubName)) {
    text += '\nAnotador:';
  }

  text += '\n\nNo puede:';
  text += '\n\n';
  return text;
}

export async function openWhatsapp(game: Game): Promise<void> {
  const message = await buildMessage(game);
  const url = `https://wa.me/?text=${encodeURIComponent(message)}`;
  window.open(url, '_blank', 'noopener,noreferrer');
}
