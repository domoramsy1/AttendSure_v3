/**
 * AttendSure - Real-Time Mobile Push Notification & Presence Wake-Up Service
 * File: mobile/src/services/pushService.ts
 *
 * Reliability & Privacy:
 * 1. Expo Go Detection: Safely skips remote push registration inside Expo Go.
 * 2. Production Ready: Registers mobile push tokens for real-time parent alerts and presence updates.
 * 3. Clean Logging: Filters expected development sandbox warnings and avoids raw error dumps.
 */

import { Platform, LogBox } from 'react-native';
import Constants, { ExecutionEnvironment } from 'expo-constants';
import defaultApiClient, { apiClient as namedClient } from '../api/client';
import { PALETTES, getFriendlyErrorMessage } from '../constants/theme';
import {
  startPassivePresenceTracking,
  stopPassivePresenceTracking,
} from './backgroundLocation';

const client = defaultApiClient || namedClient;

export const BACKGROUND_NOTIFICATION_TASK = 'ATTENDSURE_BACKGROUND_PUSH_TASK';
const NOTIFICATION_CHANNEL_ID = 'attendsure-alerts';

// Ignore expected Expo Go remote push warning during local development
LogBox.ignoreLogs([
  '[expo-notifications] Push notifications (remote notifications) are unavailable in Expo Go',
]);

const isRunningInExpoGo =
  Constants.executionEnvironment === ExecutionEnvironment.StoreClient;

interface NotificationModuleLike {
  AndroidImportance?: { HIGH?: number };
  setNotificationHandler?: (handler: {
    handleNotification: () => Promise<{
      shouldShowAlert: boolean;
      shouldPlaySound: boolean;
      shouldSetBadge: boolean;
      shouldShowBanner: boolean;
      shouldShowList: boolean;
    }>;
  }) => void;
  setNotificationChannelAsync?: (
    channelId: string,
    config: {
      name: string;
      importance: number;
      lightColor: string;
      vibrationPattern: number[];
    }
  ) => Promise<unknown>;
  registerTaskAsync?: (taskName: string) => Promise<void>;
  getPermissionsAsync?: () => Promise<{ status: string }>;
  requestPermissionsAsync?: () => Promise<{ status: string }>;
  getExpoPushTokenAsync?: () => Promise<{ data?: string }>;
}

interface TaskManagerModuleLike {
  defineTask?: (
    taskName: string,
    executor: (body: { data?: Record<string, any>; error?: unknown }) => Promise<void>
  ) => void;
}

let Notifications: NotificationModuleLike | null = null;
let TaskManager: TaskManagerModuleLike | null = null;

// Only initialize remote push listeners outside the Expo Go sandbox
if (!isRunningInExpoGo && Platform.OS !== 'web') {
  try {
    Notifications = require('expo-notifications') as NotificationModuleLike;
    TaskManager = require('expo-task-manager') as TaskManagerModuleLike;

    if (Notifications?.setNotificationHandler) {
      Notifications.setNotificationHandler({
        handleNotification: async () => ({
          shouldShowAlert: true,
          shouldPlaySound: true,
          shouldSetBadge: false,
          shouldShowBanner: true,
          shouldShowList: true,
        }),
      });
    }

    if (Platform.OS === 'android' && Notifications?.setNotificationChannelAsync) {
      Notifications.setNotificationChannelAsync(NOTIFICATION_CHANNEL_ID, {
        name: 'AttendSure Alerts',
        importance: Notifications.AndroidImportance?.HIGH ?? 4,
        lightColor: PALETTES.light.primary,
        vibrationPattern: [0, 250, 150, 250],
      }).catch(() => {});
    }

    if (TaskManager?.defineTask) {
      TaskManager.defineTask(BACKGROUND_NOTIFICATION_TASK, async ({ data, error }) => {
        if (error) return;
        const action = String(data?.notification?.data?.action || '').toUpperCase();
        if (action === 'START_TRACKING_IN') {
          await startPassivePresenceTracking();
        } else if (action === 'STOP_TRACKING_OUT') {
          await stopPassivePresenceTracking();
        }
      });

      Notifications?.registerTaskAsync?.(BACKGROUND_NOTIFICATION_TASK).catch(() => {});
    }
  } catch {
    // Native push modules unavailable in this runtime environment
  }
}

/**
 * Registers this device's push notification token with the AttendSure school server.
 * Safely returns null inside Expo Go or web environments.
 */
export async function registerPushTokenWithBackend(): Promise<string | null> {
  if (
    Platform.OS === 'web' ||
    isRunningInExpoGo ||
    !Notifications?.getPermissionsAsync ||
    !Notifications?.requestPermissionsAsync ||
    !Notifications?.getExpoPushTokenAsync
  ) {
    return null;
  }

  try {
    if (Platform.OS === 'android' && Notifications.setNotificationChannelAsync) {
      await Notifications.setNotificationChannelAsync(NOTIFICATION_CHANNEL_ID, {
        name: 'AttendSure Alerts',
        importance: Notifications.AndroidImportance?.HIGH ?? 4,
        lightColor: PALETTES.light.primary,
        vibrationPattern: [0, 250, 150, 250],
      }).catch(() => {});
    }

    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;

    if (existingStatus !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }

    if (finalStatus !== 'granted') {
      return null;
    }

    const pushTokenData = await Notifications.getExpoPushTokenAsync();
    const token = typeof pushTokenData?.data === 'string'
      ? pushTokenData.data.replace(/[\u0000-\u001F\u007F]/g, '').trim()
      : '';

    if (!token) return null;

    await client.post('auth/register-push-token/', {
      push_token: token,
      platform: Platform.OS,
    });

    return token;
  } catch (err: unknown) {
    // Keep error handling safe without leaking raw server payloads
    getFriendlyErrorMessage(err, 'Could not register push alerts.');
    return null;
  }
}
