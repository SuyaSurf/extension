/**
 * Universal Content Script Handler
 * Handles all page interactions and skill-specific content script coordination
 */

(function() {
  'use strict';

  // Extension communication
  let extensionPort = null;
  let isInitialized = false;
  let pageContext = null;
  let activeSkillHandlers = new Map();

  // Initialize content script
  function initialize() {
    try {
      console.log('AI Bot Extension: Initializing universal handler...');
      
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
      console.log('AI Bot Extension: Universal handler initialized');
      
    } catch (error) {
      console.error('AI Bot Extension: Failed to initialize universal handler:', error);
    }
  }

  function connectToBackground() {
    try {
      extensionPort = chrome.runtime.connect({ name: 'content-script' });
      
      extensionPort.onMessage.addListener(handleBackgroundMessage);
      extensionPort.onDisconnect.addListener(() => {
        console.log('AI Bot Extension: Disconnected from background script');
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
      console.error('AI Bot Extension: Failed to connect to background script:', error);
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
    
    console.log('AI Bot Extension: Page context analyzed:', pageContext);
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
    const features = {
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
    
    return features;
  }

  function detectSPA() {
    // Check if it's a Single Page Application
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
    const hasMediaQueries = !!Array.from(document.styleSheets).some(sheet => {
      try {
        return Array.from(sheet.cssRules).some(rule => rule.type === CSSRule.MEDIA_RULE);
      } catch (e) {
        return false;
      }
    });
    
    return hasViewportMeta || hasMediaQueries;
  }

  function scanPageElements() {
    const elements = {
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
    
    return elements;
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
    // Get main text content, excluding scripts and styles
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
    document.addEventListener('aibot-message', handleCustomMessage);
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
        case 'get-selection':
          sendSelectionToBackground();
          break;
        case 'get-media-element':
          sendMediaElementToBackground(message.data);
          break;
        default:
          console.log('AI Bot Extension: Unknown message type:', message.type);
      }
    } catch (error) {
      console.error('AI Bot Extension: Error handling background message:', error);
    }
  }

  function handleWindowMessage(event) {
    if (event.source !== window) return;
    
    if (event.data.type === 'aibot-command') {
      handleCommand(event.data.command, event.data.data);
    }
  }

  function handleCustomMessage(event) {
    handleCommand(event.detail.command, event.detail.data);
  }

  function executeSkillAction(data) {
    const { skill, action, params } = data;
    
    console.log(`AI Bot Extension: Executing ${skill}.${action}`, params);
    
    switch (skill) {
      case 'mail-skills':
        executeMailAction(action, params);
        break;
      case 'chat-skills':
        executeChatAction(action, params);
        break;
      case 'document-skills':
        executeDocumentAction(action, params);
        break;
      case 'application-writing':
        executeApplicationAction(action, params);
        break;
      case 'video-generation':
        executeVideoAction(action, params);
        break;
      case 'server-skills':
        executeServerAction(action, params);
        break;
      default:
        console.log(`AI Bot Extension: No handler for skill ${skill}`);
    }
  }

  function executeMailAction(action, params) {
    switch (pageContext.type) {
      case 'gmail':
        handleGmailAction(action, params);
        break;
      case 'outlook':
        handleOutlookAction(action, params);
        break;
      default:
        console.log('AI Bot Extension: Mail action not supported on this page');
    }
  }

  function executeChatAction(action, params) {
    switch (pageContext.type) {
      case 'telegram':
        handleTelegramAction(action, params);
        break;
      case 'whatsapp':
        handleWhatsAppAction(action, params);
        break;
      default:
        console.log('AI Bot Extension: Chat action not supported on this page');
    }
  }

  function executeDocumentAction(action, params) {
    switch (pageContext.type) {
      case 'google-docs':
        handleGoogleDocsAction(action, params);
        break;
      case 'google-slides':
        handleGoogleSlidesAction(action, params);
        break;
      default:
        console.log('AI Bot Extension: Document action not supported on this page');
    }
  }

  function executeApplicationAction(action, params) {
    if (pageContext.features.hasForms) {
      handleFormAction(action, params);
    } else {
      console.log('AI Bot Extension: No forms found on this page');
    }
  }

  function executeVideoAction(action, params) {
    if (pageContext.features.hasVideo) {
      handleVideoAction(action, params);
    } else {
      console.log('AI Bot Extension: No video elements found on this page');
    }
  }

  function executeServerAction(action, params) {
    switch (action) {
      case 'get-media-element':
        sendMediaElementToBackground(params);
        break;
      default:
        console.log('AI Bot Extension: Unknown server action:', action);
    }
  }

  // Specific handlers for different platforms
  function handleGmailAction(action, params) {
    switch (action) {
      case 'compose-email':
        // Click compose button
        const composeBtn = document.querySelector('[data-tooltip*="Compose"], .T-I.J-J5-Ji.T-I-KE.L3');
        if (composeBtn) composeBtn.click();
        break;
      case 'reply-to-email':
        // Click reply button
        const replyBtn = document.querySelector('[data-tooltip*="Reply"]');
        if (replyBtn) replyBtn.click();
        break;
      default:
        console.log('AI Bot Extension: Unknown Gmail action:', action);
    }
  }

  function handleOutlookAction(action, params) {
    // Outlook-specific actions
    console.log('AI Bot Extension: Outlook action:', action);
  }

  function handleTelegramAction(action, params) {
    // Telegram-specific actions
    console.log('AI Bot Extension: Telegram action:', action);
  }

  function handleWhatsAppAction(action, params) {
    // WhatsApp-specific actions
    console.log('AI Bot Extension: WhatsApp action:', action);
  }

  function handleGoogleDocsAction(action, params) {
    switch (action) {
      case 'get-document-content':
        const content = document.querySelector('.kix-canvas-timeline-content')?.textContent;
        sendToBackground('document-content', { content });
        break;
      case 'insert-text':
        // Insert text into document
        console.log('AI Bot Extension: Inserting text:', params.text);
        break;
      default:
        console.log('AI Bot Extension: Unknown Google Docs action:', action);
    }
  }

  function handleGoogleSlidesAction(action, params) {
    // Google Slides-specific actions
    console.log('AI Bot Extension: Google Slides action:', action);
  }

  function handleFormAction(action, params) {
    switch (action) {
      case 'fill-form':
        fillForm(params.formData);
        break;
      case 'submit-form':
        submitForm(params.formId);
        break;
      case 'analyze-form':
        analyzeForm(params.formId);
        break;
      default:
        console.log('AI Bot Extension: Unknown form action:', action);
    }
  }

  function handleVideoAction(action, params) {
    switch (action) {
      case 'capture-screen':
        captureScreen();
        break;
      case 'record-video':
        recordVideo();
        break;
      default:
        console.log('AI Bot Extension: Unknown video action:', action);
    }
  }

  function fillForm(formData) {
    for (const [fieldName, value] of Object.entries(formData)) {
      const field = document.querySelector(`[name="${fieldName}"], #${fieldName}`);
      if (field) {
        field.value = value;
        field.dispatchEvent(new Event('input', { bubbles: true }));
        field.dispatchEvent(new Event('change', { bubbles: true }));
      }
    }
  }

  function submitForm(formId) {
    const form = formId ? document.querySelector(`#${formId}`) : document.querySelector('form');
    if (form) {
      form.submit();
    }
  }

  function analyzeForm(formId) {
    const form = formId ? document.querySelector(`#${formId}`) : document.querySelector('form');
    if (form) {
      const analysis = {
        id: form.id,
        action: form.action,
        method: form.method,
        fields: Array.from(form.elements).map(el => ({
          name: el.name,
          type: el.type,
          required: el.required,
          placeholder: el.placeholder
        }))
      };
      
      sendToBackground('form-analysis', analysis);
    }
  }

  async function captureScreen() {
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: true,
        audio: false
      });
      
      // Handle screen capture
      sendToBackground('screen-capture-started', { streamId: stream.id });
      
    } catch (error) {
      console.error('AI Bot Extension: Screen capture failed:', error);
      sendToBackground('screen-capture-error', { error: error.message });
    }
  }

  async function recordVideo() {
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: true,
        audio: true
      });
      
      // Handle video recording
      sendToBackground('video-recording-started', { streamId: stream.id });
      
    } catch (error) {
      console.error('AI Bot Extension: Video recording failed:', error);
      sendToBackground('video-recording-error', { error: error.message });
    }
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
        clearTimeout(pageContext.updateTimeout);
        pageContext.updateTimeout = setTimeout(() => {
          analyzePageContext();
          sendContextUpdate();
        }, 1000);
      }
    });
    
    observer.observe(document.body, {
      childList: true,
      subtree: true
    });
    
    // Observe URL changes for SPAs
    let lastUrl = window.location.href;
    const urlObserver = new MutationObserver(() => {
      if (window.location.href !== lastUrl) {
        lastUrl = window.location.href;
        analyzePageContext();
        sendContextUpdate();
      }
    });
    
    urlObserver.observe(document, { subtree: true, childList: true });
  }

  function injectUIElements(customData = null) {
    // Bot UI is now rendered by the React-based content script (content-script.js)
    // This function is kept for backwards compatibility with background messages.
    console.debug('AI Bot Extension: injectUIElements called (UI handled by React content script).');
  }

  function positionSuyaBot() {
    const bot = document.getElementById('suya-bot');
    if (!bot) return;
    
    const padding = 20;
    const botSize = 60;
    const screenWidth = window.innerWidth;
    const screenHeight = window.innerHeight;
    
    // Intelligent positioning to avoid clutter
    const existingElements = document.querySelectorAll('[data-suya-bot]');
    const occupiedCorners = new Set();
    
    existingElements.forEach(el => {
      const rect = el.getBoundingClientRect();
      if (rect.left < screenWidth / 2 && rect.top < screenHeight / 2) occupiedCorners.add('top-left');
      if (rect.left >= screenWidth / 2 && rect.top < screenHeight / 2) occupiedCorners.add('top-right');
      if (rect.left < screenWidth / 2 && rect.top >= screenHeight / 2) occupiedCorners.add('bottom-left');
      if (rect.left >= screenWidth / 2 && rect.top >= screenHeight / 2) occupiedCorners.add('bottom-right');
    });
    
    let x, y;
    if (!occupiedCorners.has('top-right')) {
      x = screenWidth - botSize - padding;
      y = padding;
    } else if (!occupiedCorners.has('top-left')) {
      x = padding;
      y = padding;
    } else if (!occupiedCorners.has('bottom-right')) {
      x = screenWidth - botSize - padding;
      y = screenHeight - botSize - padding;
    } else {
      x = padding;
      y = screenHeight - botSize - padding;
    }
    
    bot.style.left = x + 'px';
    bot.style.top = y + 'px';
    bot.setAttribute('data-suya-bot', 'true');
  }

  function toggleSuyaOverlay() {
    const overlay = document.getElementById('suya-overlay');
    const bot = document.getElementById('suya-bot');
    
    if (overlay.classList.contains('active')) {
      overlay.classList.remove('active');
      bot.classList.remove('active');
      removeSuyaBubble();
    } else {
      overlay.classList.add('active');
      bot.classList.add('active');
      showSuyaBubble();
    }
  }

  function showSuyaBubble() {
    removeSuyaBubble();
    
    const bubble = document.createElement('div');
    bubble.id = 'suya-bubble';
    bubble.className = 'suya-bubble';
    bubble.innerHTML = `
      <div>${sanitizeHTML('Hello! I\'m Suya, your neutral AI assistant. I can help you analyze this page, extract information, and assist with various tasks.')}</div>
      <div style="margin-top: 12px; display: flex; gap: 8px; flex-wrap: wrap;">
        <button class="suya-action-btn" data-action="analyze-page">${sanitizeHTML('Analyze Page')}</button>
        <button class="suya-action-btn" data-action="extract-text">${sanitizeHTML('Extract Text')}</button>
        <button class="suya-action-btn" data-action="highlight-elements">${sanitizeHTML('Highlight Elements')}</button>
      </div>
    `;
    
    // Add button styles
    const buttonStyle = document.createElement('style');
    buttonStyle.textContent = `
      .suya-action-btn {
        padding: 6px 12px;
        border: 1px solid rgba(102, 126, 234, 0.3);
        border-radius: 6px;
        background: rgba(102, 126, 234, 0.1);
        color: #667eea;
        cursor: pointer;
        font-size: 12px;
        transition: all 0.2s ease;
      }
      .suya-action-btn:hover {
        background: rgba(102, 126, 234, 0.2);
        border-color: rgba(102, 126, 234, 0.5);
      }
    `;
    document.head.appendChild(buttonStyle);
    
    document.getElementById('suya-overlay').appendChild(bubble);
    
    // Add button event listeners
    bubble.querySelectorAll('.suya-action-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const action = btn.getAttribute('data-action');
        handleSuyaAction(action);
      });
    });
  }

  function removeSuyaBubble() {
    const bubble = document.getElementById('suya-bubble');
    if (bubble) bubble.remove();
  }

  function handleSuyaAction(action) {
    switch (action) {
      case 'analyze-page':
        sendToBackground('analyze-page', pageContext);
        showSuyaMessage('Analyzing page...', 'thinking');
        break;
      case 'extract-text':
        sendToBackground('extract-text', { text: pageContext.text });
        showSuyaMessage('Extracting text content...', 'thinking');
        break;
      case 'highlight-elements':
        highlightPageElements();
        showSuyaMessage('Highlighting interactive elements...', 'neutral');
        break;
    }
  }

  function showSuyaMessage(message, expression = 'neutral') {
    const bot = document.getElementById('suya-bot');
    if (!bot) return;
    
    // Update bot expression
    bot.classList.add('busy');
    
    // Show temporary message bubble
    removeSuyaBubble();
    
    const bubble = document.createElement('div');
    bubble.id = 'suya-bubble';
    bubble.className = 'suya-bubble';
    bubble.innerHTML = `<div>${sanitizeHTML(message)}</div>`;
    
    document.getElementById('suya-overlay').appendChild(bubble);
    
    // Auto-hide after 3 seconds
    setTimeout(() => {
      removeSuyaBubble();
      bot.classList.remove('busy');
    }, 3000);
  }

  function highlightPageElements() {
    const elements = document.querySelectorAll('button, a, input, textarea, select');
    elements.forEach((el, index) => {
      setTimeout(() => {
        el.style.transition = 'all 0.3s ease';
        el.style.outline = '2px solid rgba(102, 126, 234, 0.6)';
        el.style.outlineOffset = '2px';
        el.style.boxShadow = '0 0 10px rgba(102, 126, 234, 0.3)';
        
        setTimeout(() => {
          el.style.outline = '';
          el.style.outlineOffset = '';
          el.style.boxShadow = '';
        }, 2000);
      }, index * 100);
    });
  }

  function removeUIElements(elements = null) {
    // Remove Suya bot and related elements
    const suyaBot = document.getElementById('suya-bot');
    if (suyaBot) suyaBot.remove();
    
    const suyaContainer = document.getElementById('suya-bot-container');
    if (suyaContainer) suyaContainer.remove();
    
    const suyaOverlay = document.getElementById('suya-overlay');
    if (suyaOverlay) suyaOverlay.remove();
    
    const suyaBubble = document.getElementById('suya-bubble');
    if (suyaBubble) suyaBubble.remove();
    
    // Remove any legacy AI bot elements
    const fab = document.getElementById('aibot-fab');
    if (fab) fab.remove();
    
    const panels = document.querySelectorAll('[id^="aibot-"]');
    panels.forEach(panel => panel.remove());
  }

  function toggleAssistantPanel() {
    const existingPanel = document.getElementById('aibot-panel');
    
    if (existingPanel) {
      existingPanel.remove();
    } else {
      createAssistantPanel();
    }
  }

  // HTML Sanitization function to prevent XSS
  function sanitizeHTML(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  function sanitizeAttribute(str) {
    return str.replace(/["&'<>]/g, function(match) {
      return {
        '"': '&quot;',
        '&': '&amp;',
        "'": '&#39;',
        '<': '&lt;',
        '>': '&gt;'
      }[match];
    });
  }

  function createAssistantPanel() {
    const panel = document.createElement('div');
    panel.id = 'aibot-panel';
    
    // Use safe HTML construction with sanitized content
    panel.innerHTML = `
      <div class="aibot-panel-header">
        <h3>${sanitizeHTML('AI Bot Assistant')}</h3>
        <button id="aibot-panel-close">&times;</button>
      </div>
      <div class="aibot-panel-content">
        <div class="aibot-panel-section">
          <h4>${sanitizeHTML('Page Context')}</h4>
          <p><strong>${sanitizeHTML('Type:')}</strong> ${sanitizeHTML(pageContext.type)}</p>
          <p><strong>${sanitizeHTML('URL:')}</strong> ${sanitizeHTML(pageContext.url)}</p>
        </div>
        <div class="aibot-panel-section">
          <h4>${sanitizeHTML('Available Actions')}</h4>
          <button id="aibot-analyze-page">${sanitizeHTML('Analyze Page')}</button>
          <button id="aibot-extract-text">${sanitizeHTML('Extract Text')}</button>
          <button id="aibot-fill-forms">${sanitizeHTML('Fill Forms')}</button>
        </div>
      </div>
    `;
    
    panel.style.cssText = `
      position: fixed;
      bottom: 80px;
      right: 20px;
      width: 320px;
      max-height: 400px;
      background: white;
      border-radius: 12px;
      box-shadow: 0 8px 32px rgba(0,0,0,0.1);
      z-index: 10001;
      font-family: system-ui, -apple-system, sans-serif;
      overflow: hidden;
    `;
    
    const style = document.createElement('style');
    style.textContent = `
      #aibot-panel .aibot-panel-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 16px;
        border-bottom: 1px solid #e5e7eb;
        background: #f9fafb;
      }
      
      #aibot-panel .aibot-panel-header h3 {
        margin: 0;
        font-size: 16px;
        font-weight: 600;
      }
      
      #aibot-panel #aibot-panel-close {
        background: none;
        border: none;
        font-size: 20px;
        cursor: pointer;
        color: #6b7280;
      }
      
      #aibot-panel .aibot-panel-content {
        padding: 16px;
        max-height: 320px;
        overflow-y: auto;
      }
      
      #aibot-panel .aibot-panel-section {
        margin-bottom: 16px;
      }
      
      #aibot-panel .aibot-panel-section h4 {
        margin: 0 0 8px 0;
        font-size: 14px;
        font-weight: 600;
        color: #374151;
      }
      
      #aibot-panel .aibot-panel-section p {
        margin: 4px 0;
        font-size: 12px;
        color: #6b7280;
      }
      
      #aibot-panel button {
        display: block;
        width: 100%;
        padding: 8px 12px;
        margin: 4px 0;
        border: 1px solid #d1d5db;
        border-radius: 6px;
        background: white;
        color: #374151;
        font-size: 12px;
        cursor: pointer;
        transition: all 0.2s ease;
      }
      
      #aibot-panel button:hover {
        background: #f3f4f6;
        border-color: #9ca3af;
      }
    `;
    
    panel.appendChild(style);
    document.body.appendChild(panel);
    
    // Add event listeners
    document.getElementById('aibot-panel-close').addEventListener('click', () => {
      panel.remove();
    });
    
    document.getElementById('aibot-analyze-page').addEventListener('click', () => {
      sendToBackground('analyze-page', pageContext);
    });
    
    document.getElementById('aibot-extract-text').addEventListener('click', () => {
      sendToBackground('extract-text', { text: pageContext.text });
    });
    
    document.getElementById('aibot-fill-forms').addEventListener('click', () => {
      analyzeForm();
    });
  }

  function sendContextUpdate() {
    if (extensionPort) {
      extensionPort.postMessage({
        type: 'context-updated',
        data: pageContext
      });
    }
  }

  function sendSelectionToBackground() {
    const selection = window.getSelection();
    const selectedText = selection?.toString() || '';
    
    if (extensionPort) {
      extensionPort.postMessage({
        type: 'selection-data',
        data: {
          text: selectedText,
          range: selection?.rangeCount ? {
            startOffset: selection.getRangeAt(0).startOffset,
            endOffset: selection.getRangeAt(0).endOffset
          } : null
        }
      });
    }
  }

  function sendMediaElementToBackground(data = null) {
    const media = pageContext.media;
    
    if (extensionPort) {
      extensionPort.postMessage({
        type: 'media-elements',
        data: media
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

  function handleCommand(command, data) {
    console.log('AI Bot Extension: Handling command:', command, data);
    
    switch (command) {
      case 'show-task-list':
        showTaskList();
        break;
      case 'hide-ui':
        removeUIElements();
        break;
      case 'show-ui':
        injectUIElements();
        break;
      default:
        console.log('AI Bot Extension: Unknown command:', command);
    }
  }

  function showTaskList() {
    // Create task list UI with sanitized content
    const taskList = document.createElement('div');
    taskList.id = 'aibot-task-list';
    taskList.innerHTML = `
      <div class="aibot-task-list-header">
        <h3>${sanitizeHTML('Background Tasks')}</h3>
        <button id="aibot-task-list-close">&times;</button>
      </div>
      <div class="aibot-task-list-content">
        <div class="aibot-loading">${sanitizeHTML('Loading tasks...')}</div>
      </div>
    `;
    
    taskList.style.cssText = `
      position: fixed;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      width: 400px;
      max-height: 500px;
      background: white;
      border-radius: 12px;
      box-shadow: 0 8px 32px rgba(0,0,0,0.1);
      z-index: 10002;
      font-family: system-ui, -apple-system, sans-serif;
    `;
    
    document.body.appendChild(taskList);
    
    // Request tasks from background
    sendToBackground('get-tasks', {});
    
    // Add close handler
    document.getElementById('aibot-task-list-close').addEventListener('click', () => {
      taskList.remove();
    });
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

})();
