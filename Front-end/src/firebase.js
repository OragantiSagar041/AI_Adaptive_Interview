import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";

const firebaseConfig = {
  apiKey: "AIzaSyDfkcbnCmDoVOVobfFSnC3gRELi4JTNrEk",
  authDomain: "ai-adaptive-interview.firebaseapp.com",
  projectId: "ai-adaptive-interview",
  storageBucket: "ai-adaptive-interview.firebasestorage.app",
  messagingSenderId: "678423253196",
  appId: "1:678423253196:web:e8f22803f3b012a06ff269",
};

const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);

export default app;