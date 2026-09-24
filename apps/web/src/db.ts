// Library storage: verified cartridges in IndexedDB, keyed by cartridge id (hex SHA-256 of the file).

export interface StoredCartridge {
  id: string;
  title: string;
  bytes: Uint8Array;
  size: number;
  addedAt: number;
}

const DB = 'qr-console';
const STORE = 'cartridges';

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: 'id' });
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function tx<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await open();
  try {
    return await new Promise<T>((resolve, reject) => {
      const t = db.transaction(STORE, mode);
      const req = fn(t.objectStore(STORE));
      t.oncomplete = () => resolve(req.result);
      t.onerror = () => reject(t.error);
    });
  } finally {
    db.close();
  }
}

export const saveCartridge = (c: StoredCartridge) => tx('readwrite', (s) => s.put(c)).then(() => undefined);
export const deleteCartridge = (id: string) => tx('readwrite', (s) => s.delete(id)).then(() => undefined);
export const getCartridge = (id: string) => tx<StoredCartridge | undefined>('readonly', (s) => s.get(id));
export const listCartridges = async () =>
  (await tx<StoredCartridge[]>('readonly', (s) => s.getAll())).sort((a, b) => b.addedAt - a.addedAt);
