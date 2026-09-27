import React, { useState } from 'react';
import { View, TextInput, Button, Text } from 'react-native';
import Picker from 'react-native-picker-select';

import styles from './styles';
import { CLUBS, CLUBS_MAP, ClubType, getClubName } from '../../constants/clubs';
import AsyncStorage from '@react-native-async-storage/async-storage';

// TODO: move to client-app/constants/api.ts (or env-driven via EXPO_PUBLIC_*)
// once the production Vercel domain is finalized. For now the login screen
// posts directly to the web app's /api/auth/login so credentials never leave
// the server bundle — see openspec/changes/move-club-credentials-to-env.
const API_BASE = 'https://team-matches-manager.vercel.app/api';

const LoginScreen = ({navigation}: {navigation: any}) => {
  const [team, setTeam] = useState<ClubType | null>(null);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (busy) return;
    setError('');
    setBusy(true);

    try {
      const response = await fetch(`${API_BASE}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });

      if (response.status < 200 || response.status >= 300) {
        let message = `Invalid username or password for team ${team}`;
        try {
          const data = await response.json();
          if (data && typeof data.error === 'string') {
            message = data.error;
          }
        } catch {}
        setError(message);
        return;
      }

      const data = (await response.json()) as { ok: boolean; club: ClubType };
      const club = data?.club ?? team;
      if (!club) {
        setError(`Invalid username or password for team ${team}`);
        return;
      }

      await AsyncStorage.setItem('login', 'true');
      await AsyncStorage.setItem('club', JSON.stringify(club));
      navigation.push('DrawerNavigator');
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Network error, please try again',
      );
    } finally {
      setBusy(false);
    }
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
        autoCapitalize="none"
        autoCorrect={false}
      />

      <TextInput
        value={password}
        onChangeText={setPassword}
        placeholder="Password"
        secureTextEntry
        style={styles.input}
        autoCapitalize="none"
        autoCorrect={false}
      />

      <Button title={busy ? 'Entrando…' : 'Entrar'} onPress={submit} disabled={busy} />

      <Text style={{ color: 'red' }}>{error}</Text>
    </View>
  );
};

export default LoginScreen;
