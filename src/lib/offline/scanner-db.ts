"use client";

// IndexedDB wrapper for offline scanner sync.
// Stores: tickets_cache (valid tickets for current event), scan_queue (pending scans), scan_history (all scans).

const DB_NAME = "outsiderr-scanner";
const DB_VERSION = 1;

const STORES = {
  TICKETS_CACHE: "tickets_cache",
  SCAN_QUEUE: "scan_queue",
  SCAN_HISTORY: "scan_history",
} as const;

type StoreName = (typeof STORES)[keyof typeof STORES];

let dbPromise: Promise<IDBDatabase> | null = null;

function openDB(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;

  dbPromise = new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("IndexedDB not available"));
      return;
    }

    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);

    request.onupgradeneeded = () => {
      const db = request.result;

      if (!db.objectStoreNames.contains(STORES.TICKETS_CACHE)) {
        const store = db.createObjectStore(STORES.TICKETS_CACHE, { keyPath: "qr_hash" });
        store.createIndex("event_id", "event_id", { unique: false });
      }

      if (!db.objectStoreNames.contains(STORES.SCAN_QUEUE)) {
        const store = db.createObjectStore(STORES.SCAN_QUEUE, { keyPath: "id", autoIncrement: true });
        store.createIndex("event_id", "event_id", { unique: false });
      }

      if (!db.objectStoreNames.contains(STORES.SCAN_HISTORY)) {
        const store = db.createObjectStore(STORES.SCAN_HISTORY, { keyPath: "id", autoIncrement: true });
        store.createIndex("event_id", "event_id", { unique: false });
      }
    };
  });

  return dbPromise;
}

async function tx<T>(
  storeName: StoreName,
  mode: IDBTransactionMode,
  fn: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(storeName, mode);
    const store = transaction.objectStore(storeName);
    const request = fn(store);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

// --- Tickets cache ---

export interface CachedTicket {
  qr_hash: string;
  event_id: string;
  status: string;
  tier_name: string | null;
  holder_name: string | null;
  buyer_phone: string | null;
  buyer_email: string | null;
  cached_at: number;
}

export async function cacheTickets(tickets: CachedTicket[]): Promise<void> {
  try {
    const db = await openDB();
    const transaction = db.transaction(STORES.TICKETS_CACHE, "readwrite");
    const store = transaction.objectStore(STORES.TICKETS_CACHE);
    store.clear(); // Clear old cache
    for (const ticket of tickets) {
      store.put(ticket);
    }
    await new Promise<void>((resolve, reject) => {
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
    });
  } catch (err) {
    console.error("[scanner-db] cacheTickets error:", err);
  }
}

export async function getCachedTicket(qrHash: string): Promise<CachedTicket | null> {
  try {
    return await tx(STORES.TICKETS_CACHE, "readonly", (store) => store.get(qrHash));
  } catch {
    return null;
  }
}

export async function getCachedTicketsForEvent(eventId: string): Promise<CachedTicket[]> {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORES.TICKETS_CACHE, "readonly");
      const store = transaction.objectStore(STORES.TICKETS_CACHE);
      const index = store.index("event_id");
      const request = index.getAll(eventId);
      request.onsuccess = () => resolve(request.result as CachedTicket[]);
      request.onerror = () => reject(request.error);
    });
  } catch {
    return [];
  }
}

// --- Scan queue (pending offline scans) ---

export interface QueuedScan {
  id?: number;
  qr_hash: string;
  event_id: string;
  pin: string;
  timestamp: string;
}

export async function queueScan(scan: Omit<QueuedScan, "id">): Promise<void> {
  try {
    await tx(STORES.SCAN_QUEUE, "readwrite", (store) => store.put(scan));
  } catch (err) {
    console.error("[scanner-db] queueScan error:", err);
  }
}

export async function getQueuedScans(eventId?: string): Promise<QueuedScan[]> {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORES.SCAN_QUEUE, "readonly");
      const store = transaction.objectStore(STORES.SCAN_QUEUE);
      if (eventId) {
        const index = store.index("event_id");
        const request = index.getAll(eventId);
        request.onsuccess = () => resolve(request.result as QueuedScan[]);
        request.onerror = () => reject(request.error);
      } else {
        const request = store.getAll();
        request.onsuccess = () => resolve(request.result as QueuedScan[]);
        request.onerror = () => reject(request.error);
      }
    });
  } catch {
    return [];
  }
}

export async function deleteQueuedScan(id: number): Promise<void> {
  try {
    await tx(STORES.SCAN_QUEUE, "readwrite", (store) => store.delete(id));
  } catch (err) {
    console.error("[scanner-db] deleteQueuedScan error:", err);
  }
}

export async function clearQueuedScans(eventId?: string): Promise<void> {
  try {
    if (eventId) {
      const scans = await getQueuedScans(eventId);
      for (const scan of scans) {
        const id = scan.id;
        if (id !== undefined) await deleteQueuedScan(id);
      }
    } else {
      await tx(STORES.SCAN_QUEUE, "readwrite", (store) => store.clear());
    }
  } catch (err) {
    console.error("[scanner-db] clearQueuedScans error:", err);
  }
}

// --- Scan history (for display) ---

export interface HistoryScan {
  id?: number;
  qr_hash: string;
  event_id: string;
  outcome: string;
  holder_name: string | null;
  tier_name: string | null;
  timestamp: string;
  synced: boolean;
}

export async function addHistoryScan(scan: Omit<HistoryScan, "id">): Promise<void> {
  try {
    await tx(STORES.SCAN_HISTORY, "readwrite", (store) => store.put(scan));
  } catch (err) {
    console.error("[scanner-db] addHistoryScan error:", err);
  }
}

export async function getHistoryScans(eventId: string, limit = 50): Promise<HistoryScan[]> {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORES.SCAN_HISTORY, "readonly");
      const store = transaction.objectStore(STORES.SCAN_HISTORY);
      const index = store.index("event_id");
      const request = index.getAll(eventId);
      request.onsuccess = () => {
        const results = (request.result as HistoryScan[]).sort((a, b) =>
          new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
        ).slice(0, limit);
        resolve(results);
      };
      request.onerror = () => reject(request.error);
    });
  } catch {
    return [];
  }
}

export async function clearHistoryScans(eventId?: string): Promise<void> {
  try {
    if (eventId) {
      const scans = await getHistoryScans(eventId, 10000);
      for (const scan of scans) {
        const id = scan.id;
        if (id !== undefined) await tx(STORES.SCAN_HISTORY, "readwrite", (store) => store.delete(id));
      }
    } else {
      await tx(STORES.SCAN_HISTORY, "readwrite", (store) => store.clear());
    }
  } catch (err) {
    console.error("[scanner-db] clearHistoryScans error:", err);
  }
}
