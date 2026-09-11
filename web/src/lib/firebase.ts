import { initializeApp, getApps, getApp } from "firebase/app";
import { getAuth, type Auth } from "firebase/auth";

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID
};

/**
 * Null when the NEXT_PUBLIC_FIREBASE_* values were not provided at build time.
 * getAuth() throws `auth/invalid-api-key` without them, and this module is
 * imported by the app shell — so an eager call would break prerendering of every
 * page, not just sign-in. Callers guard on null; the login page explains why.
 */
export const auth: Auth | null = firebaseConfig.apiKey
  ? getAuth(!getApps().length ? initializeApp(firebaseConfig) : getApp())
  : null;

/** For code paths that only run once Firebase is known to be configured. */
export function requireAuth(): Auth {
  if (!auth) throw new Error("Firebase is not configured for this build (NEXT_PUBLIC_FIREBASE_* missing).");
  return auth;
}
