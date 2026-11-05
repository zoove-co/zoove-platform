// Settings that differ per build. Expo inlines EXPO_PUBLIC_* values at build time.
const apiUrl = (process.env.EXPO_PUBLIC_API_URL ?? '').trim().replace(/\/+$/, '');

// The fake API is for development only. A production build can never fall back to it silently.
export const USE_MOCK = __DEV__ && (process.env.EXPO_PUBLIC_USE_MOCK === 'true' || apiUrl === '');

if (!USE_MOCK && apiUrl === '') {
  throw new Error('EXPO_PUBLIC_API_URL is not set. Set it in .env (local) or in the EAS build profile.');
}

export const API_URL = apiUrl;

// Features that can be switched off per build (they fall back to the "Coming soon" screen).
export const FEATURES = {
  referral: true,
  partyPlan: true,
};
