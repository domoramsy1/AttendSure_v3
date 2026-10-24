import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

interface TechBlazerSignatureProps {
  size?: number;
}

export const TechBlazerSignature: React.FC<TechBlazerSignatureProps> = ({ size = 22 }) => {
  return (
    <View style={styles.container}>
      <Text style={styles.fromText}>from</Text>
      <View style={styles.brandRow}>
        <Text style={[styles.brandText, { fontSize: size }]}>TECHBLAZER</Text>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  fromText: {
    fontSize: 11,
    color: '#94a3b8',
    marginBottom: 3,
    textTransform: 'lowercase',
    letterSpacing: 0.5,
  },
  brandRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  brandText: {
    fontWeight: '800',
    color: '#0f172a',
    letterSpacing: 2.5,
  },
});

export default TechBlazerSignature;