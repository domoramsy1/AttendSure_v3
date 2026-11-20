/**
 * AttendSure Mobile - Root Stack Navigator
 * File: mobile/src/navigation/AppNavigator.tsx
 */

import React from 'react';
import { View, ActivityIndicator, StyleSheet } from 'react-native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';

import { useAuth } from '../context/AuthContext';
import { useThemeMode } from '../context/ThemeContext';
import LoginScreen from '../screens/LoginScreen';
import MainTabNavigator from './MainTabNavigator';
import ProfileSettingsScreen from '../screens/ProfileSettingsScreen';
import ReportsScreen from '../screens/ReportsScreen';

export type RootStackParamList = {
  Login: undefined;
  Main: undefined;
  ProfileSettings: undefined;
  Reports: undefined;
};

const Stack = createNativeStackNavigator<RootStackParamList>();

export const AppNavigator: React.FC = () => {
  const { user, isLoading, loading } = useAuth();
  const { palette } = useThemeMode();
  const isCheckingSession = Boolean(isLoading ?? loading);

  if (isCheckingSession) {
    return (
      <View style={[styles.loadingContainer, { backgroundColor: palette.background }]}>
        <ActivityIndicator size="large" color={palette.primary} />
      </View>
    );
  }

  return (
    <Stack.Navigator
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: palette.background },
      }}
    >
      {!user ? (
        <Stack.Screen name="Login" component={LoginScreen} />
      ) : (
        <>
          <Stack.Screen name="Main" component={MainTabNavigator} />
          <Stack.Screen
            name="ProfileSettings"
            component={ProfileSettingsScreen}
            options={{
              headerShown: false,
              animation: 'slide_from_right',
            }}
          />
          <Stack.Screen
            name="Reports"
            component={ReportsScreen}
            options={{
              headerShown: false,
              animation: 'slide_from_right',
            }}
          />
        </>
      )}
    </Stack.Navigator>
  );
};

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
});

export default AppNavigator;