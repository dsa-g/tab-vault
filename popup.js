let currentBookmarks = [];
let currentBookmark = null;
let sortAscending = true;

const getCategoryIcon = (bookmark) => {
  return bookmark.emoji || '📌';
};

const getCategoryLabel = (bookmark) => {
  return bookmark.primary_intent || 'Other';
};

const formatDate = (dateString) => {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now - date;
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;

  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: date.getFullYear() !== now.getFullYear() ? 'numeric' : undefined
  });
};

const escapeHtml = (text) => {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
};

const showToast = (message, type = 'info') => {
  const toast = document.getElementById('toast');
  toast.textContent = message;
  toast.className = `toast ${type} show`;

  setTimeout(() => {
    toast.classList.remove('show');
  }, 3000);
};

const renderBookmarkItem = (bookmark) => {
  const item = document.createElement('div');
  item.className = 'bookmark-item';
  item.dataset.id = bookmark.id;

  item.innerHTML = `
    <div class="bookmark-title">${escapeHtml(bookmark.title)}</div>
    <div class="bookmark-meta">
      <span class="bookmark-category">${getCategoryIcon(bookmark)} ${getCategoryLabel(bookmark)}</span>
      <span class="bookmark-date">${formatDate(bookmark.date_saved)}</span>
    </div>
    <div class="bookmark-summary">${escapeHtml(bookmark.summary || 'No summary')}</div>
  `;

  item.addEventListener('click', () => showDetail(bookmark));

  return item;
};

const renderBookmarks = (bookmarks, containerId, emptyId) => {
  const container = document.getElementById(containerId);
  const empty = document.getElementById(emptyId);

  container.innerHTML = '';

  if (bookmarks.length === 0) {
    empty.style.display = 'block';
    return;
  }

  empty.style.display = 'none';

  bookmarks.forEach(bookmark => {
    container.appendChild(renderBookmarkItem(bookmark));
  });
};

const renderCategories = async () => {
  const response = await chrome.runtime.sendMessage({ action: 'getCategories' });
  const container = document.getElementById('categories-list');
  const empty = document.getElementById('categories-empty');

  if (!response.success || response.categories.length === 0) {
    container.innerHTML = '';
    empty.style.display = 'block';
    return;
  }

  empty.style.display = 'none';
  container.innerHTML = '';

  response.categories.forEach(cat => {
    const card = document.createElement('div');
    card.className = 'category-card';
    card.innerHTML = `
      <div class="category-icon">${getCategoryIcon({ primary_intent: cat.name })}</div>
      <div class="category-name">${getCategoryLabel({ primary_intent: cat.name })}</div>
      <div class="category-count">${cat.count} ${cat.count === 1 ? 'item' : 'items'}</div>
    `;

    card.addEventListener('click', async () => {
      const catResponse = await chrome.runtime.sendMessage({
        action: 'getByCategory',
        category: cat.name
      });

      if (catResponse.success) {
        switchTab('all');
        renderBookmarks(catResponse.bookmarks, 'all-list', 'all-empty');
        document.getElementById('all-count').textContent = `${catResponse.bookmarks.length} in ${getCategoryLabel({ primary_intent: cat.name })}`;
      }
    });

    container.appendChild(card);
  });
};

const showDetail = (bookmark) => {
  currentBookmark = bookmark;

  document.getElementById('detail-title').textContent = bookmark.title;
  document.getElementById('detail-url').textContent = bookmark.url;
  document.getElementById('detail-url').href = bookmark.url;
  document.getElementById('detail-intent').textContent = getCategoryLabel(bookmark);
  document.getElementById('detail-type').textContent = bookmark.page_type || 'Unknown';
  document.getElementById('detail-confidence').textContent = `${Math.round((bookmark.confidence || 0) * 100)}%`;
  document.getElementById('detail-date').textContent = formatDate(bookmark.date_saved);
  document.getElementById('detail-visits').textContent = bookmark.visit_count || 0;
  document.getElementById('detail-summary').textContent = bookmark.summary || 'No summary available';

  const topicsContainer = document.getElementById('detail-topics');
  const topicsSection = document.getElementById('topics-section');

  if (bookmark.topics && bookmark.topics.length > 0) {
    topicsSection.style.display = 'block';
    topicsContainer.innerHTML = bookmark.topics.map(t => `<span class="tag">${escapeHtml(t)}</span>`).join('');
  } else {
    topicsSection.style.display = 'none';
  }

  const takeawaysContainer = document.getElementById('detail-takeaways');
  const takeawaysSection = document.getElementById('takeaways-section');

  if (bookmark.key_takeaways && bookmark.key_takeaways.length > 0) {
    takeawaysSection.style.display = 'block';
    takeawaysContainer.innerHTML = bookmark.key_takeaways.map(k => `<li>${escapeHtml(k)}</li>`).join('');
  } else {
    takeawaysSection.style.display = 'none';
  }

  document.getElementById('detail-panel').classList.add('active');
};

const hideDetail = () => {
  document.getElementById('detail-panel').classList.remove('active');
  currentBookmark = null;
};

const switchTab = (tabName) => {
  document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));

  document.querySelector(`[data-tab="${tabName}"]`).classList.add('active');
  document.getElementById(`tab-${tabName}`).classList.add('active');

  if (tabName === 'categories') {
    renderCategories();
  }
};

const loadAllBookmarks = async () => {
  const response = await chrome.runtime.sendMessage({ action: 'getAllBookmarks' });

  if (response.success) {
    currentBookmarks = response.bookmarks;
    renderBookmarks(currentBookmarks, 'all-list', 'all-empty');
    document.getElementById('all-count').textContent = `${currentBookmarks.length} saved`;
  }
};

const searchBookmarks = async (query) => {
  if (!query.trim()) {
    document.getElementById('search-results').innerHTML = '';
    document.getElementById('search-empty').style.display = 'block';
    return;
  }

  const response = await chrome.runtime.sendMessage({
    action: 'searchBookmarks',
    query: query
  });

  if (response.success) {
    renderBookmarks(response.bookmarks, 'search-results', 'search-empty');
  }
};

const exportData = async () => {
  try {
    const response = await chrome.runtime.sendMessage({ action: 'exportData' });

    if (response.success) {
      const blob = new Blob([JSON.stringify(response.data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `intentbook-export-${new Date().toISOString().split('T')[0]}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      showToast('Export successful!', 'success');
    }
  } catch (error) {
    showToast('Export failed', 'error');
  }
};

const importData = async (file) => {
  try {
    const text = await file.text();
    const data = JSON.parse(text);

    const mergeStrategy = document.querySelector('input[name="merge-strategy"]:checked').value;

    const response = await chrome.runtime.sendMessage({
      action: 'importData',
      data: data,
      mergeStrategy: mergeStrategy
    });

    if (response.success) {
      const { imported, skipped, errors } = response.result;
      showToast(`Imported: ${imported}, Skipped: ${skipped}, Errors: ${errors}`, imported > 0 ? 'success' : 'info');
      loadAllBookmarks();
    }
  } catch (error) {
    showToast('Import failed: Invalid file', 'error');
  }
};

const PROVIDERS = {
  chrome: {
    name: 'Chrome AI',
    keyUrl: '',
    info: 'Built-in AI - No API key needed',
    needsKey: false
  },
  gemini: {
    name: 'Google Gemini',
    keyUrl: 'https://aistudio.google.com/app/apikey',
    info: 'Free tier with generous limits',
    needsKey: true
  },
  openrouter: {
    name: 'OpenRouter',
    keyUrl: 'https://openrouter.ai/keys',
    info: 'Access multiple free AI models',
    needsKey: true
  },
  openai: {
    name: 'OpenAI',
    keyUrl: 'https://platform.openai.com/api-keys',
    info: 'Paid API with GPT models',
    needsKey: true
  }
};

const checkChromeAI = async () => {
  const statusEl = document.getElementById('chrome-ai-check');

  try {
    const response = await chrome.runtime.sendMessage({ action: 'checkChromeAI' });

    if (response.available) {
      statusEl.innerHTML = '<span class="status-ok">✓ Available</span>';
      statusEl.className = 'status-check status-ok';
    } else {
      statusEl.innerHTML = `<span class="status-warn">✗ ${response.reason}</span>`;
      statusEl.className = 'status-check status-warn';
    }
  } catch (e) {
    statusEl.innerHTML = '<span class="status-warn">✗ Not available</span>';
    statusEl.className = 'status-check status-warn';
  }
};

const loadSettings = async () => {
  const response = await chrome.runtime.sendMessage({ action: 'getApiConfig' });

  if (response.success) {
    const provider = response.config.apiProvider || 'chrome';
    document.getElementById('api-provider').value = provider;
    document.getElementById('api-key').value = response.config.apiKey;
    document.getElementById('api-model').value = response.config.apiModel || '';
    updateProviderInfo(provider);

    if (provider === 'chrome') {
      checkChromeAI();
    }
  }
};

const updateProviderInfo = (provider) => {
  const info = PROVIDERS[provider];
  const keyGroup = document.getElementById('api-key-group');
  const modelGroup = document.getElementById('api-model-group');
  const chromeStatus = document.getElementById('chrome-ai-status');

  document.getElementById('provider-info').textContent = info.info;

  if (info.needsKey) {
    keyGroup.style.display = 'block';
    modelGroup.style.display = 'block';
    chromeStatus.style.display = 'none';
    document.getElementById('key-info').innerHTML = `Get a key: <a href="${info.keyUrl}" target="_blank">${info.name}</a>`;
  } else {
    keyGroup.style.display = 'none';
    modelGroup.style.display = 'none';
    chromeStatus.style.display = 'block';
    checkChromeAI();
  }
};

const saveSettings = async () => {
  const apiProvider = document.getElementById('api-provider').value;
  const apiKey = document.getElementById('api-key').value.trim();
  const apiModel = document.getElementById('api-model').value.trim();
  const status = document.getElementById('settings-status');

  const provider = PROVIDERS[apiProvider];

  if (provider.needsKey && !apiKey) {
    status.textContent = 'API key is required for this provider';
    status.className = 'status-message error';
    return;
  }

  const response = await chrome.runtime.sendMessage({
    action: 'setApiConfig',
    config: {
      apiProvider,
      apiKey: apiKey || undefined,
      apiModel: apiModel || undefined
    }
  });

  if (response.success) {
    status.textContent = 'Settings saved!';
    status.className = 'status-message success';
    setTimeout(() => {
      status.textContent = '';
    }, 2000);
  }
};

const deleteBookmark = async () => {
  if (!currentBookmark) return;

  try {
    const response = await chrome.runtime.sendMessage({
      action: 'deleteBookmark',
      id: currentBookmark.id
    });

    if (response.success) {
      showToast('Bookmark deleted', 'success');
      hideDetail();
      loadAllBookmarks();
    }
  } catch (error) {
    showToast('Failed to delete', 'error');
  }
};

const clearAllData = async () => {
  if (!confirm('Are you sure you want to delete all bookmarks? This cannot be undone.')) {
    return;
  }

  try {
    const response = await chrome.runtime.sendMessage({ action: 'clearAll' });

    if (response.success) {
      showToast('All data cleared', 'success');
      loadAllBookmarks();
    }
  } catch (error) {
    showToast('Failed to clear data', 'error');
  }
};

let isSaving = false;

const saveCurrentPage = async () => {
  if (isSaving) return;

  const saveBtn = document.getElementById('save-btn');
  const originalContent = saveBtn.innerHTML;

  try {
    isSaving = true;
    saveBtn.innerHTML = '<span class="spinner"></span> Saving...';
    saveBtn.disabled = true;

    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

    if (!tab || !tab.url) {
      showToast('Cannot access this page', 'error');
      return;
    }

    if (tab.url.startsWith('chrome://') || tab.url.startsWith('chrome-extension://') || tab.url.startsWith('about:')) {
      showToast('Cannot save browser pages', 'error');
      return;
    }

    const response = await chrome.runtime.sendMessage({
      action: 'savePage',
      tabId: tab.id,
      url: tab.url,
      title: tab.title
    });

    if (response.success) {
      await saveLog({
        action: 'SAVE_PAGE',
        type: response.aiError ? 'warning' : 'success',
        provider: response.aiSource,
        url: tab.url,
        result: response.bookmark.primary_intent,
        error: response.aiError,
        response: {
          bookmark: response.bookmark,
          aiSource: response.aiSource,
          aiError: response.aiError
        }
      });
      showResultPanel(response);
      loadAllBookmarks();
    } else {
      await saveLog({
        action: 'SAVE_PAGE',
        type: 'error',
        url: tab.url,
        error: response.error
      });
      showToast(response.error || 'Failed to save', 'error');
    }
  } catch (error) {
    console.error('Save error:', error);
    showToast('Failed to save page', 'error');
  } finally {
    isSaving = false;
    saveBtn.innerHTML = originalContent;
    saveBtn.disabled = false;
  }
};

const showResultPanel = (response) => {
  const bookmark = response.bookmark;
  const source = response.aiSource || 'unknown';
  const isError = response.aiError;

  const providerNames = {
    chrome: 'Chrome AI (Gemini Nano)',
    gemini: 'Google Gemini',
    openrouter: 'OpenRouter',
    openai: 'OpenAI',
    fallback: 'Fallback (no AI)',
    unknown: 'Unknown'
  };

  document.getElementById('result-provider').innerHTML = `
    <div class="result-row">
      <span class="result-label">Provider:</span>
      <span class="result-value">${providerNames[source] || source}</span>
    </div>
    <div class="result-row">
      <span class="result-label">Status:</span>
      <span class="result-value ${isError ? 'status-error' : 'status-success'}">${isError ? '⚠️ Fallback used' : '✓ Success'}</span>
    </div>
  `;

  document.getElementById('result-classification').innerHTML = `
    <div class="result-row">
      <span class="result-label">Intent:</span>
      <span class="result-value">${getCategoryIcon(bookmark)} ${getCategoryLabel(bookmark)}</span>
    </div>
    <div class="result-row">
      <span class="result-label">Type:</span>
      <span class="result-value">${bookmark.page_type}</span>
    </div>
    <div class="result-row">
      <span class="result-label">Confidence:</span>
      <span class="result-value">${Math.round((bookmark.confidence || 0) * 100)}%</span>
    </div>
    <div class="result-row">
      <span class="result-label">Topics:</span>
      <span class="result-value">${bookmark.topics?.join(', ') || 'none'}</span>
    </div>
    <div class="result-row">
      <span class="result-label">Summary:</span>
      <span class="result-value">${bookmark.summary || 'No summary'}</span>
    </div>
  `;

  const cleanBookmark = { ...bookmark };
  delete cleanBookmark._source;
  delete cleanBookmark._error;
  delete cleanBookmark._errorMessage;

  document.getElementById('result-json').textContent = JSON.stringify({
    source: source,
    error: isError || null,
    result: cleanBookmark
  }, null, 2);

  const errorSection = document.getElementById('result-error-section');
  if (isError) {
    errorSection.style.display = 'block';
    document.getElementById('result-error').textContent = response.aiError;
  } else {
    errorSection.style.display = 'none';
  }

  document.getElementById('result-panel').classList.add('active');
};

const loadLogs = async () => {
  const result = await chrome.storage.local.get(['intentbook_logs']);
  return result.intentbook_logs || [];
};

const saveLog = async (log) => {
  const logs = await loadLogs();
  logs.unshift({
    ...log,
    timestamp: new Date().toISOString()
  });
  const trimmedLogs = logs.slice(0, 100);
  await chrome.storage.local.set({ intentbook_logs: trimmedLogs });
};

const clearLogs = async () => {
  await chrome.storage.local.set({ intentbook_logs: [] });
  showToast('Logs cleared', 'success');
};

const showLogsPanel = async () => {
  const logs = await loadLogs();
  const container = document.getElementById('logs-content');

  if (logs.length === 0) {
    container.innerHTML = '<div class="logs-empty">No logs yet. Save a page to see logs.</div>';
  } else {
    container.innerHTML = logs.map(log => `
      <div class="log-entry ${log.type || 'info'}">
        <div class="log-time">${new Date(log.timestamp).toLocaleTimeString()}</div>
        <div class="log-action">${log.action}</div>
        <div class="log-details">
          ${log.provider ? `<div><strong>Provider:</strong> ${log.provider}</div>` : ''}
          ${log.url ? `<div><strong>URL:</strong> ${log.url.substring(0, 50)}...</div>` : ''}
          ${log.result ? `<div><strong>Result:</strong> ${log.result}</div>` : ''}
          ${log.error ? `<div class="log-error"><strong>Error:</strong> ${log.error}</div>` : ''}
          ${log.response ? `<pre class="log-json">${escapeHtml(JSON.stringify(log.response, null, 2))}</pre>` : ''}
        </div>
      </div>
    `).join('');
  }

  document.getElementById('logs-panel').classList.add('active');
};

document.addEventListener('DOMContentLoaded', () => {
  loadAllBookmarks();

  document.querySelectorAll('.tab').forEach(tab => {
    tab.addEventListener('click', () => switchTab(tab.dataset.tab));
  });

  document.getElementById('save-btn').addEventListener('click', saveCurrentPage);

  document.getElementById('sort-btn').addEventListener('click', () => {
    sortAscending = !sortAscending;
    document.getElementById('sort-btn').textContent = sortAscending ? 'Sort ↓' : 'Sort ↑';
    currentBookmarks.reverse();
    renderBookmarks(currentBookmarks, 'all-list', 'all-empty');
  });

  const searchInput = document.getElementById('search-input');
  const clearSearch = document.getElementById('clear-search');

  searchInput.addEventListener('input', (e) => {
    clearSearch.style.display = e.target.value ? 'block' : 'none';
    searchBookmarks(e.target.value);
  });

  clearSearch.addEventListener('click', () => {
    searchInput.value = '';
    clearSearch.style.display = 'none';
    document.getElementById('search-results').innerHTML = '';
    document.getElementById('search-empty').style.display = 'block';
  });

  document.getElementById('export-btn').addEventListener('click', exportData);

  document.getElementById('import-input').addEventListener('change', (e) => {
    if (e.target.files.length > 0) {
      document.getElementById('import-options').style.display = 'block';
    }
  });

  document.getElementById('import-input').addEventListener('change', (e) => {
    if (e.target.files.length > 0) {
      importData(e.target.files[0]);
      e.target.value = '';
    }
  });

  document.getElementById('clear-btn').addEventListener('click', clearAllData);

  document.getElementById('settings-btn').addEventListener('click', () => {
    loadSettings();
    document.getElementById('settings-panel').classList.add('active');
  });

  document.getElementById('close-settings').addEventListener('click', () => {
    document.getElementById('settings-panel').classList.remove('active');
  });

  document.getElementById('save-settings').addEventListener('click', saveSettings);

  document.getElementById('api-provider').addEventListener('change', (e) => {
    updateProviderInfo(e.target.value);
  });

  document.getElementById('close-detail').addEventListener('click', hideDetail);

  document.getElementById('open-url').addEventListener('click', () => {
    if (currentBookmark) {
      chrome.tabs.create({ url: currentBookmark.url });
    }
  });

  document.getElementById('delete-bookmark').addEventListener('click', deleteBookmark);

  document.getElementById('close-result').addEventListener('click', () => {
    document.getElementById('result-panel').classList.remove('active');
  });

  document.getElementById('close-logs').addEventListener('click', () => {
    document.getElementById('logs-panel').classList.remove('active');
  });

  document.getElementById('view-logs-btn').addEventListener('click', showLogsPanel);

  document.getElementById('clear-logs-btn').addEventListener('click', async () => {
    await clearLogs();
    document.getElementById('logs-content').innerHTML = '<div class="logs-empty">No logs yet.</div>';
  });

  document.getElementById('copy-logs').addEventListener('click', async () => {
    const logs = await loadLogs();
    const text = JSON.stringify(logs, null, 2);
    await navigator.clipboard.writeText(text);
    showToast('Logs copied!', 'success');
  });
});
