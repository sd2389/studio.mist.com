/**
 * Hands a generated model file from one page to another (e.g. `/design` → `/upload-model`)
 * without a server round trip. Stored in IndexedDB because GLB files are too large for
 * sessionStorage; a handoff is single-use and is deleted when taken.
 */

const DB_NAME = "mist-design-handoff";
const STORE = "files";
const KEY = "pending";

function openHandoffDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Could not open handoff storage"));
  });
}

function runHandoffTransaction<T>(
  mode: IDBTransactionMode,
  action: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  return openHandoffDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const tx = db.transaction(STORE, mode);
        const request = action(tx.objectStore(STORE));
        tx.oncomplete = () => {
          db.close();
          resolve(request.result);
        };
        tx.onerror = () => {
          db.close();
          reject(tx.error ?? new Error("Handoff storage failed"));
        };
      }),
  );
}

/** Store a file for the next page to pick up. Replaces any earlier pending handoff. */
export async function putDesignHandoff(file: File): Promise<void> {
  await runHandoffTransaction("readwrite", (store) => store.put(file, KEY));
}

/** Take the pending file, if any. The handoff is removed so a reload does not re-import it. */
export async function takeDesignHandoff(): Promise<File | null> {
  if (typeof indexedDB === "undefined") return null;
  const file = await runHandoffTransaction<unknown>("readonly", (store) => store.get(KEY));
  if (!(file instanceof File)) return null;
  await runHandoffTransaction("readwrite", (store) => store.delete(KEY));
  return file;
}
