import React, { useState } from 'react';
import { View, TextInput, Button, Text } from 'react-native';
import Picker from 'react-native-picker-select';

import styles from './styles';
import { CLUBS, CLUBS_MAP, ClubType, getClubName } from '../../constants/clubs';
import AsyncStorage from '@react-native-async-storage/async-storage';

// This is a simple login screen that checks for a hardcoded username and password
const USER = 'tiso';
const PASSWORD = 'tiso';
const TEAM = 411;

const LoginScreen = ({navigation}: {navigation: any}) => {
  const [team, setTeam] = useState<ClubType | null>(null);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  const submit = async () => {
    const data = { team, username, password };
    // console.log(data);

    if (team?.code === TEAM && username === USER && password === PASSWORD) {
      await AsyncStorage.setItem('login', 'true');
      await AsyncStorage.setItem('club', JSON.stringify(team));
      navigation.push('DrawerNavigator');
      return;
    }

    setError(`Invalid username or password for team ${team}`);
  };

  return (
    <View style={styles.container}>
        <Picker
        value={team?.code || 0}
        itemKey={team?.code || 0}
        placeholder={{label: "Selecciona tu club", value: 0}}
        onValueChange={(itemValue: number) => {
          if (!itemValue) return;
          setTeam(CLUBS_MAP[itemValue]);
        }}
        style={{
          inputWeb: styles.picker
        }}
        items={CLUBS.map((club) => ({ label: club.name, value: club.code }))}
      />


      <TextInput
        value={username}
        onChangeText={setUsername}
        placeholder="Username"
        style={styles.input}
      />

      <TextInput
        value={password}
        onChangeText={setPassword}
        placeholder="Password"
        secureTextEntry
        style={styles.input}
      />

      <Button title="Entrar" onPress={submit} />

      <Text style={{ color: 'red' }}>{error}</Text>
    </View>
  );
};

export default LoginScreen;
