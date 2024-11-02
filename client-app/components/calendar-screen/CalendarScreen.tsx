import React from 'react';
import { View } from 'react-native';
import styles from './styles';
import MatchesTable from '../matches-table/MatchesTable';

const CalendarScreen = () => {
  return (
    <View style={styles.container}>
      <MatchesTable />
    </View>
  );
};

export default CalendarScreen;
