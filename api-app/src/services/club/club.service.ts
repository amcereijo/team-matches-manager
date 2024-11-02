import { connectDatabase } from '../../config/db';
import { Club } from '../../models/club.entity';

export async function getClubs () {
  const connection = await connectDatabase();

  const clubRepository = connection.getRepository(Club);
  const clubs = await clubRepository.find();

  return clubs;
}
