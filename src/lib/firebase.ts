import { getApp, getApps, initializeApp, type FirebaseOptions } from 'firebase/app';
import { connectAuthEmulator, getAuth } from 'firebase/auth';
import { connectFirestoreEmulator, getFirestore } from 'firebase/firestore';
import { connectFunctionsEmulator, getFunctions } from 'firebase/functions';

type PublicFirebaseEnv = {
  readonly VITE_USE_EMULATORS?: string;
  readonly VITE_FIREBASE_API_KEY?: string;
  readonly VITE_FIREBASE_AUTH_DOMAIN?: string;
  readonly VITE_FIREBASE_PROJECT_ID?: string;
  readonly VITE_FIREBASE_APP_ID?: string;
};

const env = import.meta.env as PublicFirebaseEnv;

const requirePublicEnv = (name: keyof PublicFirebaseEnv): string => {
  const value = env[name]?.trim();
  if (!value) {
    throw new Error(`Missing required public environment variable: ${name}`);
  }
  return value;
};

if (env.VITE_USE_EMULATORS !== 'true' && env.VITE_USE_EMULATORS !== 'false') {
  throw new Error('VITE_USE_EMULATORS must be explicitly set to true or false.');
}

const useEmulators = env.VITE_USE_EMULATORS === 'true';
const projectId = requirePublicEnv('VITE_FIREBASE_PROJECT_ID');

if (useEmulators && projectId !== 'demo-quiz-master') {
  throw new Error('Emulator mode is restricted to the demo-quiz-master project ID.');
}

if (!useEmulators && projectId === 'demo-quiz-master') {
  throw new Error('The demo-quiz-master project ID may only be used with emulators.');
}

const firebaseConfig: FirebaseOptions = {
  apiKey: requirePublicEnv('VITE_FIREBASE_API_KEY'),
  authDomain: requirePublicEnv('VITE_FIREBASE_AUTH_DOMAIN'),
  projectId,
  appId: requirePublicEnv('VITE_FIREBASE_APP_ID'),
};

export const firebaseApp = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);
export const auth = getAuth(firebaseApp);
export const db = getFirestore(firebaseApp);
export const functions = getFunctions(firebaseApp, 'us-central1');

const runtimeState = globalThis as typeof globalThis & {
  __QUIZ_MASTER_EMULATORS_CONNECTED__?: boolean;
};

if (useEmulators && !runtimeState.__QUIZ_MASTER_EMULATORS_CONNECTED__) {
  connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
  connectFirestoreEmulator(db, '127.0.0.1', 8080);
  connectFunctionsEmulator(functions, '127.0.0.1', 5001);
  runtimeState.__QUIZ_MASTER_EMULATORS_CONNECTED__ = true;
}

export const firebaseRuntime = Object.freeze({ projectId, useEmulators });
