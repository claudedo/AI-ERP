import { DomainError } from "./workspaceDomain";

const DB_NAME = "nodus-attachments";
const STORE = "files";
const MAX_FILE = 10 * 1024 * 1024;
function database(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (!globalThis.indexedDB) { reject(new DomainError("This browser does not support local file storage.")); return; }
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(new DomainError("IndexedDB could not be opened."));
  });
}
async function transact<T>(mode: IDBTransactionMode, run: (store: IDBObjectStore, done: (value: T) => void) => void): Promise<T> {
  const db = await database();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, mode);
    let value: T;
    tx.oncomplete = () => { db.close(); resolve(value); };
    tx.onerror = () => { db.close(); reject(new DomainError("Attachment storage failed. The browser may be out of space.")); };
    tx.onabort = () => { db.close(); reject(new DomainError("Attachment storage was cancelled.")); };
    run(tx.objectStore(STORE), result => { value = result; });
  });
}
export async function saveAttachmentBlob(id: string, file: File) {
  if (file.size > MAX_FILE) throw new DomainError("Attachments must be 10 MB or smaller.");
  await transact<void>("readwrite", store => { store.put(file, id); });
}
export async function readAttachmentBlob(id: string): Promise<Blob> {
  const result = await transact<Blob | undefined>("readonly", (store, done) => { const request = store.get(id); request.onsuccess = () => done(request.result as Blob | undefined); });
  if (!result) throw new DomainError("This attachment is missing from this browser.");
  return result;
}
export async function removeAttachmentBlob(id: string) { await transact<void>("readwrite", store => { store.delete(id); }); }
export async function openAttachment(id: string, filename: string, download = false) {
  const blob = await readAttachmentBlob(id), url = URL.createObjectURL(blob);
  const link = document.createElement("a"); link.href = url; link.target = "_blank"; link.rel = "noopener noreferrer";
  if (download) link.download = filename;
  link.click(); window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
