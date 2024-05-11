import React, { useEffect, useState } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { DrawerNavigator } from './components/drawer-natigator/DrawerNavigator';
import 'react-native-gesture-handler';

export default function App() {
  return (
    <NavigationContainer>
      <DrawerNavigator/>
    </NavigationContainer>
  );
}
