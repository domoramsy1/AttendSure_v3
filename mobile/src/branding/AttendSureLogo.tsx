// D:\AttendSure_V3\mobile\src\branding\AttendSureLogo.tsx

import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Image } from 'expo-image';

const LOGO_SOURCE = require('../../assets/attendsure-logo.svg');

interface AttendSureLogoProps {
  size?: number;
}

export const AttendSureLogo: React.FC<AttendSureLogoProps> = ({ size = 48 }) => {
  return (
    <View style={[styles.container, { width: size, height: size, borderRadius: size / 2 }]}>
      <Image
        source={LOGO_SOURCE}
        style={{ width: size, height: size }}
        contentFit="contain"
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    backgroundColor: '#ffffff',
  },
});

export default AttendSureLogo;