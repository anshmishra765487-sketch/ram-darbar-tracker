// Firebase Firestore ke through cross-device sync.
// Har mobile number ka apna document hota hai: accounts/{normalizedPhone}
// Us document me poori app ki DB (users, trucks, trips, ...) JSON blob ke roop me store hoti hai.
// Isliye same number se kisi bhi device par login karo -> same data dikhega.

import { doc, getDoc, setDoc, onSnapshot } from "firebase/firestore";
import { CONFIGURED, db } from "./firebase";
import { getDatabase, setDatabase, getActivePhone, phoneKey } from "./localBackend";

const COLLECTION = "accounts";

let unsubscribe = null;
let pushTimer = null;
let dirty = false;
let lastPushedAt = 0;
let activeKey = null;

function enabled() {
  return CONFIGURED && Boolean(db);
}

export function isCloudEnabled() {
  return enabled();
}

async function pull(key) {
  const snap = await getDoc(doc(db, COLLECTION, key));
  if (snap.exists()) {
    const data = snap.data();
    if (data && data.db) {
      setDatabase(data.db);
      return true;
    }
  }
  return false;
}

// Login se pehle: us number ka cloud data local me le aao.
export async function beforeLogin(identifier) {
  if (!enabled()) return;
  const value = String(identifier || "").trim();
  if (!/^\d{10,}$/.test(value.replace(/\D/g, ""))) return;
  const key = phoneKey(value);
  if (!key) return;
  try {
    await pull(key);
  } catch (error) {
    console.warn("Cloud pull failed, offline data use kar rahe hain:", error);
  }
}

// Poori DB ko ek specific number ke document me bhejo (signup/reset ke liye).
export async function pushAccount(identifier) {
  if (!enabled()) return;
  const key = phoneKey(identifier);
  if (!key) return;
  try {
    await setDoc(
      doc(db, COLLECTION, key),
      { db: getDatabase(), updatedAt: Date.now(), phone: key },
      { merge: true },
    );
  } catch (error) {
    console.warn("Cloud push (account) failed:", error);
  }
}

// Turant push (debounce ke baad).
export async function pushNow() {
  if (!enabled()) return;
  const key = getActivePhone();
  if (!key) return;
  try {
    await setDoc(
      doc(db, COLLECTION, key),
      { db: getDatabase(), updatedAt: Date.now(), phone: key },
      { merge: true },
    );
    lastPushedAt = Date.now();
    dirty = false;
  } catch (error) {
    console.warn("Cloud push failed:", error);
  }
}

// Mutations ke baad thoda debounce karke push.
export function schedulePush() {
  if (!enabled()) return;
  dirty = true;
  if (pushTimer) clearTimeout(pushTimer);
  pushTimer = setTimeout(() => {
    pushTimer = null;
    pushNow();
  }, 700);
}

// Live updates subscribe karo (doosre device ke changes turant aayein).
export function start() {
  if (!enabled()) return;
  const key = getActivePhone();
  if (!key) return;
  if (unsubscribe && activeKey === key) return;
  stop();
  activeKey = key;
  unsubscribe = onSnapshot(
    doc(db, COLLECTION, key),
    (snap) => {
      if (!snap.exists()) return;
      const data = snap.data();
      if (!data || !data.db) return;
      if (dirty) return; // local change pending hai, use overwrite mat karo
      if ((data.updatedAt || 0) <= lastPushedAt) return; // apna hi echo
      setDatabase(data.db);
    },
    (error) => console.warn("Cloud subscribe failed:", error),
  );
}

export function stop() {
  if (unsubscribe) {
    unsubscribe();
    unsubscribe = null;
  }
  activeKey = null;
}

// App load par: session pehle se hai to pull + subscribe.
export async function resume() {
  if (!enabled()) return;
  const key = getActivePhone();
  if (!key) return;
  try {
    await pull(key);
  } catch (error) {
    console.warn("Cloud resume pull failed:", error);
  }
  start();
}
