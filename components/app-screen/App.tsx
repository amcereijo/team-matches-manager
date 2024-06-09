import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { DrawerNavigator } from '../drawer-natigator/DrawerNavigator';
import 'react-native-gesture-handler';

export default function AppScreen() {
  return (
    <NavigationContainer>
      <DrawerNavigator/>
    </NavigationContainer>
  );
}
