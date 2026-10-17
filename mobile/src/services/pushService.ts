/**
 * AttendSure V3 - Safe Push & Wake-Up Service
 * File: mobile/src/services/pushService.ts
 *
 * Cybersecurity & Performance:
 * 1. Expo Go Detection: Safely skips remote push registration in the Expo Go sandbox to eliminate SDK 53 console warnings.
 * 2. Standalone APK Ready: Enables high-priority wake-up push notifications in production builds.
 * 3. LogBox Cleanliness: Filters known sandbox notices from polluting the terminal.
 */

import { Platform, LogBox } from 'react-native';
import Constants, { ExecutionEnvironment } from 'expo-constants';
import defaultApiClient, { apiClient as namedClient } from '../api/client';
import {
  startPassivePresenceTracking,
  stopPassivePresenceTracking,
} from './backgroundLocation';

// Safely resolve HTTP client
const client = defaultApiClient || namedClient;

export const BACKGROUND_NOTIFICATION_TASK = 'ATTENDSURE_BACKGROUND_PUSH_TASK';

// Ignore the Expo Go sandbox push warning in development
LogBox.ignoreLogs([
  '[expo-notifications] Push notifications (remote notifications) are unavailable in Expo Go',
]);

// Check if running inside Expo Go sandbox
const isRunningInExpoGo =
  Constants.executionEnvironment === ExecutionEnvironment.StoreClient;

let Notifications: any = null;
let TaskManager: any = null;

// Only initialize remote push listeners if NOT in Expo Go sandbox
if (!isRunningInExpoGo) {
  try {
    Notifications = require('expo-notifications');
    TaskManager = require('expo-task-manager');

    if (Notifications?.setNotificationHandler) {
      Notifications.setNotificationHandler({
        handleNotification: async () => ({
          shouldShowAlert: false,
          shouldPlaySound: false,
          shouldSetBadge: false,
          shouldShowBanner: false,
          shouldShowList: false,
        }),
      });
    }

    if (TaskManager?.defineTask) {
      TaskManager.defineTask(BACKGROUND_NOTIFICATION_TASK, async ({ data, error }: any) => {
        if (error) return;
        const action = data?.notification?.data?.action?.toUpperCase();
        if (action === 'START_TRACKING_IN') {
          await startPassivePresenceTracking();
        } else if (action === 'STOP_TRACKING_OUT') {
          await stopPassivePresenceTracking();
        }
      });

      Notifications.registerTaskAsync(BACKGROUND_NOTIFICATION_TASK).catch(() => {});
    }
  } catch (err) {
    // Suppress if native dependencies are absent
  }
}

/**
 * Registers device push token with the backend.
 * Safely returns null in Expo Go and uses background GPS telemetry instead.
 */
export async function registerPushTokenWithBackend(): Promise<string | null> {
  if (isRunningInExpoGo || !Notifications?.getExpoPushTokenAsync) {
    console.log('[PushService] Operating in Expo Go: using automated background GPS telemetry.');
    return null;
  }

  try {
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
    const token = pushTokenData?.data;

    if (!token) return null;

    const targetUrl = client?.defaults?.baseURL?.endsWith('/api')
      ? '/users/register-push-token/'
      : '/api/users/register-push-token/';

    await client.post(targetUrl, {
      push_token: token,
      platform: Platform.OS,
    });

    console.log('[PushService] Production push token bound successfully.');
    return token;
  } catch (err: any) {
    return null;
  }
}