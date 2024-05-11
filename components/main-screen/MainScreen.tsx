import React from 'react';
import { View, Text } from 'react-native';
import styles from './styles';
import { getTeamCode } from '../../services/team';
import { getClubName } from '../../constants/clubs';

const MainScreen = () => {
  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.teamText}>Bienvenido</Text>
        <Text style={styles.welcomeText}>, está gestionando el club </Text>
        <Text style={styles.teamText}>{getClubName(Number(getTeamCode()))}</Text>
      </View>
    </View>
  );
};

export default MainScreen;
