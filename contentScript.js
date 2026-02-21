(function() {
  'use strict';
  
  if (window.__intentbookInjected) return;
  window.__intentbookInjected = true;
  
  const BADGE_ID = 'intentbook-badge';
  const BADGE_STYLES_ID = 'intentbook-badge-styles';
  
  function injectBadgeStyles() {
    if (document.getElementById(BADGE_STYLES_ID)) return;
    
    const style = document.createElement('style');
    style.id = BADGE_STYLES_ID;
    style.textContent = `
      #intentbook-badge {
        position: fixed;
        bottom: 20px;
        right: 20px;
        z-index: 2147483647;
        background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
        color: white;
        padding: 12px 16px;
        border-radius: 12px;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        font-size: 13px;
        box-shadow: 0 4px 20px rgba(102, 126, 234, 0.4);
        max-width: 320px;
        cursor: pointer;
        transition: all 0.3s ease;
        animation: intentbook-slide-in 0.3s ease-out;
      }
      
      #intentbook-badge:hover {
        transform: translateY(-2px);
        box-shadow: 0 6px 25px rgba(102, 126, 234, 0.5);
      }
      
      @keyframes intentbook-slide-in {
        from {
          opacity: 0;
          transform: translateY(20px);
        }
        to {
          opacity: 1;
          transform: translateY(0);
        }
      }
      
      .intentbook-badge-header {
        display: flex;
        align-items: center;
        gap: 8px;
        font-weight: 600;
        margin-bottom: 6px;
      }
      
      .intentbook-badge-icon {
        font-size: 16px;
      }
      
      .intentbook-badge-category {
        background: rgba(255, 255, 255, 0.2);
        padding: 2px 8px;
        border-radius: 4px;
        font-size: 11px;
        text-transform: capitalize;
      }
      
      .intentbook-badge-summary {
        font-size: 12px;
        opacity: 0.9;
        line-height: 1.4;
        max-height: 0;
        overflow: hidden;
        transition: max-height 0.3s ease;
      }
      
      #intentbook-badge.expanded .intentbook-badge-summary {
        max-height: 150px;
      }
      
      .intentbook-badge-meta {
        display: flex;
        align-items: center;
        gap: 12px;
        margin-top: 8px;
        font-size: 11px;
        opacity: 0.8;
      }
      
      .intentbook-badge-close {
        position: absolute;
        top: 6px;
        right: 8px;
        background: none;
        border: none;
        color: rgba(255, 255, 255, 0.7);
        cursor: pointer;
        font-size: 16px;
        padding: 2px;
        line-height: 1;
      }
      
      .intentbook-badge-close:hover {
        color: white;
      }
    `;
    document.head.appendChild(style);
  }
  
  function getCategoryIcon(category) {
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
  }
  
  function formatDate(dateString) {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    });
  }
  
  function showBadge(bookmark) {
    if (document.getElementById(BADGE_ID)) return;
    
    injectBadgeStyles();
    
    const badge = document.createElement('div');
    badge.id = BADGE_ID;
    
    const icon = getCategoryIcon(bookmark.primary_intent);
    const category = bookmark.primary_intent.replace(/_/g, ' ');
    const summary = bookmark.summary || 'No summary available';
    
    badge.innerHTML = `
      <button class="intentbook-badge-close" title="Close">&times;</button>
      <div class="intentbook-badge-header">
        <span class="intentbook-badge-icon">${icon}</span>
        <span>Saved in IntentBook</span>
        <span class="intentbook-badge-category">${category}</span>
      </div>
      <div class="intentbook-badge-summary">${escapeHtml(summary)}</div>
      <div class="intentbook-badge-meta">
        <span>Saved: ${formatDate(bookmark.date_saved)}</span>
        <span>Visits: ${bookmark.visit_count || 1}</span>
      </div>
    `;
    
    document.body.appendChild(badge);
    
    badge.addEventListener('click', (e) => {
      if (e.target.classList.contains('intentbook-badge-close')) {
        badge.remove();
        return;
      }
      badge.classList.toggle('expanded');
    });
    
    setTimeout(() => {
      if (document.getElementById(BADGE_ID)) {
        badge.classList.add('expanded');
      }
    }, 1000);
    
    setTimeout(() => {
      if (document.getElementById(BADGE_ID)) {
        badge.classList.remove('expanded');
      }
    }, 5000);
  }
  
  function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }
  
  async function checkForSavedPage() {
    const url = window.location.href;
    
    if (url.startsWith('chrome://') || 
        url.startsWith('chrome-extension://') || 
        url.startsWith('about:') ||
        url.startsWith('file://')) {
      return;
    }
    
    try {
      const response = await chrome.runtime.sendMessage({
        action: 'checkUrl',
        url: url
      });
      
      if (response && response.exists && response.bookmark) {
        chrome.runtime.sendMessage({
          action: 'incrementVisit',
          url: url
        }).catch(() => {});
        
        setTimeout(() => {
          showBadge(response.bookmark);
        }, 1000);
      }
    } catch (error) {
      console.warn('IntentBook: Could not check saved status:', error);
    }
  }
  
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === 'pageLoaded') {
      checkForSavedPage();
    }
    sendResponse({ received: true });
    return true;
  });
  
  if (document.readyState === 'complete') {
    checkForSavedPage();
  } else {
    window.addEventListener('load', checkForSavedPage);
  }
  
})();
