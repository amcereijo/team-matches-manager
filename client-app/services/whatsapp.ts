import { Linking } from "react-native";
import { Game } from "./fmp";
import { getClubName as teamGetClubName } from "./team";

const formatDate = (date?: string) => {
  if (!date) return '';

  const [day, month, year] = date.split('/');
  const stringDate = `${year}-${month}-${day}`;
  const dateObj = new Date(stringDate);

  if (isNaN(dateObj.getTime())) {
    console.error('Invalid date');
    return '';
  }

  const options: Intl.DateTimeFormatOptions = { weekday: 'long', month: 'long', day: '2-digit' };
  return dateObj.toLocaleDateString('es-ES', options);
}

async function createMessages(game: Game) {
  let text = '';
  text += `Próximo partido *${formatDate(game.date!)}* a las *${game.time}* en ${game.location} - ${game.map}`;
  text += `\n\n${game.local} - ${game.visit}`;
  text += '\n\n1.';
  text += '\n\nPorteros:\n1.';
  text += '\n\nDelegado:';


  const loggedClubName = await teamGetClubName();
  if ((game.local || '').match(loggedClubName)) {
    text += '\nAnotador:';
  }

  text += '\n\nNo puede:'
  text += '\n\n';

  return text;
}

export async function openWhatsapp(game: Game) {
  const message = await createMessages(game);
  const url = `https://wa.me/?text=${message}`;
  const encoded = encodeURI(url);
  try {
    await Linking.openURL(encoded);
  } catch (err) {
    console.error(err)
  }
}
