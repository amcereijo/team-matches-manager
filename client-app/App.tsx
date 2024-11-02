import React, { useEffect, useState } from 'react';
import 'react-native-gesture-handler';

import { createStackNavigator  } from "@react-navigation/stack";
import { NavigationContainer } from '@react-navigation/native';
import { DrawerNavigator } from './components/drawer-natigator/DrawerNavigator';

import LoginScreen from './components/login-screen/LoginScreen';
import AsyncStorage from '@react-native-async-storage/async-storage';

const Stack = createStackNavigator();

enum Login {
  PENDING= 'pending',
  TRUE = 'true',
  FALSE = 'false'
}
export default function App() {
  const [loged, setLoged] = useState<Login>(Login.PENDING);

  useEffect(() => {
    const fetchData = async () => {
      const value = await AsyncStorage.getItem('login');
      setLoged(value === 'true' ? Login.TRUE : Login.FALSE);
      console.log('Login  fetched', value);
    };

    fetchData();

    return () => {
      // Cleanup logic here if needed
    };
  }, [loged]);


  const view = loged === Login.FALSE ? 'Sesion' : 'DrawerNavigator';
  console.log('Show view', view)
  console.log('Loged', loged)

  return loged === Login.PENDING ?
    (<></>)
   :(
    <NavigationContainer>
      <Stack.Navigator initialRouteName={view}>
        <Stack.Screen name="Sesion" component={LoginScreen} options={{ headerShown: false }}/>
        <Stack.Screen name="DrawerNavigator" component={DrawerNavigator} options={{ headerShown: false }} />
      </Stack.Navigator>
    </NavigationContainer>
  );
}
