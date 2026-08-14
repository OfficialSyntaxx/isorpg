// Persistence: localStorage as primary save slot, IndexedDB as rotating backup.
// When the primary is corrupt, fall back to the last valid IndexedDB snapshot.
import { EngineLogger } from "./Logger";

const LS_KEY = "isorpg_save";
const IDB_NAME = "isorpg";
const IDB_STORE = "saves";
const BACKUP_MAX = 5;

let idbDb: IDBDatabase | null = null;

function openIdb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (idbDb) return resolve(idbDb);
    const req = indexedDB.open(IDB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(IDB_STORE)) {
        const store = db.createObjectStore(IDB_STORE, { keyPath: "ts" });
        store.createIndex("ts", "ts", { unique: true });
      }
    };
    req.onsuccess = () => {
      idbDb = req.result;
      resolve(idbDb);
    };
    req.onerror = () => reject(req.error);
  });
}

export const Storage = {
  /** Returns the raw primary JSON string, or null if absent/invalid. */
  readPrimary(): string | null {
    try {
      return localStorage.getItem(LS_KEY);
    } catch {
      return null;
    }
  },

  writePrimary(save: unknown): boolean {
    try {
      this.writeBackup(save); // best-effort, don't block primary write on it
      localStorage.setItem(LS_KEY, JSON.stringify(save));
      return true;
    } catch (err) {
      EngineLogger.logError("localStorage", err);
      return false;
    }
  },

  async writeBackup(save: unknown): Promise<boolean> {
    try {
      if (typeof indexedDB === "undefined") return false;
      const db = await openIdb();
      const tx = db.transaction(IDB_STORE, "readwrite");
      const store = tx.objectStore(IDB_STORE);
      store.put({ ts: Date.now(), payload: JSON.stringify(save) });
      return true;
    } catch (err) {
      EngineLogger.logError("IndexedDB backup", err);
      return false;
    }
  },

  /** Latest valid JSON string from IndexedDB backups, newest first. Return null if none. */
  async readLatestBackup(): Promise<{ ts: number; payload: string } | null> {
    try {
      if (typeof indexedDB === "undefined") return null;
      const db = await openIdb();
      return await new Promise((resolve) => {
        const tx = db.transaction(IDB_STORE, "readonly");
        const store = tx.objectStore(IDB_STORE);
        const req = store.getAll();
        req.onsuccess = () => {
          const all: { ts: number; payload: string }[] = req.result || [];
          // Prune to keep backups bounded
          if (all.length > BACKUP_MAX) {
            const keep = all
              .slice()
              .sort((a, b) => b.ts - a.ts)
              .slice(0, BACKUP_MAX)
              .map((x) => x.ts);
            const delTx = db.transaction(IDB_STORE, "readwrite");
            const delStore = delTx.objectStore(IDB_STORE);
            for (const k of all.map((x) => x.ts).filter((t) => !keep.includes(t))) delStore.delete(k);
          }
          const sorted = all.slice().sort((a, b) => b.ts - a.ts);
          resolve(sorted.length ? sorted[0] : null);
        };
        req.onerror = () => resolve(null);
      });
    } catch (err) {
      EngineLogger.logError("IndexedDB read", err);
      return null;
    }
  },

  clear(): void {
    try {
      localStorage.removeItem(LS_KEY);
    } catch { /* noop */ }
  },
};