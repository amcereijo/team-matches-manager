import { createDrawerNavigator } from "@react-navigation/drawer";
import MainScreen from "../main-screen/MainScreen";
import CalendarScreen from "../calendar-screen/CalendarScreen";
import { useEffect, useState } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import SettingsScreen from "../settings/Settings";

const Drawer = createDrawerNavigator();
export const DrawerNavigator = () => {
  const [initialRoute, setInitialRoute] = useState<string>();

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



  return initialRoute ? (
    <Drawer.Navigator initialRouteName={initialRoute}>
      <Drawer.Screen name="Inicio" component={MainScreen} />
      <Drawer.Screen name="Calendario" component={CalendarScreen} />
      <Drawer.Screen name="Configuracion" component={SettingsScreen} />
    </Drawer.Navigator>
  ) : null;
};
