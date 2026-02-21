const AI_TIMEOUT = 30000;
const MAX_RETRIES = 1;

const PROVIDERS = {
  chrome: {
    name: 'Chrome AI (Built-in)',
    defaultModel: 'gemini-nano',
    free: true,
    local: true
  },
  gemini: {
    name: 'Google Gemini',
    defaultEndpoint: 'https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent',
    defaultModel: 'gemini-1.5-flash',
    free: true
  },
  openrouter: {
    name: 'OpenRouter',
    defaultEndpoint: 'https://openrouter.ai/api/v1/chat/completions',
    defaultModel: 'arcee-ai/trinity-mini:free',
    free: true
  },
  openai: {
    name: 'OpenAI',
    defaultEndpoint: 'https://api.openai.com/v1/chat/completions',
    defaultModel: 'gpt-4o-mini',
    free: false
  }
};

const SYSTEM_PROMPT = `You are a web page classifier. Return ONLY valid JSON, no markdown, no explanation.`;

function buildUserPrompt(title, url, content) {
  return `Analyze and classify this webpage:

TITLE: ${title}
URL: ${url}
CONTENT: ${content.substring(0, 5000)}

Return JSON with these fields:
{
  "primary_intent": "A concise label for the primary reason the user is visiting this page (e.g., 'Recipe Search', 'API Documentation', 'News Reading', 'Online Shopping')",
  "page_type": "The structural type of the page (e.g., 'Article', 'Product Page', 'Forum', 'Directory')",
  "emoji": "A single relevant emoji representing the primary intent",
  "topics": ["topic1", "topic2", "topic3"],
  "summary": "A 1-2 sentence summary of the page content",
  "key_takeaways": ["3-5 key points or insights from the page"],
  "confidence": 0.85
}`;
}

async function getApiConfig() {
  return new Promise((resolve) => {
    chrome.storage.local.get(['apiKey', 'apiEndpoint', 'apiModel', 'apiProvider'], (result) => {
      const provider = result.apiProvider || 'chrome';
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
  if (!response.primary_intent) {
    response.primary_intent = 'other';
  }

  if (!response.page_type) {
    response.page_type = 'other';
  }

  if (!response.emoji) {
    response.emoji = '📌';
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

async function checkChromeAIAvailability() {
  if (!self.ai || !self.ai.languageModel) {
    return { available: false, reason: 'Chrome AI API not found. Requires Chrome 127+ with Prompt API enabled.' };
  }

  try {
    const availability = await self.ai.languageModel.availability();
    if (availability === 'available') {
      return { available: true };
    } else if (availability === 'after-download') {
      return { available: false, reason: 'Chrome AI model needs to download. Check chrome://components' };
    } else {
      return { available: false, reason: `Chrome AI status: ${availability}` };
    }
  } catch (e) {
    return { available: false, reason: e.message };
  }
}

async function callChromeAI(title, url, content) {
  const check = await checkChromeAIAvailability();
  if (!check.available) {
    throw new Error(`CHROME_AI_UNAVAILABLE: ${check.reason}`);
  }

  const prompt = `${SYSTEM_PROMPT}\n\n${buildUserPrompt(title, url, content)}`;

  try {
    const session = await self.ai.languageModel.create({
      systemPrompt: SYSTEM_PROMPT
    });

    const result = await session.prompt(prompt);
    session.destroy();

    const jsonStr = extractJsonFromResponse(result);
    const parsed = JSON.parse(jsonStr);

    validateAiResponse(parsed);

    return {
      primary_intent: parsed.primary_intent,
      page_type: parsed.page_type,
      emoji: parsed.emoji,
      topics: parsed.topics.slice(0, 10),
      summary: parsed.summary,
      key_takeaways: parsed.key_takeaways.slice(0, 5),
      confidence: parsed.confidence,
      _source: 'chrome_ai'
    };
  } catch (e) {
    throw new Error(`CHROME_AI_ERROR: ${e.message}`);
  }
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
    const errorMsg = errorData.error?.message || JSON.stringify(errorData);

    if (response.status === 400) {
      throw new Error(`GEMINI_ERROR: Bad request - ${errorMsg}`);
    }
    if (response.status === 403) {
      throw new Error(`GEMINI_ERROR: Invalid API key`);
    }
    if (response.status === 429) {
      throw new Error(`GEMINI_ERROR: Rate limited`);
    }

    throw new Error(`GEMINI_ERROR: ${response.status} - ${errorMsg}`);
  }

  const data = await response.json();

  if (!data.candidates || !data.candidates[0] || !data.candidates[0].content) {
    throw new Error(`GEMINI_ERROR: Invalid response structure`);
  }

  const text = data.candidates[0].content.parts[0].text;
  const jsonStr = extractJsonFromResponse(text);

  let parsed;
  try {
    parsed = JSON.parse(jsonStr);
  } catch (e) {
    throw new Error(`GEMINI_ERROR: JSON parse failed - got: ${text.substring(0, 100)}`);
  }

  validateAiResponse(parsed);

  return {
    primary_intent: parsed.primary_intent,
    page_type: parsed.page_type,
    emoji: parsed.emoji,
    topics: parsed.topics.slice(0, 10),
    summary: parsed.summary,
    key_takeaways: parsed.key_takeaways.slice(0, 5),
    confidence: parsed.confidence,
    _source: 'gemini'
  };
}

async function callOpenRouterApi(config, title, url, content) {
  const userPrompt = buildUserPrompt(title, url, content);

  const requestBody = {
    model: config.apiModel || 'google/gemini-2.0-flash-exp:free',
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
    const errorMsg = errorData.error?.message || JSON.stringify(errorData);

    if (response.status === 401) {
      throw new Error(`OPENROUTER_ERROR: Invalid API key`);
    }
    if (response.status === 429) {
      throw new Error(`OPENROUTER_ERROR: Rate limited`);
    }

    throw new Error(`OPENROUTER_ERROR: ${response.status} - ${errorMsg}`);
  }

  const data = await response.json();

  if (!data.choices || !data.choices[0] || !data.choices[0].message) {
    throw new Error(`OPENROUTER_ERROR: Invalid response structure`);
  }

  const text = data.choices[0].message.content;
  const jsonStr = extractJsonFromResponse(text);

  let parsed;
  try {
    parsed = JSON.parse(jsonStr);
  } catch (e) {
    throw new Error(`OPENROUTER_ERROR: JSON parse failed`);
  }

  validateAiResponse(parsed);

  return {
    primary_intent: parsed.primary_intent,
    page_type: parsed.page_type,
    emoji: parsed.emoji,
    topics: parsed.topics.slice(0, 10),
    summary: parsed.summary,
    key_takeaways: parsed.key_takeaways.slice(0, 5),
    confidence: parsed.confidence,
    _source: 'openrouter'
  };
}

async function callOpenAIApi(config, title, url, content) {
  const userPrompt = buildUserPrompt(title, url, content);

  const requestBody = {
    model: config.apiModel || 'gpt-4o-mini',
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
    const errorMsg = errorData.error?.message || JSON.stringify(errorData);

    if (response.status === 401) {
      throw new Error(`OPENAI_ERROR: Invalid API key`);
    }
    if (response.status === 429) {
      throw new Error(`OPENAI_ERROR: Rate limited`);
    }

    throw new Error(`OPENAI_ERROR: ${response.status} - ${errorMsg}`);
  }

  const data = await response.json();

  if (!data.choices || !data.choices[0] || !data.choices[0].message) {
    throw new Error(`OPENAI_ERROR: Invalid response structure`);
  }

  const text = data.choices[0].message.content;
  const jsonStr = extractJsonFromResponse(text);

  let parsed;
  try {
    parsed = JSON.parse(jsonStr);
  } catch (e) {
    throw new Error(`OPENAI_ERROR: JSON parse failed`);
  }

  validateAiResponse(parsed);

  return {
    primary_intent: parsed.primary_intent,
    page_type: parsed.page_type,
    emoji: parsed.emoji,
    topics: parsed.topics.slice(0, 10),
    summary: parsed.summary,
    key_takeaways: parsed.key_takeaways.slice(0, 5),
    confidence: parsed.confidence,
    _source: 'openai'
  };
}

async function analyzePage(title, url, content) {
  const config = await getApiConfig();
  const provider = config.apiProvider || 'chrome';

  if (provider !== 'chrome' && !config.apiKey) {
    throw new Error(`API_KEY_MISSING: Please add your ${PROVIDERS[provider].name} API key in settings`);
  }

  let lastError = null;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      let result;

      switch (provider) {
        case 'chrome':
          result = await callChromeAI(title, url, content);
          break;
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

      console.log(`[IntentBook] AI analysis successful via ${result._source}:`, result.primary_intent);
      return result;

    } catch (error) {
      lastError = error;
      console.error(`[IntentBook] AI attempt ${attempt + 1} failed:`, error.message);

      if (error.name === 'AbortError') {
        lastError = new Error('TIMEOUT: AI request timed out');
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
    emoji: '📌',
    topics: [],
    summary: summaryFromContent || title,
    key_takeaways: [],
    confidence: 0.0,
    _source: 'fallback',
    _error: true
  };
}

async function analyzePageWithFallback(title, url, content) {
  try {
    return await analyzePage(title, url, content);
  } catch (error) {
    console.warn('[IntentBook] AI analysis failed, using fallback:', error.message);
    const fallback = createFallbackMetadata(title, content);
    fallback._errorMessage = error.message;
    return fallback;
  }
}

export {
  analyzePage,
  analyzePageWithFallback,
  getApiConfig,
  setApiConfig,
  createFallbackMetadata,
  checkChromeAIAvailability,
  PROVIDERS
};
