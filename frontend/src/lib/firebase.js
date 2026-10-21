import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";

// ---------------------------------------------------------------------------
// YAHAN APNA FIREBASE CONFIG PASTE KARO
// Firebase Console > Project settings > Your apps > Web app > SDK setup > Config
// (values start with "AIza..." etc.)
// ---------------------------------------------------------------------------
const firebaseConfig = {
  apiKey: "PASTE_API_KEY",
  authDomain: "PASTE_PROJECT_ID.firebaseapp.com",
  projectId: "PASTE_PROJECT_ID",
  storageBucket: "PASTE_PROJECT_ID.appspot.com",
  messagingSenderId: "PASTE_SENDER_ID",
  appId: "PASTE_APP_ID",
};

// Agar config bhar diya gaya hai to cloud sync on, warna app offline chalti hai.
export const CONFIGURED = Boolean(
  firebaseConfig.apiKey &&
    firebaseConfig.apiKey.startsWith("AIza") &&
    firebaseConfig.projectId &&
    !firebaseConfig.projectId.startsWith("PASTE"),
);

let app = null;
let db = null;

if (CONFIGURED) {
  try {
    app = initializeApp(firebaseConfig);
    db = getFirestore(app);
  } catch (error) {
    console.warn("Firebase init failed, offline mode me chal raha hai:", error);
  }
}

export { app, db };
