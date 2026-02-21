# IntentBook – AI Contextual Bookmark Organizer

A local-first, privacy-respecting Chrome extension that uses AI to automatically classify and organize your saved pages.

## Features

- **One-Click Save**: Save any page with a single click on the extension icon
- **AI-Powered Classification**: Automatically categorizes pages by intent, type, and topics
- **Smart Summaries**: Generates concise summaries and key takeaways
- **Local Storage**: All data stored locally in IndexedDB - no cloud, no tracking
- **Revisit Detection**: Shows a badge when you revisit a saved page
- **Full-Text Search**: Search through all your saved bookmarks
- **Category Browsing**: Browse saved pages by AI-classified categories
- **Export/Import**: Backup and restore your data as JSON
- **Privacy First**: API keys stored locally, no external tracking

## Installation

### Prerequisites

1. Chrome browser (version 88 or higher)
2. An OpenAI API key (or compatible API endpoint)

### Step 1: Download/Clone

Download or clone this repository to your local machine.

### Step 2: Generate Icons (Required)

The extension requires PNG icons. You can either:

**Option A: Use the provided SVG files**
Convert the SVG files in the `icons/` folder to PNG:
- `icon16.png` (16x16)
- `icon48.png` (48x48)
- `icon128.png` (128x128)

**Option B: Create your own icons**
Create PNG images with the following sizes in the `icons/` folder:
- `icon16.png`
- `icon48.png`
- `icon128.png`

**Option C: Use placeholder icons**
Run this command in the `intentbook` directory with Node.js installed:
```bash
node generate-icons.js
```

### Step 3: Load the Extension

1. Open Chrome and navigate to `chrome://extensions/`
2. Enable "Developer mode" (toggle in top right)
3. Click "Load unpacked"
4. Select the `intentbook` folder
5. The extension icon should appear in your toolbar

### Step 4: Configure API Key

1. Click the extension icon
2. Click the settings gear icon (⚙️)
3. Enter your API key
4. (Optional) Change the API endpoint for custom/compatible APIs
5. (Optional) Change the model (default: gpt-4o-mini)
6. Click "Save Settings"

## Usage

### Saving a Page

1. Navigate to any webpage you want to save
2. Click the IntentBook extension icon to open the popup
3. Click the "Save" button in the header
4. The extension will:
   - Extract the page content
   - Send it to the AI API
   - Classify and save the result
5. A toast notification will show the classification result

### Viewing Saved Pages

1. Click the extension icon to open the popup
2. Use the tabs to navigate:
   - **All**: View all saved bookmarks
   - **Categories**: Browse by intent category
   - **Search**: Full-text search through bookmarks
   - **Export**: Export/import data

### Viewing Details

1. Click any bookmark item to see full details
2. Details include:
   - Title and URL
   - Primary intent classification
   - Page type
   - Confidence score
   - Summary
   - Topics
   - Key takeaways
   - Save date and visit count

### Search

1. Go to the Search tab
2. Type your query
3. Results update in real-time
4. Search covers: title, summary, topics, takeaways, and URL

### Export/Import

**Export:**
1. Go to the Export tab
2. Click "Export JSON"
3. A JSON file will download

**Import:**
1. Go to the Export tab
2. Click "Import JSON"
3. Select your backup file
4. Choose merge strategy:
   - Skip duplicates (default)
   - Replace duplicates

### Clearing Data

1. Go to the Export tab
2. Click "Clear All"
3. Confirm the action

## API Configuration

### OpenAI (Default)

```
Endpoint: https://api.openai.com/v1/chat/completions
Model: gpt-4o-mini (or gpt-4, gpt-3.5-turbo)
```

Get your API key from: https://platform.openai.com/api-keys

### Compatible APIs

The extension works with any OpenAI-compatible API:
- Azure OpenAI
- Anthropic Claude (via proxy)
- Local LLMs (via compatible servers)
- Custom endpoints

Just change the endpoint URL in settings.

## Data Storage

All data is stored locally using IndexedDB:

**Database:** `intentbookDB`  
**Store:** `bookmarks`

**Schema:**
```javascript
{
  id: Number (auto-increment),
  url: String (unique),
  title: String,
  primary_intent: String,
  page_type: String,
  topics: Array<String>,
  summary: String,
  key_takeaways: Array<String>,
  confidence: Number (0.0-1.0),
  date_saved: String (ISO date),
  visit_count: Number
}
```

**Indexes:**
- `url` (unique)
- `primary_intent`
- `date_saved`

## Classification Categories

### Primary Intent
- `learning_guide` - Educational content, courses, tutorials
- `research_reference` - Academic papers, documentation, references
- `buying_decision` - Product reviews, comparisons, shopping
- `product_tool` - Software tools, apps, services
- `news_update` - News articles, announcements
- `opinion_analysis` - Editorials, opinions, analysis
- `tutorial_howto` - Step-by-step guides, how-tos
- `career_job` - Job listings, career content
- `inspiration` - Creative content, ideas
- `entertainment` - Games, videos, entertainment
- `problem_solution` - Q&A, troubleshooting
- `documentation` - Technical docs, API references
- `other` - Uncategorized

### Page Type
- `article`
- `documentation`
- `product_page`
- `forum_discussion`
- `academic_paper`
- `landing_page`
- `ecommerce_listing`
- `video_page`
- `other`

## Privacy

- **No cloud storage**: All data stays in your browser
- **No tracking**: No analytics or telemetry
- **Local API key**: Your API key is stored in `chrome.storage.local`
- **No logging**: Page content is never logged
- **Your control**: Export and delete your data anytime

## Troubleshooting

### "API key missing"
- Go to settings and enter your API key
- Make sure to click "Save Settings"

### "Failed to save page"
- Check your API key is valid
- Check your API endpoint is correct
- Check your internet connection
- Check the browser console for errors

### "Duplicate URL"
- The page has already been saved
- Each URL can only be saved once

### Extension not working
1. Make sure you've loaded the extension correctly
2. Check that icons are generated (PNG files in icons/ folder)
3. Refresh the page and try again
4. Check chrome://extensions/ for errors

### Badge not showing on revisit
- The page must be fully loaded
- Some pages (chrome://, file://) are not supported
- Check that the URL matches exactly

## Development

### File Structure
```
intentbook/
├── manifest.json        # Extension manifest (MV3)
├── background.js        # Service worker
├── contentScript.js     # Page content extraction
├── contentStyles.css    # Badge styles
├── popup.html           # Popup UI
├── popup.js             # Popup logic
├── styles.css           # Popup styles
├── db.js               # IndexedDB operations
├── ai.js               # AI API integration
├── utils.js            # Utility functions
├── icons/              # Extension icons
│   ├── icon16.png
│   ├── icon48.png
│   └── icon128.png
└── README.md           # This file
```

### Permissions
- `activeTab`: Access current tab content
- `storage`: Store API key and settings
- `scripting`: Inject content scripts
- `host_permissions`: Access page content for saving

### Building
No build step required. Load the unpacked extension directly.

## License

MIT License - Feel free to modify and distribute.

## Contributing

Contributions are welcome! Please:
1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Submit a pull request

## Support

For issues and feature requests, please open an issue on the repository.
