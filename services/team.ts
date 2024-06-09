import AsyncStorage from '@react-native-async-storage/async-storage';
import { ClubType } from '../constants/clubs';

export async function getClub() {
  const club = await AsyncStorage.getItem('club');
  if (!club) {
    return null;
  }
  const clubObject: ClubType = JSON.parse(club);
  return clubObject;
}

export async function getClubname() {
  const club = await getClub();
  if (!club) {
    return 'No team selected';
  }
  return club.name;
}

export async function getClubCode(){
  const club = await getClub();
  if (!club) {
    return 0;
  }

  return club.code;
}
