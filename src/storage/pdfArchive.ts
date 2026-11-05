const DATABASE_NAME = "prm-assistant-report-documents";
const STORE_NAME = "pdfs";
const DATABASE_VERSION = 1;

export async function saveExpensePdf(id: string, file: File): Promise<void> {
  const database = await openDatabase();
  await transactionPromise(database, "readwrite", (store) => store.put(file, id));
  database.close();
}

export async function openExpensePdf(id: string): Promise<boolean> {
  const target = window.open("", "_blank");
  if (target) target.opener = null;
  const database = await openDatabase();
  const blob = await requestPromise<Blob | undefined>(database.transaction(STORE_NAME, "readonly").objectStore(STORE_NAME).get(id));
  database.close();
  if (!blob) { target?.close(); return false; }
  const url = URL.createObjectURL(blob);
  if (target) target.location.href = url;
  else { URL.revokeObjectURL(url); return false; }
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
  return true;
}

export async function deleteExpensePdf(id: string): Promise<void> {
  const database = await openDatabase();
  await transactionPromise(database, "readwrite", (store) => store.delete(id));
  database.close();
}

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE_NAME)) request.result.createObjectStore(STORE_NAME);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("PDF arşivi açılamadı."));
  });
}

function transactionPromise(database: IDBDatabase, mode: IDBTransactionMode, action: (store: IDBObjectStore) => IDBRequest): Promise<void> {
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, mode);
    action(transaction.objectStore(STORE_NAME));
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error ?? new Error("PDF arşiv işlemi başarısız."));
    transaction.onabort = () => reject(transaction.error ?? new Error("PDF arşiv işlemi iptal edildi."));
  });
}

function requestPromise<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("PDF okunamadı."));
  });
}
