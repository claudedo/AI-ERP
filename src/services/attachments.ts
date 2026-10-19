import { DomainError } from "./workspaceDomain";
import { attachmentPresentation, validateAttachmentUpload } from "./attachmentPolicy";

const DB_NAME = "nodus-attachments";
const STORE = "files";
function database(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (!globalThis.indexedDB) { reject(new DomainError("Questo browser non supporta l’archiviazione locale dei file.")); return; }
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(new DomainError("Impossibile aprire l’archivio locale del browser."));
  });
}
async function transact<T>(mode: IDBTransactionMode, run: (store: IDBObjectStore, done: (value: T) => void) => void): Promise<T> {
  const db = await database();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, mode);
    let value: T;
    tx.oncomplete = () => { db.close(); resolve(value); };
    tx.onerror = () => { db.close(); reject(new DomainError("Salvataggio dell’allegato non riuscito. Il browser potrebbe non avere spazio sufficiente.")); };
    tx.onabort = () => { db.close(); reject(new DomainError("Salvataggio dell’allegato annullato.")); };
    run(tx.objectStore(STORE), result => { value = result; });
  });
}
export async function saveAttachmentBlob(id: string, file: File) {
  validateAttachmentUpload(file);
  await transact<void>("readwrite", store => { store.put(file, id); });
}
export async function readAttachmentBlob(id: string): Promise<Blob> {
  const result = await transact<Blob | undefined>("readonly", (store, done) => { const request = store.get(id); request.onsuccess = () => done(request.result as Blob | undefined); });
  if (!result) throw new DomainError("Questo allegato non è presente in questo browser.");
  return result;
}
export async function removeAttachmentBlob(id: string) { await transact<void>("readwrite", store => { store.delete(id); }); }
export async function openAttachment(id: string, filename: string, download = false) {
  const stored = await readAttachmentBlob(id);
  const presentation = await attachmentPresentation(stored, filename, download);
  const url = URL.createObjectURL(presentation.blob);
  const link = document.createElement("a"); link.href = url; link.rel = "noopener noreferrer";
  if (presentation.download) link.download = filename || "allegato";
  else link.target = "_blank";
  link.click(); window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
