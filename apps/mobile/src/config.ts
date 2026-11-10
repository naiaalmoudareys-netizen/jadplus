/**
 * Where the app finds the JAD+ API. Set per build with EXPO_PUBLIC_API_URL. Outside development the address
 * must be https, so a session token never travels unencrypted (C-SES-1).
 */
export function apiBaseUrl(raw: string | undefined, development: boolean): string {
  if (raw === undefined || raw.trim() === '') {
    throw new Error('EXPO_PUBLIC_API_URL is not set. See apps/mobile/README.md.');
  }
  const url = new URL(raw.trim());
  if (url.protocol !== 'https:' && !(development && url.protocol === 'http:')) {
    throw new Error('The API address must use https.');
  }
  return url.origin;
}
