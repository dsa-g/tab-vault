function truncateText(text, maxTokens = 7000) {
  const avgCharsPerToken = 4;
  const maxChars = maxTokens * avgCharsPerToken;

  if (text.length <= maxChars) {
    return text;
  }

  const truncated = text.substring(0, maxChars);
  const lastSpace = truncated.lastIndexOf(' ');
  const lastNewline = truncated.lastIndexOf('\n');
  const cutoff = Math.max(lastSpace, lastNewline);

  if (cutoff > maxChars * 0.8) {
    return truncated.substring(0, cutoff) + '...';
  }

  return truncated + '...';
}

function cleanText(text) {
  if (!text) return '';

  return text
    .replace(/\s+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function extractReadableContent(document) {
  const cloneDoc = document.cloneNode(true);

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

  removeSelectors.forEach(selector => {
    try {
      cloneDoc.querySelectorAll(selector).forEach(el => el.remove());
    } catch (e) { }
  });

  const articleSelectors = [
    'article',
    '[role="main"]',
    'main',
    '.post-content',
    '.article-content',
    '.entry-content',
    '.content',
    '#content',
    '.post',
    '.article'
  ];

  let contentElement = null;
  for (const selector of articleSelectors) {
    const el = cloneDoc.querySelector(selector);
    if (el) {
      contentElement = el;
      break;
    }
  }

  if (!contentElement) {
    contentElement = cloneDoc.body;
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

  return cleanText(text);
}

function extractPageInfo() {
  const url = window.location.href;
  const title = document.title || 'Untitled';

  const description = document.querySelector('meta[name="description"]')?.content ||
    document.querySelector('meta[property="og:description"]')?.content || '';

  const ogTitle = document.querySelector('meta[property="og:title"]')?.content || title;

  let content = extractReadableContent(document);

  if (content.length < 100 && description) {
    content = description + '\n\n' + content;
  }

  return {
    url,
    title: ogTitle || title,
    content: truncateText(content, 7000),
    description
  };
}

function isValidUrl(string) {
  try {
    const url = new URL(string);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch (_) {
    return false;
  }
}

function formatDate(dateString) {
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
}

function debounce(func, wait) {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function getCategoryIcon(item) {
  if (typeof item === 'object' && item !== null) {
    return item.emoji || '📌';
  }
  return '📌';
}

function getCategoryLabel(item) {
  if (typeof item === 'object' && item !== null) {
    return item.primary_intent || 'Other';
  }
  return item || 'Other';
}

function validateApiKey(key) {
  if (!key || typeof key !== 'string') return false;
  return key.trim().length >= 10;
}

function validateApiEndpoint(url) {
  try {
    new URL(url);
    return true;
  } catch {
    return false;
  }
}

function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).substring(2, 9);
}

function safeJsonParse(str, fallback = null) {
  try {
    return JSON.parse(str);
  } catch {
    return fallback;
  }
}

function downloadJson(data, filename) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function readFileAsText(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error);
    reader.readAsText(file);
  });
}

export {
  truncateText,
  cleanText,
  extractReadableContent,
  extractPageInfo,
  isValidUrl,
  formatDate,
  debounce,
  escapeHtml,
  getCategoryIcon,
  getCategoryLabel,
  validateApiKey,
  validateApiEndpoint,
  generateId,
  safeJsonParse,
  downloadJson,
  readFileAsText
};
