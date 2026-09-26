import MatchesTable from './MatchesTable';
import styles from './CalendarScreen.module.css';

export default function CalendarScreen() {
  return (
    <div className={styles.container}>
      <MatchesTable />
    </div>
  );
}
