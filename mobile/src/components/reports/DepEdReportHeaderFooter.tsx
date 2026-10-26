/**
 * AttendSure - DepEd Manual of Style (DMOS) Mobile Header & Footer
 * File: mobile/src/components/reports/DepEdReportHeaderFooter.tsx
 */

import React from 'react';
import { View, Text, StyleSheet, Platform } from 'react-native';
import { Image } from 'expo-image';

interface DepEdHeaderProps {
  leftLogoUrl?: string | null;  
  rightLogoUrl?: string | null; 
  region?: string;
  division?: string;
  formTitle: string;
  formSubtitle?: string;
}

interface DepEdFooterProps {
  schoolLogoUrl?: string | null; 
  address?: string;
  contactNumber?: string;
  email?: string;
}

const sanitizeImageUrl = (url?: string | null): string | null => {
  if (!url) return null;
  const clean = url.trim();
  if (
    clean.startsWith('http://') ||
    clean.startsWith('https://') ||
    clean.startsWith('data:image/') ||
    clean.startsWith('file://')
  ) {
    return clean;
  }
  return null;
};

const cleanText = (val?: string | null): string => {
  if (!val) return '';
  return val.replace(/[\r\n\t]/g, ' ').trim();
};

export const DepEdReportHeader: React.FC<DepEdHeaderProps> = ({
  leftLogoUrl,
  rightLogoUrl,
  region,
  division,
  formTitle,
  formSubtitle,
}) => {
  const safeKagawaranLogo = sanitizeImageUrl(leftLogoUrl);
  const safeDepEdLogo = sanitizeImageUrl(rightLogoUrl);

  const cleanRegion = cleanText(region);
  const cleanDivision = cleanText(division);
  const cleanTitle = cleanText(formTitle);
  const cleanSub = cleanText(formSubtitle);

  return (
    <View style={styles.headerContainer}>
      <View style={styles.sealBox}>
        {safeKagawaranLogo ? (
          <Image
            source={{ uri: safeKagawaranLogo }}
            style={styles.sealImage}
            contentFit="contain"
            cachePolicy="memory-disk"
            transition={100}
          />
        ) : null}
      </View>

      <View style={styles.headerCenter}>
        <Text style={styles.republicText}>Republic of the Philippines</Text>
        <Text style={styles.depedText}>Department of Education</Text>

        {cleanRegion ? (
          <Text style={styles.officeText}>{cleanRegion.toUpperCase()}</Text>
        ) : null}

        {cleanDivision ? (
          <Text style={styles.officeText}>{cleanDivision.toUpperCase()}</Text>
        ) : null}

        <Text style={styles.formTitleText}>{cleanTitle}</Text>
        {cleanSub ? <Text style={styles.formSubText}>{cleanSub}</Text> : null}
      </View>

      <View style={styles.sealBox}>
        {safeDepEdLogo ? (
          <Image
            source={{ uri: safeDepEdLogo }}
            style={styles.sealImage}
            contentFit="contain"
            cachePolicy="memory-disk"
            transition={100}
          />
        ) : null}
      </View>
    </View>
  );
};

export const DepEdReportFooter: React.FC<DepEdFooterProps> = ({
  schoolLogoUrl,
  address,
  contactNumber,
  email,
}) => {
  const safeSchoolLogo = sanitizeImageUrl(schoolLogoUrl);

  const displayAddress = cleanText(address) || '—';
  const displayContact = cleanText(contactNumber) || '—';
  const displayEmail = cleanText(email) || '—';

  return (
    <View style={styles.footerContainer}>
      <View style={styles.sealBox}>
        {safeSchoolLogo ? (
          <Image
            source={{ uri: safeSchoolLogo }}
            style={styles.sealImage}
            contentFit="contain"
            cachePolicy="memory-disk"
            transition={100}
          />
        ) : null}
      </View>

      <View style={styles.footerDetailsCol}>
        <Text style={styles.footerDetailsText}>
          <Text style={styles.footerLabel}>Address: </Text>
          {displayAddress}
          {'\n'}
          <Text style={styles.footerLabel}>Contact No.: </Text>
          {displayContact} &bull; <Text style={styles.footerLabel}>Email: </Text>
          {displayEmail}
        </Text>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  headerContainer: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    width: '100%',
    marginBottom: 8,
  },
  sealBox: {
    width: 73,
    height: 73,
    minWidth: 73,
    minHeight: 73,
    flexShrink: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sealImage: {
    width: 73,
    height: 73,
  },
  headerCenter: {
    flex: 1,
    alignItems: 'center',
    paddingHorizontal: 8,
  },
  republicText: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#000000',
    textAlign: 'center',
    fontFamily: Platform.select({
      ios: 'American Typewriter',
      android: 'serif',
      web: '"Old English Text MT", "Cloister Black", serif',
    }),
  },
  depedText: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#000000',
    textAlign: 'center',
    marginTop: 1,
    fontFamily: Platform.select({
      ios: 'American Typewriter',
      android: 'serif',
      web: '"Old English Text MT", "Cloister Black", serif',
    }),
  },
  officeText: {
    fontSize: 10,
    fontWeight: 'bold',
    color: '#000000',
    textAlign: 'center',
    marginTop: 1,
    fontFamily: Platform.select({
      ios: 'Tahoma',
      android: 'sans-serif',
      web: 'Tahoma, Arial, sans-serif',
    }),
  },
  formTitleText: {
    fontSize: 12.5,
    fontWeight: '900',
    color: '#000000',
    textAlign: 'center',
    marginTop: 4,
    textTransform: 'uppercase',
  },
  formSubText: {
    fontSize: 8,
    fontStyle: 'italic',
    color: '#475569',
    textAlign: 'center',
    marginTop: 1,
  },
  footerContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-start',
    gap: 12,
    width: '100%',
    marginTop: 10,
    paddingTop: 6,
    borderTopWidth: 1,
    borderTopColor: '#000000',
  },
  footerDetailsCol: {
    flex: 1,
  },
  footerDetailsText: {
    fontSize: 10,
    color: '#000000',
    lineHeight: 14,
    textAlign: 'left',
    fontFamily: Platform.select({
      ios: 'Calibri',
      android: 'sans-serif',
      web: 'Calibri, "Segoe UI", sans-serif',
    }),
  },
  footerLabel: {
    fontWeight: '700',
  },
});

export default { DepEdReportHeader, DepEdReportFooter };