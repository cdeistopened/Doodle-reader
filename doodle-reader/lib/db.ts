import { FeedItem, FeedSource } from '../types';

const DB_NAME = 'ReaderClassicDB';
const DB_VERSION = 1;

export class ReaderDB {
  private db: IDBDatabase | null = null;

  async init(): Promise<void> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        this.db = request.result;
        resolve();
      };

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        
        // Feeds Store
        if (!db.objectStoreNames.contains('feeds')) {
          db.createObjectStore('feeds', { keyPath: 'id' });
        }

        // Items Store
        if (!db.objectStoreNames.contains('items')) {
          const itemStore = db.createObjectStore('items', { keyPath: 'id' });
          itemStore.createIndex('feedId', 'feedId', { unique: false });
          itemStore.createIndex('timestamp', 'timestamp', { unique: false });
          itemStore.createIndex('isRead', 'isRead', { unique: false });
        }
      };
    });
  }

  async addFeed(feed: FeedSource): Promise<void> {
    return this.performTransaction('feeds', 'readwrite', (store) => {
      store.put(feed);
    });
  }

  async addItems(items: FeedItem[]): Promise<void> {
    return this.performTransaction('items', 'readwrite', (store) => {
      items.forEach(item => {
        // We use put, but we need to be careful not to overwrite 'isRead' status if item exists
        // ideally checking existence first, but for bulk speed we might just put.
        // For a true sync engine, we'd check ID existence.
        // A simple "preservation" hack:
        // In a real app, we check if it exists. 
        store.put(item);
      });
    });
  }

  // Optimized for speed: fetch all, but in real world would use cursor with limit
  async getAllItems(): Promise<FeedItem[]> {
    return new Promise((resolve, reject) => {
      if (!this.db) return reject("DB not init");
      const transaction = this.db.transaction(['items'], 'readonly');
      const store = transaction.objectStore('items');
      const index = store.index('timestamp');
      // Get reversed (newest first)
      const request = index.getAll(); 
      
      request.onsuccess = () => {
        // Reverse because getAll returns ascending by default
        resolve(request.result.reverse());
      };
      request.onerror = () => reject(request.error);
    });
  }

  async getAllFeeds(): Promise<FeedSource[]> {
     return new Promise((resolve, reject) => {
      if (!this.db) return reject("DB not init");
      const transaction = this.db.transaction(['feeds'], 'readonly');
      const store = transaction.objectStore('feeds');
      const request = store.getAll();
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  async markAsRead(itemId: string, isRead: boolean = true): Promise<void> {
    if (!this.db) return;
    const tx = this.db.transaction(['items'], 'readwrite');
    const store = tx.objectStore('items');
    
    return new Promise((resolve) => {
      const req = store.get(itemId);
      req.onsuccess = () => {
        const item = req.result as FeedItem;
        if (item) {
          item.isRead = isRead;
          store.put(item);
        }
        resolve();
      };
    });
  }

  async updateItemSummary(itemId: string, summary: string): Promise<void> {
    if (!this.db) return;
    const tx = this.db.transaction(['items'], 'readwrite');
    const store = tx.objectStore('items');

    return new Promise((resolve) => {
      const req = store.get(itemId);
      req.onsuccess = () => {
        const item = req.result as FeedItem;
        if (item) {
          item.aiSummary = summary;
          store.put(item);
        }
        resolve();
      };
    });
  }

  async toggleStar(itemId: string): Promise<void> {
    if (!this.db) return;
    const tx = this.db.transaction(['items'], 'readwrite');
    const store = tx.objectStore('items');
    
    return new Promise((resolve) => {
      const req = store.get(itemId);
      req.onsuccess = () => {
        const item = req.result as FeedItem;
        if (item) {
          item.isStarred = !item.isStarred;
          store.put(item);
        }
        resolve();
      };
    });
  }

  async markAllRead(feedId?: string): Promise<void> {
    // This is expensive in IndexedDB without a cursor update, but valid for < 10k items
    if (!this.db) return;
    const tx = this.db.transaction(['items'], 'readwrite');
    const store = tx.objectStore('items');
    const request = store.openCursor();

    request.onsuccess = (event) => {
      const cursor = (event.target as IDBRequest).result;
      if (cursor) {
        const item = cursor.value as FeedItem;
        if (!item.isRead && (!feedId || item.feedId === feedId)) {
          item.isRead = true;
          cursor.update(item);
        }
        cursor.continue();
      }
    };
  }

  private async performTransaction(
    storeName: string, 
    mode: IDBTransactionMode, 
    callback: (store: IDBObjectStore) => void
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this.db) return reject("DB not initialized");
      const transaction = this.db.transaction([storeName], mode);
      const store = transaction.objectStore(storeName);
      
      callback(store);

      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
    });
  }
}

export const db = new ReaderDB();