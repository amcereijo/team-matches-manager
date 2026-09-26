import { redirect } from 'next/navigation';
import { getCurrentClub } from '@/lib/sessionServer';
import { LoginForm } from './LoginForm';
import { CLUBS } from '@/constants/clubs';
import { COMPETITION_LIST } from '@/constants/competitions';
import styles from './login.module.css';

export default async function LoginPage() {
  const club = await getCurrentClub();
  if (club) {
    redirect('/');
  }
  return (
    <div className={styles.page}>
      <LoginForm competitions={COMPETITION_LIST} clubs={CLUBS} />
    </div>
  );
}
