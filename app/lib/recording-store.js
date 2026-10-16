// IndexedDB stores each media chunk separately so a reload can recover local footage.
function open() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open("speech-recordings-v1", 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      db.createObjectStore("drafts", { keyPath: "roundId" });
      const chunks = db.createObjectStore("chunks", { keyPath: ["roundId", "index"] });
      chunks.createIndex("roundId", "roundId");
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}
async function work(mode, fn) {
  const db = await open();
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(["drafts", "chunks"], mode);
      let value;
      tx.oncomplete = () => resolve(value);
      tx.onerror = tx.onabort = () => reject(tx.error || Error("Local recording storage failed"));
      fn(tx, (result) => { value = result; });
    });
  } finally { db.close(); }
}
export function clearRecording(roundId) {
  return work("readwrite", (tx) => {
    tx.objectStore("drafts").delete(roundId);
    const cursor = tx.objectStore("chunks").index("roundId").openCursor(IDBKeyRange.only(roundId));
    cursor.onsuccess = () => { if (cursor.result) { cursor.result.delete(); cursor.result.continue(); } };
  });
}
export async function beginRecording(draft) {
  await clearRecording(draft.roundId);
  return work("readwrite", (tx) => tx.objectStore("drafts").put(draft));
}
export function saveChunk(draft, index, blob) {
  return work("readwrite", (tx) => {
    tx.objectStore("drafts").put(draft);
    tx.objectStore("chunks").put({ roundId: draft.roundId, index, blob });
  });
}
export function finishRecording(draft) {
  return work("readwrite", (tx) => tx.objectStore("drafts").put(draft));
}
export function recoverRecording(roundId) {
  return work("readonly", (tx, result) => {
    let draft, chunks;
    const done = () => {
      if (draft && chunks?.length) result({ ...draft, blob: new Blob(chunks.sort((a,b) => a.index-b.index).map((c) => c.blob), { type: draft.mimeType }) });
    };
    const meta = tx.objectStore("drafts").get(roundId);
    meta.onsuccess = () => { draft = meta.result; done(); };
    const data = tx.objectStore("chunks").index("roundId").getAll(roundId);
    data.onsuccess = () => { chunks = data.result; done(); };
  });
}
