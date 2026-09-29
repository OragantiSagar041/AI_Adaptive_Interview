import { initializeApp, getApps } from "firebase/app";
import { getAuth } from "firebase/auth";

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

let app = null;
let auth = null;

try {
  // Only initialize if a valid key is provided in .env
  if (firebaseConfig.apiKey && firebaseConfig.apiKey !== "your_firebase_web_api_key") {
    app = getApps().length > 0 ? getApps()[0] : initializeApp(firebaseConfig);
    auth = getAuth(app);
  } else {
    console.warn("⚠️ [Firebase] VITE_FIREBASE_API_KEY is not configured in .env. Firebase Authentication will be unavailable.");
  }
} catch (err) {
  console.error("⚠️ [Firebase] Initialization failed:", err);
}

export { auth };
export default app;