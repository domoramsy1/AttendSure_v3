// D:\AttendSure_V3\mobile\src\branding\AttendSureLogo.tsx

import React from 'react';
import { StyleSheet, View, ViewStyle } from 'react-native';
import { Image } from 'expo-image';

const LOGO_SOURCE = require('../../assets/splash.svg');

interface AttendSureLogoProps {
  size?: number;
  style?: ViewStyle;
}

export const AttendSureLogo: React.FC<AttendSureLogoProps> = ({ size = 48, style }) => {
  return (
    <View
      style={[
        styles.container,
        {
          width: size,
          height: size,
          borderRadius: size / 2,
        },
        style,
      ]}
    >
      <Image
        source={LOGO_SOURCE}
        style={{ width: size, height: size }}
        contentFit="contain"
        priority="high"
        cachePolicy="memory-disk"
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