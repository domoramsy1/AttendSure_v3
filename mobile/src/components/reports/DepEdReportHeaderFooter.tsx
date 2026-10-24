// D:\AttendSure_V3\mobile\src\components\reports\DepEdReportHeaderFooter.tsx

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
  sealUrl?: string | null;
  address?: string;
  contactNumber?: string;
  email?: string;
}

// Cybersecurity: Validate and sanitize remote image URIs
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

// Cybersecurity: Strip control characters to prevent formatting exploits
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
  const safeLeftLogo = sanitizeImageUrl(leftLogoUrl);
  const safeRightLogo = sanitizeImageUrl(rightLogoUrl);
  const cleanRegion = cleanText(region);
  const cleanDivision = cleanText(division);
  const cleanTitle = cleanText(formTitle);
  const cleanSub = cleanText(formSubtitle);

  return (
    <View style={styles.headerContainer}>
      {/* DepEd / Republic Seal – Exactly 0.76 Inch (73px at 96 DPI) */}
      <View style={styles.sealBox}>
        {safeLeftLogo ? (
          <Image
            source={{ uri: safeLeftLogo }}
            style={styles.sealImage}
            contentFit="contain"
            cachePolicy="memory-disk"
            transition={100}
          />
        ) : null}
      </View>

      <View style={styles.headerCenter}>
        {/* Republic of the Philippines – Old English Text MT, 12pt, Bold */}
        <Text style={styles.republicText}>Republic of the Philippines</Text>

        {/* Department of Education – Old English Text MT, 18pt, Bold */}
        <Text style={styles.depedText}>Department of Education</Text>

        {/* Name of Regional Office – Tahoma, 10pt, Bold */}
        {cleanRegion ? (
          <Text style={styles.officeText}>{cleanRegion.toUpperCase()}</Text>
        ) : null}

        {/* Name of Division / Office – Tahoma, 10pt, Bold */}
        {cleanDivision ? (
          <Text style={styles.officeText}>{cleanDivision.toUpperCase()}</Text>
        ) : null}

        {/* Official Report Title */}
        <Text style={styles.formTitleText}>{cleanTitle}</Text>
        {cleanSub ? <Text style={styles.formSubText}>{cleanSub}</Text> : null}
      </View>

      {/* Division / School Seal – Exactly 0.76 Inch (73px at 96 DPI) */}
      <View style={styles.sealBox}>
        {safeRightLogo ? (
          <Image
            source={{ uri: safeRightLogo }}
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
  sealUrl,
  address,
  contactNumber,
  email,
}) => {
  const safeSeal = sanitizeImageUrl(sealUrl);
  const displayAddress = cleanText(address) || '—';
  const displayContact = cleanText(contactNumber) || '—';
  const displayEmail = cleanText(email) || '—';

  return (
    <View style={styles.footerContainer}>
      {/* Division / School Seal – Exactly 0.76 Inch (73px at 96 DPI) */}
      <View style={styles.sealBox}>
        {safeSeal ? (
          <Image
            source={{ uri: safeSeal }}
            style={styles.sealImage}
            contentFit="contain"
            cachePolicy="memory-disk"
            transition={100}
          />
        ) : null}
      </View>

      {/* Dynamic Office Details from Database – Calibri (Body), 10pt */}
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
  // 0.76 Inch = 73 pixels at 96 DPI
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
  // Republic of the Philippines – Old English Text MT (12pt, Bold)
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
  // Department of Education – Old English Text MT (18pt, Bold)
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
  // Regional & Division Office – Tahoma (10pt, Bold)
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

  // Footer Container
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
  // Office Details – Calibri (Body), 10pt
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