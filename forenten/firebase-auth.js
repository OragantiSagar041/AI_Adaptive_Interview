import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAuth, signInWithEmailAndPassword, sendPasswordResetEmail, GoogleAuthProvider, signInWithPopup } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

const firebaseConfig = {
  apiKey: "AIzaSyBo12Pv1iW_B1D1AxXJBP7t78OTdexY_PQ",
  authDomain: "plantation-e904c.firebaseapp.com",
  projectId: "plantation-e904c",
  storageBucket: "plantation-e904c.firebasestorage.app",
  messagingSenderId: "199528896150",
  appId: "1:199528896150:web:5271caefdd8332d67354b7",
  measurementId: "G-CEG8TDNDY8"
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
