import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";

// ---------------------------------------------------------------------------
// YAHAN APNA FIREBASE CONFIG PASTE KARO
// Firebase Console > Project settings > Your apps > Web app > SDK setup > Config
// (values start with "AIza..." etc.)
// ---------------------------------------------------------------------------
const firebaseConfig = {
  apiKey: "AIzaSyAwQw5NFCZMX77NkoiQLJ28BCY6mQVGsow",
  authDomain: "ram-darbar-tracker.firebaseapp.com",
  projectId: "ram-darbar-tracker",
  storageBucket: "ram-darbar-tracker.firebasestorage.app",
  messagingSenderId: "706850602012",
  appId: "1:706850602012:web:c2276d058b7cba8e0bf3d9",
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
