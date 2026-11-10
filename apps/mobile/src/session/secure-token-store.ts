/**
 * The session token on the phone: only in the iOS Keychain / Android Keystore (expo-secure-store), readable
 * only while the phone is unlocked and never copied to backups or other devices (C-SES-1).
 */
import * as SecureStore from 'expo-secure-store';
import type { TokenStore } from './session.js';

const KEY = 'jadplus.session';
const OPTIONS: SecureStore.SecureStoreOptions = {
  keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
};

export const secureTokenStore: TokenStore = {
  read: () => SecureStore.getItemAsync(KEY, OPTIONS),
  write: (token) => SecureStore.setItemAsync(KEY, token, OPTIONS),
  clear: () => SecureStore.deleteItemAsync(KEY, OPTIONS),
};
