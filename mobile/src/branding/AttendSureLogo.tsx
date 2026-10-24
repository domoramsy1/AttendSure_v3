// D:\AttendSure_V3\mobile\src\components\AttendSureLogo.tsx

import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';

const getAppLogo = () => {
  try {
    return require('../../assets/attendsure-logo.png');
  } catch {
    try {
      return require('../../assets/icon.png');
    } catch {
      return null;
    }
  }
};

const LOGO_SOURCE = getAppLogo();

interface AttendSureLogoProps {
  size?: number;
}

export const AttendSureLogo: React.FC<AttendSureLogoProps> = ({ size = 48 }) => {
  return (
    <View style={[styles.container, { width: size, height: size }]}>
      {LOGO_SOURCE ? (
        <Image
          source={LOGO_SOURCE}
          style={{ width: size, height: size }}
          contentFit="contain"
        />
      ) : (
        <Ionicons name="school" size={Math.round(size * 0.75)} color="#004b87" />
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
  },
});

export default AttendSureLogo;