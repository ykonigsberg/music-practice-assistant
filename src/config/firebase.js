// Firebase is currently disabled
// To enable: set up environment variables in .env file
// See .env.example for required variables

const FIREBASE_ENABLED = false; // Set to true when you want to enable Firebase

export const app = null;
export const auth = null;
export const db = null;
export const appId = 'music-practice-assistant';
export const isFirebaseEnabled = FIREBASE_ENABLED;

// Uncomment below when ready to use Firebase:
/*
import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID
};

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
export const appId = import.meta.env.VITE_APP_ID || 'music-practice-assistant';
export const isFirebaseEnabled = true;
*/
