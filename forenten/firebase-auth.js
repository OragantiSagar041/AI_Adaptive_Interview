import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAuth, signInWithEmailAndPassword, sendPasswordResetEmail, GoogleAuthProvider, signInWithPopup } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

const firebaseConfig = window.__FIREBASE__ || {
  apiKey: "LOCAL_DEV_KEY",
  authDomain: "localhost",
  projectId: "local-dev",
  storageBucket: "local-dev.appspot.com",
  messagingSenderId: "000000000000",
  appId: "1:000000000000:web:0000000000000000000000",
  measurementId: "G-0000000000"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const googleProvider = new GoogleAuthProvider();

window.handleFirebaseLogin = async function(email, password) {
    try {
        const userCredential = await signInWithEmailAndPassword(auth, email, password);
        return { success: true, user: userCredential.user };
    } catch (error) {
        console.error("Firebase login error:", error);
        return { success: false, error: error.message };
    }
};

window.handleFirebaseGoogleSignIn = async function() {
    try {
        const result = await signInWithPopup(auth, googleProvider);
        return { success: true, user: result.user };
    } catch (error) {
        console.error("Firebase Google Sign-In error:", error);
        return { success: false, error: error.message };
    }
};

window.handleFirebasePasswordReset = async function(email) {
    try {
        await sendPasswordResetEmail(auth, email);
        return { success: true };
    } catch (error) {
        console.error("Firebase password reset error:", error);
        return { success: false, error: error.message };
    }
};
