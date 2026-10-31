let database;
async function db() {
  if (database) return database;
  database = await new Promise((resolve, reject) => {
    const req = indexedDB.open("goop-health", 1);
    req.onupgradeneeded = () =>
      req.result.createObjectStore("sources", { keyPath: "id" });
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return database;
}
export async function getSources() {
  const connection = await db();
  return new Promise((resolve, reject) => {
    const req = connection
      .transaction("sources", "readonly")
      .objectStore("sources")
      .getAll();
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
export async function saveSources(sources) {
  const connection = await db();
  return new Promise((resolve, reject) => {
    const tx = connection.transaction("sources", "readwrite");
    for (const source of sources) tx.objectStore("sources").put(source);
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
  });
}
export async function removeSource(id) {
  const connection = await db();
  return new Promise((resolve, reject) => {
    const tx = connection.transaction("sources", "readwrite");
    tx.objectStore("sources").delete(id);
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
  });
}
