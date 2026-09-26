import { createBrowserRouter, Navigate, RouterProvider } from 'react-router-dom';
import Layout from './Layout';
import LoginScreen from './screens/LoginScreen';
import MainScreen from './screens/MainScreen';
import CalendarScreen from './screens/CalendarScreen';
import SettingsScreen from './screens/SettingsScreen';

function readInitialRedirect(): string {
  try {
    if (window.localStorage.getItem('login') !== 'true') return '/login';
    return window.localStorage.getItem('initialRoute') ?? '/';
  } catch {
    return '/login';
  }
}

function RootRedirect() {
  return <Navigate to={readInitialRedirect()} replace />;
}

const router = createBrowserRouter([
  { path: '/login', element: <LoginScreen /> },
  {
    element: <Layout />,
    children: [
      { path: '/', element: <MainScreen /> },
      { path: '/calendario', element: <CalendarScreen /> },
      { path: '/configuracion', element: <SettingsScreen /> },
    ],
  },
  { path: '*', element: <RootRedirect /> },
], {
  future: {
    v7_startTransition: true,
    v7_relativeSplatPath: true,
    v7_fetcherPersist: true,
    v7_normalizeFormMethod: true,
    v7_partialHydration: true,
    v7_skipActionErrorRevalidation: true,
  } as any,
});

export default function App() {
  return <RouterProvider router={router} />;
}
