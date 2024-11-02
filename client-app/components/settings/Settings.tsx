import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { useEffect, useState } from 'react';
import { View, Text, Button } from 'react-native';
import { Picker } from '@react-native-picker/picker';
import { styles } from './styles';

const SettingsView = () => {
  const [initialRoute, setInitialRoute] = useState<string>('Inicio');

  const storeInitialRoute = async (value: string) => {
    try {
      await AsyncStorage.setItem('initialRoute', value);
      setInitialRoute(value)
      console.log('Initial route stored');
    } catch (e) {
      console.error('Error storing initial route', e);
    }
  }

  useEffect(() => {
    const fetchData = async () => {
      const value = await AsyncStorage.getItem('initialRoute') || 'Inicio';
      setInitialRoute(value);
      console.log('Initial route fetched', initialRoute);
    };

    fetchData();

    return () => {
      // Cleanup logic here if needed
    };
  }, [initialRoute]);

  return (
    <View style={styles.container}>
      <View style={styles.column}>
        <View style={styles.row}>
        <Text style={styles.title}>Pantalla inicial:</Text>
          <Picker
            selectedValue={initialRoute}
            style={styles.picker}
            onValueChange={(itemValue: string) => storeInitialRoute(itemValue)}
          >
            <Picker.Item label="Inicio" value="Inicio" />
            <Picker.Item label="Calendario" value="Calendario" />
            <Picker.Item label="Configuración" value="Configuracion" />
          </Picker>
        </View>
      </View>
      <View style={styles.column}>
        {/* Add additional content here */}
      </View>
    </View>
  );
};

export default SettingsView;
