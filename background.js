import { analyzePageWithFallback } from './ai.js';

const DB_NAME = 'intentbookDB';
const DB_VERSION = 1;
const STORE_NAME = 'bookmarks';

let db = null;

async function addLog(log) {
  try {
    const result = await chrome.storage.local.get(['intentbook_logs']);
    const logs = result.intentbook_logs || [];
    logs.unshift({
      ...log,
      timestamp: new Date().toISOString()
    });
    await chrome.storage.local.set({ intentbook_logs: logs.slice(0, 100) });
  } catch (e) {
    console.error('[IntentBook] Failed to save log:', e);
  }
}

async function initDB() {
  return new Promise((resolve, reject) => {
    if (db) {
      resolve(db);
      return;
    }

    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => reject(new Error('Failed to open database'));
    request.onsuccess = (event) => {
      db = event.target.result;
      resolve(db);
    };

    request.onupgradeneeded = (event) => {
      const database = event.target.result;
      if (!database.objectStoreNames.contains(STORE_NAME)) {
        const store = database.createObjectStore(STORE_NAME, { keyPath: 'id', autoIncrement: true });
        store.createIndex('url', 'url', { unique: true });
        store.createIndex('primary_intent', 'primary_intent', { unique: false });
        store.createIndex('date_saved', 'date_saved', { unique: false });
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
    request.onsuccess = () => resolve(request.result || null);
    request.onerror = () => reject(request.error);
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
    request.onsuccess = () => resolve({ ...bookmarkData, id: request.result });
    request.onerror = () => {
      if (request.error.name === 'ConstraintError') {
        reject(new Error('Duplicate URL'));
      } else {
        reject(request.error);
      }
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
    request.onerror = () => reject(request.error);
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
      updateRequest.onsuccess = () => resolve(bookmark);
      updateRequest.onerror = () => reject(updateRequest.error);
    };
    request.onerror = () => reject(request.error);
  });
}

async function deleteBookmark(id) {
  const database = await initDB();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction([STORE_NAME], 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.delete(id);
    request.onsuccess = () => resolve(true);
    request.onerror = () => reject(request.error);
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
      putRequest.onsuccess = () => resolve(updated);
      putRequest.onerror = () => reject(putRequest.error);
    };
    getRequest.onerror = () => reject(getRequest.error);
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
    request.onerror = () => reject(request.error);
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

async function exportData() {
  const bookmarks = await getAllBookmarks();
  return {
    version: '1.0',
    exported_at: new Date().toISOString(),
    bookmarks
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

async function clearAllBookmarks() {
  const database = await initDB();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction([STORE_NAME], 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.clear();
    request.onsuccess = () => resolve(true);
    request.onerror = () => reject(request.error);
  });
}

function extractReadableContentFromHtml(html, baseUrl) {
  const removeSelectors = [
    'script', 'style', 'noscript', 'iframe', 'svg',
    'header', 'footer', 'nav', 'aside',
    '[role="navigation"]', '[role="banner"]', '[role="contentinfo"]',
    '.advertisement', '.ad', '.ads', '.sidebar',
    '.comment', '.comments', '#comments',
    '.social-share', '.share-buttons',
    '.related-posts', '.recommended',
    '.popup', '.modal', '.overlay'
  ];
  
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');
  
  removeSelectors.forEach(selector => {
    try {
      doc.querySelectorAll(selector).forEach(el => el.remove());
    } catch (e) {}
  });
  
  const articleSelectors = [
    'article', '[role="main"]', 'main',
    '.post-content', '.article-content', '.entry-content',
    '.content', '#content', '.post', '.article'
  ];
  
  let contentElement = null;
  for (const selector of articleSelectors) {
    const el = doc.querySelector(selector);
    if (el) {
      contentElement = el;
      break;
    }
  }
  
  if (!contentElement) {
    contentElement = doc.body;
  }
  
  const paragraphs = contentElement.querySelectorAll('p, h1, h2, h3, h4, h5, h6');
  let text = '';
  
  paragraphs.forEach(p => {
    const content = p.textContent.trim();
    if (content.length > 20) {
      text += content + '\n\n';
    }
  });
  
  if (text.length < 200) {
    text = contentElement.textContent || '';
  }
  
  return text.replace(/\s+/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
}

function truncateText(text, maxTokens = 7000) {
  const avgCharsPerToken = 4;
  const maxChars = maxTokens * avgCharsPerToken;
  
  if (text.length <= maxChars) return text;
  
  const truncated = text.substring(0, maxChars);
  const lastSpace = truncated.lastIndexOf(' ');
  const lastNewline = truncated.lastIndexOf('\n');
  const cutoff = Math.max(lastSpace, lastNewline);
  
  if (cutoff > maxChars * 0.8) {
    return truncated.substring(0, cutoff) + '...';
  }
  return truncated + '...';
}

chrome.action.onClicked.addListener(async (tab) => {
  const tabId = tab.id;
  const url = tab.url;
  const title = tab.title;
  
  if (!url || url.startsWith('chrome://') || url.startsWith('chrome-extension://') || url.startsWith('about:')) {
    chrome.notifications.create({
      type: 'basic',
      iconUrl: 'icons/icon48.png',
      title: 'IntentBook',
      message: 'Cannot save this type of page.'
    });
    return;
  }
  
  try {
    const existing = await getBookmarkByUrl(url);
    if (existing) {
      chrome.notifications.create({
        type: 'basic',
        iconUrl: 'icons/icon48.png',
        title: 'IntentBook',
        message: 'This page is already saved!'
      });
      return;
    }
  } catch (e) {}
  
  chrome.action.setIcon({ tabId, path: 'icons/icon48-loading.png' }).catch(() => {});
  chrome.action.setBadgeText({ tabId, text: '...' });
  chrome.action.setBadgeBackgroundColor({ tabId, color: '#666666' });
  
  try {
    let content = '';
    
    try {
      const results = await chrome.scripting.executeScript({
        target: { tabId },
        func: () => {
          const removeSelectors = [
            'script', 'style', 'noscript', 'iframe', 'svg',
            'header', 'footer', 'nav', 'aside',
            '[role="navigation"]', '[role="banner"]', '[role="contentinfo"]',
            '.advertisement', '.ad', '.ads', '.sidebar',
            '.comment', '.comments', '#comments',
            '.social-share', '.share-buttons',
            '.related-posts', '.recommended',
            '.popup', '.modal', '.overlay'
          ];
          
          const clone = document.cloneNode(true);
          
          removeSelectors.forEach(selector => {
            try {
              clone.querySelectorAll(selector).forEach(el => el.remove());
            } catch (e) {}
          });
          
          const articleSelectors = [
            'article', '[role="main"]', 'main',
            '.post-content', '.article-content', '.entry-content',
            '.content', '#content', '.post', '.article'
          ];
          
          let contentElement = null;
          for (const selector of articleSelectors) {
            const el = clone.querySelector(selector);
            if (el) {
              contentElement = el;
              break;
            }
          }
          
          if (!contentElement) {
            contentElement = clone.body;
          }
          
          const paragraphs = contentElement.querySelectorAll('p, h1, h2, h3, h4, h5, h6');
          let text = '';
          
          paragraphs.forEach(p => {
            const c = p.textContent.trim();
            if (c.length > 20) {
              text += c + '\n\n';
            }
          });
          
          if (text.length < 200) {
            text = contentElement.textContent || '';
          }
          
          return text.replace(/\s+/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
        }
      });
      
      if (results && results[0] && results[0].result) {
        content = results[0].result;
      }
    } catch (scriptError) {
      console.warn('Could not extract content via script:', scriptError);
    }
    
    content = truncateText(content, 7000);
    
    if (!content || content.length < 50) {
      content = title;
    }
    
    const aiResult = await analyzePageWithFallback(title, url, content);
    
    const bookmark = {
      url,
      title,
      ...aiResult
    };
    
    await addBookmark(bookmark);
    
    chrome.action.setBadgeText({ tabId, text: '✓' });
    chrome.action.setBadgeBackgroundColor({ tabId, color: '#4CAF50' });
    
    chrome.notifications.create({
      type: 'basic',
      iconUrl: 'icons/icon48.png',
      title: 'IntentBook',
      message: `Saved as: ${aiResult.primary_intent.replace(/_/g, ' ')}`
    });
    
    setTimeout(() => {
      chrome.action.setBadgeText({ tabId, text: '' });
      chrome.action.setIcon({ tabId, path: 'icons/icon48.png' }).catch(() => {});
    }, 2000);
    
  } catch (error) {
    console.error('Error saving page:', error);
    
    chrome.action.setBadgeText({ tabId, text: '✗' });
    chrome.action.setBadgeBackgroundColor({ tabId, color: '#f44336' });
    
    let message = 'Failed to save page.';
    if (error.message === 'API_KEY_MISSING') {
      message = 'Please set your API key in extension settings.';
    } else if (error.message === 'API_KEY_INVALID') {
      message = 'Invalid API key. Please check your settings.';
    }
    
    chrome.notifications.create({
      type: 'basic',
      iconUrl: 'icons/icon48.png',
      title: 'IntentBook Error',
      message
    });
    
    setTimeout(() => {
      chrome.action.setBadgeText({ tabId, text: '' });
      chrome.action.setIcon({ tabId, path: 'icons/icon48.png' }).catch(() => {});
    }, 3000);
  }
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  const handleMessage = async () => {
    try {
      switch (message.action) {
        case 'checkUrl':
          const existing = await getBookmarkByUrl(message.url);
          sendResponse({ exists: !!existing, bookmark: existing });
          break;
          
        case 'incrementVisit':
          const updated = await incrementVisitCount(message.url);
          sendResponse({ success: !!updated, bookmark: updated });
          break;
          
        case 'getAllBookmarks':
          const bookmarks = await getAllBookmarks();
          sendResponse({ success: true, bookmarks });
          break;
          
        case 'getCategories':
          const categories = await getCategories();
          sendResponse({ success: true, categories });
          break;
          
        case 'getByCategory':
          const categoryBookmarks = await getBookmarksByCategory(message.category);
          sendResponse({ success: true, bookmarks: categoryBookmarks });
          break;
          
        case 'searchBookmarks':
          const searchResults = await searchBookmarks(message.query);
          sendResponse({ success: true, bookmarks: searchResults });
          break;
          
        case 'deleteBookmark':
          await deleteBookmark(message.id);
          sendResponse({ success: true });
          break;
          
        case 'updateBookmark':
          const updatedBookmark = await updateBookmark(message.id, message.updates);
          sendResponse({ success: true, bookmark: updatedBookmark });
          break;
          
        case 'exportData':
          const exportResult = await exportData();
          sendResponse({ success: true, data: exportResult });
          break;
          
        case 'importData':
          const importResult = await importData(message.data, message.mergeStrategy);
          sendResponse({ success: true, result: importResult });
          break;
          
        case 'clearAll':
          await clearAllBookmarks();
          sendResponse({ success: true });
          break;
          
        case 'getApiConfig':
          const result = await chrome.storage.local.get(['apiKey', 'apiEndpoint', 'apiModel', 'apiProvider']);
          const provider = result.apiProvider || 'chrome';
          sendResponse({
            success: true,
            config: {
              apiKey: result.apiKey ? '••••••••' : '',
              apiEndpoint: result.apiEndpoint,
              apiModel: result.apiModel || '',
              apiProvider: provider,
              hasKey: !!result.apiKey
            }
          });
          break;
          
        case 'checkChromeAI':
          try {
            if (!self.ai || !self.ai.languageModel) {
              sendResponse({ available: false, reason: 'Chrome AI not found. Requires Chrome 127+' });
              break;
            }
            const availability = await self.ai.languageModel.availability();
            if (availability === 'available') {
              sendResponse({ available: true });
            } else if (availability === 'after-download') {
              sendResponse({ available: false, reason: 'Model downloading... Check chrome://components' });
            } else {
              sendResponse({ available: false, reason: `Status: ${availability}` });
            }
          } catch (e) {
            sendResponse({ available: false, reason: e.message });
          }
          break;
          
        case 'setApiConfig':
          const configToSave = {};
          if (message.config.apiProvider) {
            configToSave.apiProvider = message.config.apiProvider;
          }
          if (message.config.apiKey && message.config.apiKey !== '••••••••') {
            configToSave.apiKey = message.config.apiKey;
          }
          if (message.config.apiEndpoint) {
            configToSave.apiEndpoint = message.config.apiEndpoint;
          }
          if (message.config.apiModel) {
            configToSave.apiModel = message.config.apiModel;
          }
          await chrome.storage.local.set(configToSave);
          sendResponse({ success: true });
          break;
          
        case 'savePage':
          try {
            const saveUrl = message.url;
            const saveTitle = message.title;
            const tabId = message.tabId;
            
            const existingBookmark = await getBookmarkByUrl(saveUrl);
            if (existingBookmark) {
              await addLog({
                action: 'SAVE_PAGE',
                type: 'warning',
                url: saveUrl,
                error: 'Already saved'
              });
              sendResponse({ success: false, error: 'Already saved', bookmark: existingBookmark });
              return;
            }
            
            let content = '';
            try {
              const results = await chrome.scripting.executeScript({
                target: { tabId },
                func: () => {
                  const removeSelectors = [
                    'script', 'style', 'noscript', 'iframe', 'svg',
                    'header', 'footer', 'nav', 'aside',
                    '[role="navigation"]', '[role="banner"]', '[role="contentinfo"]',
                    '.advertisement', '.ad', '.ads', '.sidebar',
                    '.comment', '.comments', '#comments',
                    '.social-share', '.share-buttons',
                    '.related-posts', '.recommended',
                    '.popup', '.modal', '.overlay'
                  ];
                  
                  const clone = document.cloneNode(true);
                  
                  removeSelectors.forEach(selector => {
                    try {
                      clone.querySelectorAll(selector).forEach(el => el.remove());
                    } catch (e) {}
                  });
                  
                  const articleSelectors = [
                    'article', '[role="main"]', 'main',
                    '.post-content', '.article-content', '.entry-content',
                    '.content', '#content', '.post', '.article'
                  ];
                  
                  let contentElement = null;
                  for (const selector of articleSelectors) {
                    const el = clone.querySelector(selector);
                    if (el) {
                      contentElement = el;
                      break;
                    }
                  }
                  
                  if (!contentElement) {
                    contentElement = clone.body;
                  }
                  
                  const paragraphs = contentElement.querySelectorAll('p, h1, h2, h3, h4, h5, h6');
                  let text = '';
                  
                  paragraphs.forEach(p => {
                    const c = p.textContent.trim();
                    if (c.length > 20) {
                      text += c + '\n\n';
                    }
                  });
                  
                  if (text.length < 200) {
                    text = contentElement.textContent || '';
                  }
                  
                  return text.replace(/\s+/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
                }
              });
              
              if (results && results[0] && results[0].result) {
                content = results[0].result;
              }
            } catch (scriptError) {
              console.warn('[IntentBook] Could not extract content:', scriptError);
              await addLog({
                action: 'EXTRACT_CONTENT',
                type: 'warning',
                url: saveUrl,
                error: scriptError.message
              });
            }
            
            content = truncateText(content, 7000);
            
            if (!content || content.length < 50) {
              content = saveTitle;
            }
            
            console.log('[IntentBook] Starting AI analysis for:', saveUrl);
            
            const aiResult = await analyzePageWithFallback(saveTitle, saveUrl, content);
            
            console.log('[IntentBook] AI result:', {
              source: aiResult._source,
              intent: aiResult.primary_intent,
              error: aiResult._errorMessage
            });
            
            const newBookmark = {
              url: saveUrl,
              title: saveTitle,
              primary_intent: aiResult.primary_intent,
              page_type: aiResult.page_type,
              topics: aiResult.topics,
              summary: aiResult.summary,
              key_takeaways: aiResult.key_takeaways,
              confidence: aiResult.confidence
            };
            
            const savedBookmark = await addBookmark(newBookmark);
            
            await addLog({
              action: 'SAVE_PAGE',
              type: aiResult._errorMessage ? 'warning' : 'success',
              provider: aiResult._source,
              url: saveUrl,
              result: aiResult.primary_intent,
              error: aiResult._errorMessage,
              response: {
                primary_intent: aiResult.primary_intent,
                page_type: aiResult.page_type,
                topics: aiResult.topics,
                summary: aiResult.summary?.substring(0, 100),
                confidence: aiResult.confidence
              }
            });
            
            sendResponse({ 
              success: true, 
              bookmark: savedBookmark,
              aiSource: aiResult._source,
              aiError: aiResult._errorMessage,
              aiResponse: aiResult
            });
          } catch (saveError) {
            console.error('[IntentBook] Save page error:', saveError);
            await addLog({
              action: 'SAVE_PAGE',
              type: 'error',
              url: message.url,
              error: saveError.message
            });
            sendResponse({ success: false, error: saveError.message });
          }
          break;
          
        default:
          sendResponse({ success: false, error: 'Unknown action' });
      }
    } catch (error) {
      console.error('Message handler error:', error);
      sendResponse({ success: false, error: error.message });
    }
  };
  
  handleMessage();
  return true;
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete' && tab.url) {
    chrome.tabs.sendMessage(tabId, { action: 'pageLoaded', url: tab.url }).catch(() => {});
  }
});
