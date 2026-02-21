let currentBookmarks = [];
let currentBookmark = null;
let sortAscending = true;

const getCategoryIcon = (category) => {
  const icons = {
    learning_guide: '📚',
    research_reference: '🔬',
    buying_decision: '🛒',
    product_tool: '🔧',
    news_update: '📰',
    opinion_analysis: '💭',
    tutorial_howto: '📖',
    career_job: '💼',
    inspiration: '✨',
    entertainment: '🎬',
    problem_solution: '💡',
    documentation: '📄',
    other: '📌'
  };
  return icons[category] || icons.other;
};

const getCategoryLabel = (category) => {
  const labels = {
    learning_guide: 'Learning Guide',
    research_reference: 'Research Reference',
    buying_decision: 'Buying Decision',
    product_tool: 'Product/Tool',
    news_update: 'News Update',
    opinion_analysis: 'Opinion/Analysis',
    tutorial_howto: 'Tutorial/How-To',
    career_job: 'Career/Job',
    inspiration: 'Inspiration',
    entertainment: 'Entertainment',
    problem_solution: 'Problem Solution',
    documentation: 'Documentation',
    other: 'Other'
  };
  return labels[category] || 'Other';
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
      <span class="bookmark-category">${getCategoryIcon(bookmark.primary_intent)} ${getCategoryLabel(bookmark.primary_intent)}</span>
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
      <div class="category-icon">${getCategoryIcon(cat.name)}</div>
      <div class="category-name">${getCategoryLabel(cat.name)}</div>
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
        document.getElementById('all-count').textContent = `${catResponse.bookmarks.length} in ${getCategoryLabel(cat.name)}`;
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
  document.getElementById('detail-intent').textContent = getCategoryLabel(bookmark.primary_intent);
  document.getElementById('detail-type').textContent = bookmark.page_type?.replace(/_/g, ' ') || 'Unknown';
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

const loadSettings = async () => {
  const response = await chrome.runtime.sendMessage({ action: 'getApiConfig' });
  
  if (response.success) {
    document.getElementById('api-key').value = response.config.apiKey;
    document.getElementById('api-endpoint').value = response.config.apiEndpoint;
    document.getElementById('api-model').value = response.config.apiModel;
  }
};

const saveSettings = async () => {
  const apiKey = document.getElementById('api-key').value.trim();
  const apiEndpoint = document.getElementById('api-endpoint').value.trim();
  const apiModel = document.getElementById('api-model').value.trim();
  const status = document.getElementById('settings-status');
  
  if (!apiKey && !document.getElementById('api-key').placeholder) {
    status.textContent = 'API key is required';
    status.className = 'status-message error';
    return;
  }
  
  const response = await chrome.runtime.sendMessage({
    action: 'setApiConfig',
    config: {
      apiKey: apiKey || undefined,
      apiEndpoint: apiEndpoint || undefined,
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
      showToast(`Saved as: ${getCategoryLabel(response.bookmark.primary_intent)}`, 'success');
      loadAllBookmarks();
    } else {
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
  
  document.getElementById('close-detail').addEventListener('click', hideDetail);
  
  document.getElementById('open-url').addEventListener('click', () => {
    if (currentBookmark) {
      chrome.tabs.create({ url: currentBookmark.url });
    }
  });
  
  document.getElementById('delete-bookmark').addEventListener('click', deleteBookmark);
});
