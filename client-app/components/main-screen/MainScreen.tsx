import React, { useEffect, useState } from 'react';
import { View, Text, Button } from 'react-native';
import styles from './styles';
import { getClub } from '../../services/team';
import { ClubType } from '../../constants/clubs';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useNavigation} from "@react-navigation/core";

const MainScreen = ({navigation}: {navigation: any}) => {
  const nav = useNavigation();
  const [club, setClub] = useState<ClubType | null>(null);

  useEffect(() => {
    const getSeletedClub = async () => {
      const club = await getClub();
      setClub(club);
    };
    getSeletedClub();
  });

  const submit = async () => {
    console.log('Logout');
    await AsyncStorage.setItem('login', 'false');
    await AsyncStorage.setItem('club', '');
    navigation.navigate('Sesion');
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.teamText}>Bienvenido</Text>
        {club &&
          (
            <>
            <Text style={styles.welcomeText}>, está gestionando el club </Text>
            <Text style={styles.teamText}>{club?.name}</Text>
            </>
          )
        }
      </View>

      <View style={styles.header}>
        <Button title="Cerrar session" onPress={submit} />
      </View>
    </View>
  );
};

export default MainScreen;
