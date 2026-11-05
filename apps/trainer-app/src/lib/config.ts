// Settings that differ per build. Expo inlines EXPO_PUBLIC_* values at build time.
// This app talks to the same Zoove API as the customer app and the Join Zoove page, so one trainer account works everywhere.
const apiUrl = (process.env.EXPO_PUBLIC_API_URL ?? '').trim().replace(/\/+$/, '');

if (apiUrl === '') {
  throw new Error('EXPO_PUBLIC_API_URL is not set. Set it in .env (local) or in the EAS build profile.');
}

export const API_URL = apiUrl;
