// IndexedDB-backed store of named world saves (M12). Async, and far roomier than
// localStorage's ~5 MB — so it can hold many full world snapshots. Each record is keyed by
// the world's name and carries the serialized SaveGame plus light metadata for the list UI.
export interface SaveMeta {
  name: string;
  savedAt: number;   // Date.now() of the save
  tick: number;      // sim tick reached
  pop: number;       // living folk at save time
  seed: number;
}

export interface SaveRecord {
  name: string;      // key
  json: string;      // serialized SaveGame
  meta: SaveMeta;
}

const DB_NAME = 'omnia';
const STORE = 'saves';

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE, { keyPath: 'name' });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function run<T>(mode: IDBTransactionMode, op: (store: IDBObjectStore) => IDBRequest): Promise<T> {
  return openDB().then(db => new Promise<T>((resolve, reject) => {
    const t = db.transaction(STORE, mode);
    const req = op(t.objectStore(STORE));
    req.onsuccess = () => resolve(req.result as T);
    req.onerror = () => reject(req.error);
    t.oncomplete = () => db.close();
  }));
}

// All saved worlds, newest first (metadata only — cheap to list).
export async function listSaves(): Promise<SaveMeta[]> {
  const records = await run<SaveRecord[]>('readonly', s => s.getAll());
  return records.map(r => r.meta).sort((a, b) => b.savedAt - a.savedAt);
}

export async function putSave(rec: SaveRecord): Promise<void> {
  await run('readwrite', s => s.put(rec));
}

export async function getSaveJson(name: string): Promise<string | null> {
  const rec = await run<SaveRecord | undefined>('readonly', s => s.get(name));
  return rec ? rec.json : null;
}

export async function deleteSave(name: string): Promise<void> {
  await run('readwrite', s => s.delete(name));
}
