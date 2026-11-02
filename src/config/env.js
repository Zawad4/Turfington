/**
 * Centralized Application Environment Configuration
 * Validates and exposes environment variables with safe defaults.
 */

const metaEnv = typeof import.meta !== 'undefined' && import.meta.env ? import.meta.env : {};

export const ENV = {
  // Application Mode
  IS_DEV: metaEnv.DEV ?? false,
  IS_PROD: metaEnv.PROD ?? true,
  MODE: metaEnv.MODE || 'production',

  // API Backend Base URL (Relative '' in production on Vercel, http://localhost:5000 in dev)
  API_BASE_URL: metaEnv.VITE_API_URL || (metaEnv.PROD ? '' : 'http://localhost:5000'),

  // Firebase Configuration
  FIREBASE: {
    API_KEY: metaEnv.VITE_FIREBASE_API_KEY || '',
    AUTH_DOMAIN: metaEnv.VITE_FIREBASE_AUTH_DOMAIN || 'turfington-b759a.firebaseapp.com',
    PROJECT_ID: metaEnv.VITE_FIREBASE_PROJECT_ID || 'turfington-b759a',
    STORAGE_BUCKET: metaEnv.VITE_FIREBASE_STORAGE_BUCKET || 'turfington-b759a.firebasestorage.app',
    MESSAGING_SENDER_ID: metaEnv.VITE_FIREBASE_MESSAGING_SENDER_ID || '147940618215',
    APP_ID: metaEnv.VITE_FIREBASE_APP_ID || '1:147940618215:web:13f38ed41f9a6b6c7f9742',
    MEASUREMENT_ID: metaEnv.VITE_FIREBASE_MEASUREMENT_ID || 'G-1ZPEBPWNTP',
    VAPID_KEY: metaEnv.VITE_FIREBASE_VAPID_KEY || 'BFsI2qR98xZ_p193K_gG9P-T3iA7s1eQ69O9qK7O68i'
  },

  // Maps & Location
  GOOGLE_MAPS_API_KEY: metaEnv.VITE_GOOGLE_MAPS_API_KEY || ''
};

// Validate critical variables in development mode
if (ENV.IS_DEV && !ENV.FIREBASE.API_KEY) {
  console.warn('[CONFIG WARNING] VITE_FIREBASE_API_KEY is not defined in environment variables. Check .env file.');
}

