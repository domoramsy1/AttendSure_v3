import * as SecureStore from 'expo-secure-store';

const SERVER_URL_KEY = 'attendsure_dynamic_server_url';
const DEFAULT_URL = process.env.EXPO_PUBLIC_API_BASE_URL || 'http://10.16.115.49:8000';

export async function getServerBaseUrl(): Promise<string> {
  try {
    const savedUrl = await SecureStore.getItemAsync(SERVER_URL_KEY);
    return savedUrl ? savedUrl.replace(/\/+$/, '') : DEFAULT_URL;
  } catch {
    return DEFAULT_URL;
  }
}

export async function setServerBaseUrl(newUrl: string): Promise<void> {
  const sanitized = newUrl.trim().replace(/\/+$/, '');
  await SecureStore.setItemAsync(SERVER_URL_KEY, sanitized);
}

export async function resetServerBaseUrl(): Promise<void> {
  await SecureStore.deleteItemAsync(SERVER_URL_KEY);
}