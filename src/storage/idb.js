// idb（Milestone 5-B）: IndexedDB の最小ラッパ。FileSystemDirectoryHandle の保存/取得に使う。
// 外部ライブラリ不使用。IndexedDB 非対応/失敗時は null を返し、ゲームを止めない。

const DB_NAME = 'rfs_save_db';
const STORE = 'handles';
const HANDLE_KEY = 'saveDirectoryHandle';

function openDb() {
  return new Promise((resolve) => {
    try {
      if (typeof indexedDB === 'undefined') return resolve(null);
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => { const db = req.result; if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE); };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
    } catch (e) { resolve(null); }
  });
}

function tx(db, mode, fn) {
  return new Promise((resolve) => {
    try {
      const t = db.transaction(STORE, mode);
      const store = t.objectStore(STORE);
      const req = fn(store);
      req.onsuccess = () => resolve(req.result ?? true);
      req.onerror = () => resolve(null);
    } catch (e) { resolve(null); }
  });
}

export async function idbAvailable() {
  return typeof indexedDB !== 'undefined';
}

export async function saveDirectoryHandle(handle) {
  const db = await openDb();
  if (!db) return false;
  const r = await tx(db, 'readwrite', (s) => s.put(handle, HANDLE_KEY));
  db.close();
  return r != null;
}

export async function loadDirectoryHandle() {
  const db = await openDb();
  if (!db) return null;
  const r = await tx(db, 'readonly', (s) => s.get(HANDLE_KEY));
  db.close();
  return r || null;
}

export async function clearDirectoryHandle() {
  const db = await openDb();
  if (!db) return false;
  const r = await tx(db, 'readwrite', (s) => s.delete(HANDLE_KEY));
  db.close();
  return r != null;
}
