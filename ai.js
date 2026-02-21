const DEFAULT_ENDPOINT = 'https://api.openai.com/v1/chat/completions';
const DEFAULT_MODEL = 'gpt-4o-mini';
const AI_TIMEOUT = 30000;
const MAX_RETRIES = 2;

const SYSTEM_PROMPT = `You are an intelligent web page classifier and knowledge organizer. Return only valid JSON. Do not include explanations or markdown.`;

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
    chrome.storage.local.get(['apiKey', 'apiEndpoint', 'apiModel'], (result) => {
      resolve({
        apiKey: result.apiKey || '',
        apiEndpoint: result.apiEndpoint || DEFAULT_ENDPOINT,
        apiModel: result.apiModel || DEFAULT_MODEL
      });
    });
  });
}

async function setApiConfig(config) {
  return new Promise((resolve) => {
    chrome.storage.local.set(config, resolve);
  });
}

function extractJsonFromResponse(text) {
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (jsonMatch) {
    return jsonMatch[0];
  }
  return text;
}

function validateAiResponse(response) {
  const required = ['primary_intent', 'page_type', 'topics', 'summary', 'key_takeaways', 'confidence'];
  const validIntents = [
    'learning_guide', 'research_reference', 'buying_decision', 'product_tool',
    'news_update', 'opinion_analysis', 'tutorial_howto', 'career_job',
    'inspiration', 'entertainment', 'problem_solution', 'documentation', 'other'
  ];
  const validPageTypes = [
    'article', 'documentation', 'product_page', 'forum_discussion',
    'academic_paper', 'landing_page', 'ecommerce_listing', 'video_page', 'other'
  ];
  
  for (const field of required) {
    if (!(field in response)) {
      return false;
    }
  }
  
  if (!validIntents.includes(response.primary_intent)) {
    response.primary_intent = 'other';
  }
  
  if (!validPageTypes.includes(response.page_type)) {
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

async function analyzePage(title, url, content) {
  const config = await getApiConfig();
  
  if (!config.apiKey) {
    throw new Error('API_KEY_MISSING');
  }
  
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
  
  let lastError = null;
  
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
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
        if (response.status >= 500) {
          throw new Error('API_SERVER_ERROR');
        }
        
        throw new Error(errorData.error?.message || `API Error: ${response.status}`);
      }
      
      const data = await response.json();
      
      if (!data.choices || !data.choices[0] || !data.choices[0].message) {
        throw new Error('INVALID_API_RESPONSE');
      }
      
      const content = data.choices[0].message.content;
      const jsonStr = extractJsonFromResponse(content);
      
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
  DEFAULT_ENDPOINT,
  DEFAULT_MODEL
};
