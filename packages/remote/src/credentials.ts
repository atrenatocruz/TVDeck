// Device token storage. localStorage is the primary store; IndexedDB is a second copy because an
// installed PWA (home-screen app) can have a different localStorage than the browser tab it
// was installed from on some platforms. Either one is enough to stay paired.
const LS_KEY = "tvdeck.deviceToken";
const LEGACY_KEY = "tvdeck.token"; // M1-M4 shared token
const DB = "tvdeck";
const STORE = "kv";

function idb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function idbGet(): Promise<string | null> {
  try {
    const db = await idb();
    return await new Promise((resolve) => {
      const r = db.transaction(STORE).objectStore(STORE).get(LS_KEY);
      r.onsuccess = () => resolve(typeof r.result === "string" ? r.result : null);
      r.onerror = () => resolve(null);
    });
  } catch {
    return null;
  }
}

async function idbSet(value: string | null): Promise<void> {
  try {
    const db = await idb();
    await new Promise<void>((resolve) => {
      const tx = db.transaction(STORE, "readwrite");
      if (value === null) tx.objectStore(STORE).delete(LS_KEY);
      else tx.objectStore(STORE).put(value, LS_KEY);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
      tx.onabort = () => resolve();
    });
  } catch {
    /* IndexedDB unavailable */
  }
}

let memory: string | null = null;

export async function loadDeviceToken(): Promise<string | null> {
  let t: string | null = null;
  try {
    t = localStorage.getItem(LS_KEY);
  } catch {
    /* ignore */
  }
  if (!t) t = await idbGet();
  if (t) await saveDeviceToken(t); // heal whichever copy is missing
  return t ?? memory;
}

export async function saveDeviceToken(token: string): Promise<void> {
  memory = token;
  try {
    localStorage.setItem(LS_KEY, token);
  } catch {
    /* ignore */
  }
  await idbSet(token);
}

export async function clearDeviceToken(): Promise<void> {
  memory = null;
  try {
    localStorage.removeItem(LS_KEY);
  } catch {
    /* ignore */
  }
  await idbSet(null);
}

export function loadLegacyToken(): string | null {
  try {
    return localStorage.getItem(LEGACY_KEY);
  } catch {
    return null;
  }
}
export function saveLegacyToken(t: string): void {
  try {
    localStorage.setItem(LEGACY_KEY, t);
  } catch {
    /* ignore */
  }
}
export function clearLegacyToken(): void {
  try {
    localStorage.removeItem(LEGACY_KEY);
  } catch {
    /* ignore */
  }
}

/** "Android phone", "iPhone", "Phone", from the user agent. */
export function defaultDeviceName(ua: string = navigator.userAgent): string {
  if (/iPhone/i.test(ua)) return "iPhone";
  if (/iPad/i.test(ua)) return "iPad";
  if (/Android/i.test(ua)) return "Android phone";
  return "Phone";
}
