const AI_TIMEOUT = 30000;
const MAX_RETRIES = 2;

const PROVIDERS = {
  gemini: {
    name: 'Google Gemini',
    defaultEndpoint: 'https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent',
    defaultModel: 'gemini-1.5-flash',
    free: true
  },
  openrouter: {
    name: 'OpenRouter',
    defaultEndpoint: 'https://openrouter.ai/api/v1/chat/completions',
    defaultModel: 'google/gemini-2.0-flash-exp:free',
    free: true
  },
  openai: {
    name: 'OpenAI',
    defaultEndpoint: 'https://api.openai.com/v1/chat/completions',
    defaultModel: 'gpt-4o-mini',
    free: false
  }
};

const SYSTEM_PROMPT = `You are an intelligent web page classifier and knowledge organizer. Return only valid JSON. Do not include explanations or markdown code blocks.`;

function buildUserPrompt(title, url, content) {
  return `Analyze the webpage below.

TITLE: ${title}
URL: ${url}
CONTENT: ${content}

Classify primary_intent as one of:
learning_guide, research_reference, buying_decision, product_tool, news_update, opinion_analysis, tutorial_howto, career_job, inspiration, entertainment, problem_solution, documentation, other

Classify page_type as one of:
article, documentation, product_page, forum_discussion, academic_paper, landing_page, ecommerce_listing, video_page, other

Return JSON:
{
  "primary_intent": "",
  "page_type": "",
  "topics": [],
  "summary": "",
  "key_takeaways": [],
  "confidence": 0.0
}`;
}

async function getApiConfig() {
  return new Promise((resolve) => {
    chrome.storage.local.get(['apiKey', 'apiEndpoint', 'apiModel', 'apiProvider'], (result) => {
      const provider = result.apiProvider || 'gemini';
      const providerConfig = PROVIDERS[provider];
      
      resolve({
        apiKey: result.apiKey || '',
        apiEndpoint: result.apiEndpoint || providerConfig.defaultEndpoint,
        apiModel: result.apiModel || providerConfig.defaultModel,
        apiProvider: provider
      });
    });
  });
}

async function setApiConfig(config) {
  return new Promise((resolve) => {
    chrome.storage.local.set(config, resolve);
  });
}

function validateAiResponse(response) {
  const validIntents = [
    'learning_guide', 'research_reference', 'buying_decision', 'product_tool',
    'news_update', 'opinion_analysis', 'tutorial_howto', 'career_job',
    'inspiration', 'entertainment', 'problem_solution', 'documentation', 'other'
  ];
  const validPageTypes = [
    'article', 'documentation', 'product_page', 'forum_discussion',
    'academic_paper', 'landing_page', 'ecommerce_listing', 'video_page', 'other'
  ];
  
  if (!response.primary_intent || !validIntents.includes(response.primary_intent)) {
    response.primary_intent = 'other';
  }
  
  if (!response.page_type || !validPageTypes.includes(response.page_type)) {
    response.page_type = 'other';
  }
  
  if (!Array.isArray(response.topics)) {
    response.topics = [];
  }
  
  if (!Array.isArray(response.key_takeaways)) {
    response.key_takeaways = [];
  }
  
  if (typeof response.confidence !== 'number' || response.confidence < 0 || response.confidence > 1) {
    response.confidence = 0.5;
  }
  
  return true;
}

function extractJsonFromResponse(text) {
  let cleaned = text.trim();
  
  if (cleaned.startsWith('```json')) {
    cleaned = cleaned.slice(7);
  } else if (cleaned.startsWith('```')) {
    cleaned = cleaned.slice(3);
  }
  if (cleaned.endsWith('```')) {
    cleaned = cleaned.slice(0, -3);
  }
  
  const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
  if (jsonMatch) {
    return jsonMatch[0];
  }
  return cleaned;
}

async function callGeminiApi(config, title, url, content) {
  const userPrompt = buildUserPrompt(title, url, content);
  
  const requestBody = {
    contents: [{
      parts: [{
        text: `${SYSTEM_PROMPT}\n\n${userPrompt}`
      }]
    }],
    generationConfig: {
      temperature: 0.3,
      maxOutputTokens: 1000
    }
  };
  
  const endpoint = `${config.apiEndpoint}?key=${config.apiKey}`;
  
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), AI_TIMEOUT);
  
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(requestBody),
    signal: controller.signal
  });
  
  clearTimeout(timeoutId);
  
  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    
    if (response.status === 400) {
      throw new Error('API_KEY_INVALID');
    }
    if (response.status === 403) {
      throw new Error('API_KEY_INVALID');
    }
    if (response.status === 429) {
      throw new Error('API_RATE_LIMIT');
    }
    
    throw new Error(errorData.error?.message || `API Error: ${response.status}`);
  }
  
  const data = await response.json();
  
  if (!data.candidates || !data.candidates[0] || !data.candidates[0].content) {
    throw new Error('INVALID_API_RESPONSE');
  }
  
  const text = data.candidates[0].content.parts[0].text;
  const jsonStr = extractJsonFromResponse(text);
  
  let parsed;
  try {
    parsed = JSON.parse(jsonStr);
  } catch (e) {
    throw new Error('JSON_PARSE_ERROR');
  }
  
  if (!validateAiResponse(parsed)) {
    throw new Error('INVALID_RESPONSE_FORMAT');
  }
  
  return {
    primary_intent: parsed.primary_intent,
    page_type: parsed.page_type,
    topics: parsed.topics.slice(0, 10),
    summary: parsed.summary,
    key_takeaways: parsed.key_takeaways.slice(0, 5),
    confidence: parsed.confidence
  };
}

async function callOpenRouterApi(config, title, url, content) {
  const userPrompt = buildUserPrompt(title, url, content);
  
  const requestBody = {
    model: config.apiModel,
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: userPrompt }
    ],
    temperature: 0.3,
    max_tokens: 1000
  };
  
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), AI_TIMEOUT);
  
  const response = await fetch(config.apiEndpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${config.apiKey}`,
      'HTTP-Referer': 'https://github.com/dsa-g/tab-vault',
      'X-Title': 'IntentBook'
    },
    body: JSON.stringify(requestBody),
    signal: controller.signal
  });
  
  clearTimeout(timeoutId);
  
  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    
    if (response.status === 401) {
      throw new Error('API_KEY_INVALID');
    }
    if (response.status === 429) {
      throw new Error('API_RATE_LIMIT');
    }
    
    throw new Error(errorData.error?.message || `API Error: ${response.status}`);
  }
  
  const data = await response.json();
  
  if (!data.choices || !data.choices[0] || !data.choices[0].message) {
    throw new Error('INVALID_API_RESPONSE');
  }
  
  const text = data.choices[0].message.content;
  const jsonStr = extractJsonFromResponse(text);
  
  let parsed;
  try {
    parsed = JSON.parse(jsonStr);
  } catch (e) {
    throw new Error('JSON_PARSE_ERROR');
  }
  
  if (!validateAiResponse(parsed)) {
    throw new Error('INVALID_RESPONSE_FORMAT');
  }
  
  return {
    primary_intent: parsed.primary_intent,
    page_type: parsed.page_type,
    topics: parsed.topics.slice(0, 10),
    summary: parsed.summary,
    key_takeaways: parsed.key_takeaways.slice(0, 5),
    confidence: parsed.confidence
  };
}

async function callOpenAIApi(config, title, url, content) {
  const userPrompt = buildUserPrompt(title, url, content);
  
  const requestBody = {
    model: config.apiModel,
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: userPrompt }
    ],
    temperature: 0.3,
    max_tokens: 1000,
    response_format: { type: 'json_object' }
  };
  
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), AI_TIMEOUT);
  
  const response = await fetch(config.apiEndpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${config.apiKey}`
    },
    body: JSON.stringify(requestBody),
    signal: controller.signal
  });
  
  clearTimeout(timeoutId);
  
  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    
    if (response.status === 401) {
      throw new Error('API_KEY_INVALID');
    }
    if (response.status === 429) {
      throw new Error('API_RATE_LIMIT');
    }
    
    throw new Error(errorData.error?.message || `API Error: ${response.status}`);
  }
  
  const data = await response.json();
  
  if (!data.choices || !data.choices[0] || !data.choices[0].message) {
    throw new Error('INVALID_API_RESPONSE');
  }
  
  const text = data.choices[0].message.content;
  const jsonStr = extractJsonFromResponse(text);
  
  let parsed;
  try {
    parsed = JSON.parse(jsonStr);
  } catch (e) {
    throw new Error('JSON_PARSE_ERROR');
  }
  
  if (!validateAiResponse(parsed)) {
    throw new Error('INVALID_RESPONSE_FORMAT');
  }
  
  return {
    primary_intent: parsed.primary_intent,
    page_type: parsed.page_type,
    topics: parsed.topics.slice(0, 10),
    summary: parsed.summary,
    key_takeaways: parsed.key_takeaways.slice(0, 5),
    confidence: parsed.confidence
  };
}

async function analyzePage(title, url, content) {
  const config = await getApiConfig();
  
  if (!config.apiKey) {
    throw new Error('API_KEY_MISSING');
  }
  
  let lastError = null;
  
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      let result;
      
      switch (config.apiProvider) {
        case 'gemini':
          result = await callGeminiApi(config, title, url, content);
          break;
        case 'openrouter':
          result = await callOpenRouterApi(config, title, url, content);
          break;
        case 'openai':
        default:
          result = await callOpenAIApi(config, title, url, content);
          break;
      }
      
      return result;
      
    } catch (error) {
      lastError = error;
      
      if (error.name === 'AbortError') {
        lastError = new Error('API_TIMEOUT');
      }
      
      if (error.message === 'API_KEY_INVALID' || error.message === 'API_KEY_MISSING') {
        throw error;
      }
      
      if (attempt === MAX_RETRIES) {
        break;
      }
      
      await new Promise(resolve => setTimeout(resolve, 1000 * (attempt + 1)));
    }
  }
  
  throw lastError || new Error('AI_ANALYSIS_FAILED');
}

function createFallbackMetadata(title, content) {
  const summaryFromContent = content
    .split('\n\n')
    .filter(p => p.length > 50)
    .slice(0, 2)
    .join(' ')
    .substring(0, 300);
  
  return {
    primary_intent: 'other',
    page_type: 'other',
    topics: [],
    summary: summaryFromContent || title,
    key_takeaways: [],
    confidence: 0.0
  };
}

async function analyzePageWithFallback(title, url, content) {
  try {
    return await analyzePage(title, url, content);
  } catch (error) {
    console.warn('AI analysis failed, using fallback:', error.message);
    return createFallbackMetadata(title, content);
  }
}

export {
  analyzePage,
  analyzePageWithFallback,
  getApiConfig,
  setApiConfig,
  createFallbackMetadata,
  PROVIDERS
};
