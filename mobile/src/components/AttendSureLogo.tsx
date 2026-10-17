import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import AttendSureLogo from '../components/AttendSureLogo';

export default function LoginScreen() {
  return (
    <View style={styles.container}>
      {/* Renders your vector SVG logo cleanly on the screen */}
      <AttendSureLogo />
      
      <Text style={styles.title}>AttendSure</Text>
      <Text style={styles.subtitle}>DepEd Attendance & Gate Security</Text>
      
      {/* Your rest of your login form inputs and buttons here */}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#f8fafc',
    padding: 20,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#004b87',
    marginTop: 12,
  },
  subtitle: {
    fontSize: 14,
    color: '#64748b',
    marginBottom: 24,
  },
});