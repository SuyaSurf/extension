/**
 * Universal Content Script Handler (JavaScript)
 * Handles all page interactions and skill-specific content script coordination
 */

console.log('Suya Bot Content Script (JavaScript) initialized');

// Extension communication
let extensionPort = null;
let isInitialized = false;
let pageContext = null;

// Initialize content script
function initialize() {
  try {
    console.log('Suya Bot: Initializing universal handler...');
    
    // Establish connection with background script
    connectToBackground();
    
    // Analyze page context
    analyzePageContext();
    
    // Set up message listeners
    setupMessageListeners();
    
    // Set up page observers
    setupPageObservers();
    
    // Inject UI elements if needed
    injectUIElements();
    
    isInitialized = true;
    console.log('Suya Bot: Universal handler initialized');
    
  } catch (error) {
    console.error('Suya Bot: Failed to initialize universal handler:', error);
  }
}

function connectToBackground() {
  try {
    extensionPort = chrome.runtime.connect({ name: 'content-script' });
    
    extensionPort.onMessage.addListener(handleBackgroundMessage);
    extensionPort.onDisconnect.addListener(() => {
      console.log('Suya Bot: Disconnected from background script');
      extensionPort = null;
    });
    
    // Send initialization message
    extensionPort.postMessage({
      type: 'content-script-initialized',
      data: {
        url: window.location.href,
        title: document.title,
        context: pageContext
      }
    });
    
  } catch (error) {
    console.error('Suya Bot: Failed to connect to background script:', error);
  }
}

function analyzePageContext() {
  pageContext = {
    url: window.location.href,
    domain: window.location.hostname,
    path: window.location.pathname,
    title: document.title,
    type: detectPageType(),
    features: detectPageFeatures(),
    elements: scanPageElements(),
    forms: scanForms(),
    media: scanMediaElements(),
    text: getPageText(),
    language: document.documentElement.lang || 'en'
  };
  
  console.log('Suya Bot: Page context analyzed:', pageContext);
}

function detectPageType() {
  const url = window.location.href;
  const domain = window.location.hostname;
  
  // Specific site detection
  if (domain.includes('gmail.com')) return 'gmail';
  if (domain.includes('outlook.com')) return 'outlook';
  if (domain.includes('venmail.com')) return 'venmail';
  if (domain.includes('telegram.org')) return 'telegram';
  if (domain.includes('web.whatsapp.com')) return 'whatsapp';
  if (domain.includes('docs.google.com')) return 'google-docs';
  if (domain.includes('slides.google.com')) return 'google-slides';
  if (domain.includes('youtube.com')) return 'youtube';
  
  // Generic type detection
  if (document.querySelector('form')) return 'form-page';
  if (document.querySelector('article, .article, .post')) return 'article';
  if (document.querySelector('video, audio')) return 'media-page';
  if (document.querySelector('canvas, svg')) return 'creative-page';
  
  return 'general';
}

function detectPageFeatures() {
  return {
    hasForms: !!document.querySelector('form'),
    hasInputs: !!document.querySelector('input, textarea, select'),
    hasButtons: !!document.querySelector('button, input[type="button"], input[type="submit"]'),
    hasLinks: !!document.querySelector('a[href]'),
    hasImages: !!document.querySelector('img'),
    hasVideo: !!document.querySelector('video'),
    hasAudio: !!document.querySelector('audio'),
    hasCanvas: !!document.querySelector('canvas'),
    hasEditableContent: !!document.querySelector('[contenteditable="true"]'),
    hasCodeBlocks: !!document.querySelector('pre, code'),
    hasTables: !!document.querySelector('table'),
    hasLists: !!document.querySelector('ul, ol, dl'),
    isSPA: detectSPA(),
    hasDarkMode: detectDarkMode(),
    hasResponsiveDesign: detectResponsiveDesign()
  };
}

function detectSPA() {
  return !!(
    document.querySelector('[data-reactroot], [data-vue], [ng-app], [ng-controller]') ||
    window.history?.pushState ||
    window.location.hash
  );
}

function detectDarkMode() {
  const styles = getComputedStyle(document.documentElement);
  return styles.getPropertyValue('--dark-mode') === 'true' || 
         styles.colorScheme === 'dark' ||
         window.matchMedia('(prefers-color-scheme: dark)').matches;
}

function detectResponsiveDesign() {
  const hasViewportMeta = !!document.querySelector('meta[name="viewport"]');
  return hasViewportMeta; // Simplified check
}

function scanPageElements() {
  return {
    headings: Array.from(document.querySelectorAll('h1, h2, h3, h4, h5, h6')).map(el => ({
      tag: el.tagName,
      text: el.textContent?.trim(),
      level: parseInt(el.tagName.substring(1))
    })),
    paragraphs: Array.from(document.querySelectorAll('p')).map(el => ({
      text: el.textContent?.trim(),
      length: el.textContent?.length || 0
    })),
    links: Array.from(document.querySelectorAll('a[href]')).map(el => ({
      href: el.href,
      text: el.textContent?.trim(),
      isExternal: el.hostname !== window.location.hostname
    })),
    buttons: Array.from(document.querySelectorAll('button, input[type="button"], input[type="submit"]')).map(el => ({
      text: el.textContent?.trim() || el.value,
      type: el.type,
      disabled: el.disabled
    })),
    inputs: Array.from(document.querySelectorAll('input, textarea, select')).map(el => ({
      type: el.type,
      name: el.name,
      placeholder: el.placeholder,
      required: el.required,
      disabled: el.disabled
    }))
  };
}

function scanForms() {
  return Array.from(document.querySelectorAll('form')).map(form => ({
    action: form.action,
    method: form.method,
    id: form.id,
    fields: Array.from(form.elements).map(element => ({
      name: element.name,
      type: element.type,
      value: element.value,
      placeholder: element.placeholder,
      required: element.required,
      disabled: element.disabled
    }))
  }));
}

function scanMediaElements() {
  return {
    videos: Array.from(document.querySelectorAll('video')).map(video => ({
      src: video.src,
      duration: video.duration,
      currentTime: video.currentTime,
      paused: video.paused,
      muted: video.muted
    })),
    audios: Array.from(document.querySelectorAll('audio')).map(audio => ({
      src: audio.src,
      duration: audio.duration,
      currentTime: audio.currentTime,
      paused: audio.paused,
      muted: audio.muted
    })),
    images: Array.from(document.querySelectorAll('img')).map(img => ({
      src: img.src,
      alt: img.alt,
      width: img.width,
      height: img.height
    }))
  };
}

function getPageText() {
  const walker = document.createTreeWalker(
    document.body,
    NodeFilter.SHOW_TEXT,
    {
      acceptNode: function(node) {
        const parent = node.parentElement;
        if (!parent) return NodeFilter.FILTER_REJECT;
        
        const tagName = parent.tagName.toLowerCase();
        if (['script', 'style', 'noscript'].includes(tagName)) {
          return NodeFilter.FILTER_REJECT;
        }
        
        if (node.textContent?.trim()) {
          return NodeFilter.FILTER_ACCEPT;
        }
        
        return NodeFilter.FILTER_REJECT;
      }
    }
  );
  
  const textNodes = [];
  let node;
  while (node = walker.nextNode()) {
    textNodes.push(node.textContent?.trim());
  }
  
  return textNodes.join(' ').substring(0, 10000); // Limit to 10k chars
}

function setupMessageListeners() {
  // Listen for messages from background script
  window.addEventListener('message', handleWindowMessage);
  
  // Listen for messages from injected scripts
  document.addEventListener('suya-message', handleCustomMessage);
}

function handleBackgroundMessage(message) {
  try {
    switch (message.type) {
      case 'execute-action':
        executeSkillAction(message.data);
        break;
      case 'update-context':
        analyzePageContext();
        sendContextUpdate();
        break;
      case 'inject-ui':
        injectUIElements(message.data);
        break;
      case 'remove-ui':
        removeUIElements(message.data);
        break;
      default:
        console.log('Suya Bot: Unknown message type:', message.type);
    }
  } catch (error) {
    console.error('Suya Bot: Error handling background message:', error);
  }
}

function handleWindowMessage(event) {
  if (event.source !== window) return;
  
  if (event.data.type === 'suya-command') {
    handleCommand(event.data.command, event.data.data);
  }
}

function handleCustomMessage(event) {
  handleCommand(event.detail.command, event.detail.data);
}

function executeSkillAction(data) {
  console.log(`Suya Bot: Executing skill action`, data);
  // Implementation would go here
}

function handleCommand(command, data) {
  console.log('Suya Bot: Handling command:', command, data);
  // Implementation would go here
}

function setupPageObservers() {
  // Observe DOM changes
  const observer = new MutationObserver((mutations) => {
    let significantChange = false;
    
    mutations.forEach((mutation) => {
      if (mutation.type === 'childList' && mutation.addedNodes.length > 0) {
        significantChange = true;
      }
    });
    
    if (significantChange) {
      // Debounce context update
      setTimeout(() => {
        analyzePageContext();
        sendContextUpdate();
      }, 1000);
    }
  });
  
  observer.observe(document.body, {
    childList: true,
    subtree: true
  });
}

function injectUIElements(customData) {
  // Create Suya bot
  const suyaBot = document.createElement('div');
  suyaBot.id = 'suya-bot-container';
  suyaBot.innerHTML = `
    <div id="suya-bot" class="suya-bot" title="Suya Bot Assistant">
      <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
        <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15c-.55 0-1-.45-1-1s.45-1 1-1 1 .45 1 1-.45 1-1 1zm4 0c-.55 0-1-.45-1-1s.45-1 1-1 1 .45 1 1-.45 1-1 1z"/>
      </svg>
    </div>
  `;
  
  document.body.appendChild(suyaBot);
  
  // Position Suya bot
  positionSuyaBot();
  
  // Add event listeners
  const bot = document.getElementById('suya-bot');
  if (bot) {
    bot.addEventListener('click', () => {
      toggleSuyaOverlay();
    });
  }
}

function positionSuyaBot() {
  const bot = document.getElementById('suya-bot');
  if (!bot) return;
  
  const padding = 20;
  const botSize = 60;
  const screenWidth = window.innerWidth;
  const screenHeight = window.innerHeight;
  
  // Position in top-right corner
  const x = screenWidth - botSize - padding;
  const y = padding;
  
  bot.style.left = x + 'px';
  bot.style.top = y + 'px';
  bot.style.position = 'fixed';
  bot.style.zIndex = '9999';
}

function toggleSuyaOverlay() {
  console.log('Suya Bot: Toggle overlay');
  // Implementation would go here
}

function removeUIElements(elements) {
  const suyaBot = document.getElementById('suya-bot-container');
  if (suyaBot) suyaBot.remove();
}

function sendContextUpdate() {
  if (extensionPort && pageContext) {
    extensionPort.postMessage({
      type: 'context-updated',
      data: pageContext
    });
  }
}

function sendToBackground(type, data) {
  if (extensionPort) {
    extensionPort.postMessage({
      type: type,
      data: data
    });
  }
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initialize);
} else {
  initialize();
}

// Re-initialize on page navigation (for SPAs)
let lastUrl = window.location.href;
new MutationObserver(() => {
  if (window.location.href !== lastUrl) {
    lastUrl = window.location.href;
    setTimeout(initialize, 1000);
  }
}).observe(document, { subtree: true, childList: true });
