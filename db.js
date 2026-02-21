const DB_NAME = 'intentbookDB';
const DB_VERSION = 1;
const STORE_NAME = 'bookmarks';

let db = null;

async function initDB() {
  return new Promise((resolve, reject) => {
    if (db) {
      resolve(db);
      return;
    }

    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => {
      reject(new Error('Failed to open database'));
    };

    request.onsuccess = (event) => {
      db = event.target.result;
      resolve(db);
    };

    request.onupgradeneeded = (event) => {
      const database = event.target.result;
      
      if (!database.objectStoreNames.contains(STORE_NAME)) {
        const store = database.createObjectStore(STORE_NAME, {
          keyPath: 'id',
          autoIncrement: true
        });
        
        store.createIndex('url', 'url', { unique: true });
        store.createIndex('primary_intent', 'primary_intent', { unique: false });
        store.createIndex('date_saved', 'date_saved', { unique: false });
      }
    };
  });
}

async function addBookmark(bookmark) {
  const database = await initDB();
  
  return new Promise((resolve, reject) => {
    const transaction = database.transaction([STORE_NAME], 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    
    const bookmarkData = {
      ...bookmark,
      date_saved: bookmark.date_saved || new Date().toISOString(),
      visit_count: bookmark.visit_count || 0
    };
    
    const request = store.add(bookmarkData);
    
    request.onsuccess = () => {
      resolve({ ...bookmarkData, id: request.result });
    };
    
    request.onerror = () => {
      if (request.error.name === 'ConstraintError') {
        reject(new Error('Duplicate URL'));
      } else {
        reject(request.error);
      }
    };
  });
}

async function getBookmarkByUrl(url) {
  const database = await initDB();
  
  return new Promise((resolve, reject) => {
    const transaction = database.transaction([STORE_NAME], 'readonly');
    const store = transaction.objectStore(STORE_NAME);
    const index = store.index('url');
    const request = index.get(url);
    
    request.onsuccess = () => {
      resolve(request.result || null);
    };
    
    request.onerror = () => {
      reject(request.error);
    };
  });
}

async function getAllBookmarks() {
  const database = await initDB();
  
  return new Promise((resolve, reject) => {
    const transaction = database.transaction([STORE_NAME], 'readonly');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.getAll();
    
    request.onsuccess = () => {
      const results = request.result || [];
      results.sort((a, b) => new Date(b.date_saved) - new Date(a.date_saved));
      resolve(results);
    };
    
    request.onerror = () => {
      reject(request.error);
    };
  });
}

async function updateBookmark(id, updates) {
  const database = await initDB();
  
  return new Promise(async (resolve, reject) => {
    const transaction = database.transaction([STORE_NAME], 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    
    const getRequest = store.get(id);
    
    getRequest.onsuccess = () => {
      const existing = getRequest.result;
      if (!existing) {
        reject(new Error('Bookmark not found'));
        return;
      }
      
      const updated = { ...existing, ...updates };
      const putRequest = store.put(updated);
      
      putRequest.onsuccess = () => {
        resolve(updated);
      };
      
      putRequest.onerror = () => {
        reject(putRequest.error);
      };
    };
    
    getRequest.onerror = () => {
      reject(getRequest.error);
    };
  });
}

async function incrementVisitCount(url) {
  const database = await initDB();
  
  return new Promise((resolve, reject) => {
    const transaction = database.transaction([STORE_NAME], 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    const index = store.index('url');
    const request = index.get(url);
    
    request.onsuccess = () => {
      const bookmark = request.result;
      if (!bookmark) {
        resolve(null);
        return;
      }
      
      bookmark.visit_count = (bookmark.visit_count || 0) + 1;
      const updateRequest = store.put(bookmark);
      
      updateRequest.onsuccess = () => {
        resolve(bookmark);
      };
      
      updateRequest.onerror = () => {
        reject(updateRequest.error);
      };
    };
    
    request.onerror = () => {
      reject(request.error);
    };
  });
}

async function deleteBookmark(id) {
  const database = await initDB();
  
  return new Promise((resolve, reject) => {
    const transaction = database.transaction([STORE_NAME], 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.delete(id);
    
    request.onsuccess = () => {
      resolve(true);
    };
    
    request.onerror = () => {
      reject(request.error);
    };
  });
}

async function clearAllBookmarks() {
  const database = await initDB();
  
  return new Promise((resolve, reject) => {
    const transaction = database.transaction([STORE_NAME], 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.clear();
    
    request.onsuccess = () => {
      resolve(true);
    };
    
    request.onerror = () => {
      reject(request.error);
    };
  });
}

async function searchBookmarks(query) {
  const bookmarks = await getAllBookmarks();
  const lowerQuery = query.toLowerCase();
  
  return bookmarks.filter(bookmark => 
    bookmark.title?.toLowerCase().includes(lowerQuery) ||
    bookmark.summary?.toLowerCase().includes(lowerQuery) ||
    bookmark.url?.toLowerCase().includes(lowerQuery) ||
    bookmark.topics?.some(t => t.toLowerCase().includes(lowerQuery)) ||
    bookmark.key_takeaways?.some(k => k.toLowerCase().includes(lowerQuery))
  );
}

async function getBookmarksByCategory(category) {
  const database = await initDB();
  
  return new Promise((resolve, reject) => {
    const transaction = database.transaction([STORE_NAME], 'readonly');
    const store = transaction.objectStore(STORE_NAME);
    const index = store.index('primary_intent');
    const request = index.getAll(category);
    
    request.onsuccess = () => {
      const results = request.result || [];
      results.sort((a, b) => new Date(b.date_saved) - new Date(a.date_saved));
      resolve(results);
    };
    
    request.onerror = () => {
      reject(request.error);
    };
  });
}

async function getCategories() {
  const bookmarks = await getAllBookmarks();
  const categoryMap = new Map();
  
  bookmarks.forEach(bookmark => {
    const intent = bookmark.primary_intent || 'other';
    if (!categoryMap.has(intent)) {
      categoryMap.set(intent, 0);
    }
    categoryMap.set(intent, categoryMap.get(intent) + 1);
  });
  
  return Array.from(categoryMap.entries())
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count);
}

async function exportData() {
  const bookmarks = await getAllBookmarks();
  return {
    version: '1.0',
    exported_at: new Date().toISOString(),
    bookmarks: bookmarks
  };
}

async function importData(data, mergeStrategy = 'skip') {
  if (!data || !data.bookmarks || !Array.isArray(data.bookmarks)) {
    throw new Error('Invalid import data format');
  }
  
  let imported = 0;
  let skipped = 0;
  let errors = 0;
  
  for (const bookmark of data.bookmarks) {
    if (!bookmark.url) {
      errors++;
      continue;
    }
    
    try {
      const existing = await getBookmarkByUrl(bookmark.url);
      
      if (existing) {
        if (mergeStrategy === 'skip') {
          skipped++;
          continue;
        } else if (mergeStrategy === 'replace') {
          await updateBookmark(existing.id, bookmark);
          imported++;
          continue;
        }
      }
      
      const { id, ...bookmarkWithoutId } = bookmark;
      await addBookmark(bookmarkWithoutId);
      imported++;
    } catch (err) {
      if (err.message === 'Duplicate URL') {
        skipped++;
      } else {
        errors++;
      }
    }
  }
  
  return { imported, skipped, errors };
}

export {
  initDB,
  addBookmark,
  getBookmarkByUrl,
  getAllBookmarks,
  updateBookmark,
  incrementVisitCount,
  deleteBookmark,
  clearAllBookmarks,
  searchBookmarks,
  getBookmarksByCategory,
  getCategories,
  exportData,
  importData
};
