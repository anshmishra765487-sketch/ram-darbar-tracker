// Firebase Firestore ke through cross-device sync.
// Poora business ek hi document me rehta hai: accounts/ram-darbar-business
// Isliye owner, staff, munshi - sabke phone par same data dikhta hai.
// Har login se pehle cloud se latest data pull hota hai, aur har change
// ke baad (700ms debounce) cloud par push hota hai.

import { doc, getDoc, setDoc, onSnapshot } from "firebase/firestore";
import { CONFIGURED, db } from "./firebase";
import { getDatabase, setDatabase } from "./localBackend";

const COLLECTION = "accounts";
const WORKSPACE = "ram-darbar-business";

let unsubscribe = null;
let pushTimer = null;
let dirty = false;
let lastPushedAt = 0;

function enabled() {
  return CONFIGURED && Boolean(db);
}

export function isCloudEnabled() {
  return enabled();
}

function workspaceRef() {
  return doc(db, COLLECTION, WORKSPACE);
}

async function pull() {
  const snap = await getDoc(workspaceRef());
  if (!snap.exists()) return false;
  const data = snap.data();
  if (!data || !data.db) return false;
  setDatabase(data.db);
  return true;
}

// Login se pehle: shared business data local me le aao.
export async function beforeLogin() {
  if (!enabled()) return;
  try {
    await pull();
  } catch (error) {
    console.warn("Cloud pull failed, offline data use kar rahe hain:", error);
  }
}

// Poori DB cloud par bhejo (signup/password reset ke baad bhi).
export async function pushAccount() {
  await pushNow();
}

// Turant push.
export async function pushNow() {
  if (!enabled()) return;
  try {
    await setDoc(
      workspaceRef(),
      { db: getDatabase(), updatedAt: Date.now() },
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

// Live updates subscribe karo (doosre device ke changes turant local me aayein).
export function start() {
  if (!enabled()) return;
  if (unsubscribe) return;
  unsubscribe = onSnapshot(
    workspaceRef(),
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
}

// App load par session pehle se hai to pull + subscribe.
export async function resume() {
  if (!enabled()) return;
  let found = false;
  try {
    found = await pull();
  } catch (error) {
    console.warn("Cloud resume pull failed:", error);
  }
  if (!found) await pushNow();
  start();
}
