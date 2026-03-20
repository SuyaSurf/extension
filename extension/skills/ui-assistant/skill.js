/**
 * UI Assistant Skill
 * Provides contextual help and interface assistance
 */
class UIAssistantSkill {
  constructor(config = {}) {
    this.name = 'ui-assistant';
    this.version = '1.0.0';
    this.isActive = false;
    this.config = {
      contextualHelp: true,
      voiceCommands: true,
      personalizedSuggestions: true,
      autoDetection: true,
      ...config
    };
    this.contextHistory = [];
    this.suggestions = [];
  }

  async initialize() {
    console.log('Initializing UI Assistant Skill...');
    
    try {
      // Set up context detection
      if (this.config.autoDetection) {
        this.setupContextDetection();
      }
      
      // Initialize voice commands if enabled
      if (this.config.voiceCommands) {
        this.setupVoiceCommands();
      }
      
      console.log('UI Assistant Skill initialized successfully');
    } catch (error) {
      console.error('Failed to initialize UI Assistant Skill:', error);
      throw error;
    }
  }

  async activate() {
    this.isActive = true;
    console.log('UI Assistant Skill activated');
    
    // Start monitoring page context
    if (this.config.contextualHelp) {
      this.startContextMonitoring();
    }
  }

  async deactivate() {
    this.isActive = false;
    console.log('UI Assistant Skill deactivated');
    
    // Stop monitoring
    this.stopContextMonitoring();
  }

  async handleAction(action, data, sender = null) {
    switch (action) {
      case 'getStatus':
        return await this.getStatus();
      case 'quickAction':
        return await this.executeQuickAction(data.action, data.params);
      case 'showHelp':
        return await this.showHelp(data.context);
      case 'getContext':
        return await this.getCurrentContext();
      case 'getSuggestions':
        return await this.getSuggestions(data.context);
      case 'executeCommand':
        return await this.executeVoiceCommand(data.command);
      case 'analyzePage':
        return await this.analyzeCurrentPage();
      case 'provideHint':
        return await this.provideContextualHint(data.element);
      default:
        throw new Error(`Unknown action: ${action}`);
    }
  }

  async getStatus() {
    return {
      active: this.isActive,
      version: this.version,
      features: this.config,
      contextHistory: this.contextHistory.slice(-5),
      suggestionCount: this.suggestions.length
    };
  }

  async executeQuickAction(action, params = {}) {
    console.log(`Executing quick action: ${action}`);
    
    try {
      switch (action) {
        case 'scrollToTop':
          if (typeof window !== 'undefined') window.scrollTo({ top: 0, behavior: 'smooth' });
          break;
        case 'scrollToBottom':
          if (typeof window !== 'undefined') window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' });
          break;
        case 'focusFirstInput':
          const firstInput = document.querySelector('input, textarea, select');
          if (firstInput) firstInput.focus();
          break;
        case 'toggleDarkMode':
          // Implement dark mode toggle
          document.body.classList.toggle('dark-mode');
          break;
        case 'increaseFontSize':
          document.body.style.fontSize = 'larger';
          break;
        case 'decreaseFontSize':
          document.body.style.fontSize = 'smaller';
          break;
        default:
          throw new Error(`Unknown quick action: ${action}`);
      }
      
      return { success: true, action, params };
    } catch (error) {
      return { success: false, error: error.message, action };
    }
  }

  async showHelp(context = null) {
    const helpContent = {
      message: 'UI Assistant - Contextual help and interface automation',
      commands: [
        'getStatus - Get current skill status',
        'quickAction - Execute quick UI actions',
        'showHelp - Display this help message',
        'getContext - Get current page context',
        'getSuggestions - Get contextual suggestions',
        'analyzePage - Analyze current page structure',
        'provideHint - Get help for specific element'
      ],
      quickActions: [
        'scrollToTop - Scroll to top of page',
        'scrollToBottom - Scroll to bottom of page',
        'focusFirstInput - Focus first input field',
        'toggleDarkMode - Toggle dark mode',
        'increaseFontSize - Increase font size',
        'decreaseFontSize - Decrease font size'
      ]
    };

    if (context) {
      helpContent.contextualHelp = await this.generateContextualHelp(context);
    }

    return helpContent;
  }

  async getCurrentContext() {
    const context = {
      url: typeof window !== 'undefined' ? window.location.href : '',
      title: typeof document !== 'undefined' ? document.title : '',
      type: this.detectPageType(),
      elements: this.analyzePageElements(),
      timestamp: Date.now()
    };

    this.contextHistory.push(context);
    
    // Keep only last 10 contexts
    if (this.contextHistory.length > 10) {
      this.contextHistory = this.contextHistory.slice(-10);
    }

    return context;
  }

  async getSuggestions(context = null) {
    const currentContext = context || await this.getCurrentContext();
    const suggestions = [];

    // Page-specific suggestions
    switch (currentContext.type) {
      case 'form':
        suggestions.push({
          type: 'form_help',
          message: 'I can help you fill out this form automatically',
          action: 'fillForm'
        });
        break;
      case 'article':
        suggestions.push({
          type: 'reading_help',
          message: 'Would you like me to summarize this article?',
          action: 'summarize'
        });
        break;
      case 'search':
        suggestions.push({
          type: 'search_help',
          message: 'I can help refine your search query',
          action: 'refineSearch'
        });
        break;
    }

    // General suggestions based on page analysis
    if (currentContext.elements.inputs.length > 0) {
      suggestions.push({
        type: 'input_navigation',
        message: `Found ${currentContext.elements.inputs.length} input fields`,
        action: 'navigateInputs'
      });
    }

    if (currentContext.elements.buttons.length > 0) {
      suggestions.push({
        type: 'button_help',
        message: `Found ${currentContext.elements.buttons.length} interactive buttons`,
        action: 'explainButtons'
      });
    }

    this.suggestions = suggestions;
    return suggestions;
  }

  async executeVoiceCommand(command) {
    if (!this.config.voiceCommands) {
      throw new Error('Voice commands are disabled');
    }

    console.log(`Executing voice command: ${command}`);
    
    // Parse and execute voice command
    const action = this.parseVoiceCommand(command);
    return await this.executeQuickAction(action.action, action.params);
  }

  async analyzeCurrentPage() {
    const analysis = {
      url: typeof window !== 'undefined' ? window.location.href : '',
      title: typeof document !== 'undefined' ? document.title : '',
      type: this.detectPageType(),
      elements: this.analyzePageElements(),
      accessibility: this.analyzeAccessibility(),
      performance: this.analyzePerformance(),
      structure: this.analyzePageStructure()
    };

    return analysis;
  }

  async provideContextualHint(element) {
    const hints = {
      'input': 'This is an input field. Click to focus and type your input.',
      'button': 'This is a button. Click to perform an action.',
      'select': 'This is a dropdown menu. Click to see options.',
      'textarea': 'This is a text area for longer text input.',
      'checkbox': 'This is a checkbox. Click to toggle selection.',
      'radio': 'This is a radio button. Click to select one option.',
      'link': 'This is a link. Click to navigate to another page.'
    };

    const tagName = element.tagName.toLowerCase();
    const hint = hints[tagName] || 'This is an interactive element.';

    return {
      element: tagName,
      hint,
      additional: this.generateElementSpecificHint(element)
    };
  }

  // Helper methods
  detectPageType() {
    const url = typeof window !== 'undefined' ? window.location.href : '';
    const title = typeof document !== 'undefined' ? document.title.toLowerCase() : '';
    
    if (url.includes('login') || title.includes('login') || title.includes('sign in')) {
      return 'login';
    }
    if (url.includes('search') || title.includes('search')) {
      return 'search';
    }
    if (document.querySelector('form')) {
      return 'form';
    }
    if (document.querySelector('article, main, .content')) {
      return 'article';
    }
    
    return 'general';
  }

  analyzePageElements() {
    return {
      inputs: document.querySelectorAll('input, textarea, select').length,
      buttons: document.querySelectorAll('button, input[type="button"], input[type="submit"]').length,
      links: document.querySelectorAll('a').length,
      images: document.querySelectorAll('img').length,
      forms: document.querySelectorAll('form').length,
      tables: document.querySelectorAll('table').length
    };
  }

  analyzeAccessibility() {
    const issues = [];
    
    // Check for missing alt text
    document.querySelectorAll('img:not([alt])').forEach(img => {
      issues.push('Missing alt text on image');
    });
    
    // Check for missing labels
    document.querySelectorAll('input:not([aria-label]):not([aria-labelledby])').forEach(input => {
      const label = document.querySelector(`label[for="${input.id}"]`);
      if (!label) {
        issues.push('Input missing label');
      }
    });
    
    return {
      issues,
      score: Math.max(0, 100 - issues.length * 10)
    };
  }

  analyzePerformance() {
    if (!performance.timing) {
      return { loadTime: 0, score: 100 };
    }
    
    const loadTime = performance.timing.loadEventEnd - performance.timing.navigationStart;
    const score = Math.max(0, 100 - Math.floor(loadTime / 100));
    
    return { loadTime, score };
  }

  analyzePageStructure() {
    return {
      hasHeader: !!document.querySelector('header'),
      hasNav: !!document.querySelector('nav'),
      hasMain: !!document.querySelector('main'),
      hasFooter: !!document.querySelector('footer'),
      hasAside: !!document.querySelector('aside'),
      headingStructure: this.analyzeHeadingStructure()
    };
  }

  analyzeHeadingStructure() {
    const headings = document.querySelectorAll('h1, h2, h3, h4, h5, h6');
    const structure = [];
    
    headings.forEach(heading => {
      structure.push({
        level: parseInt(heading.tagName.charAt(1)),
        text: heading.textContent.trim()
      });
    });
    
    return structure;
  }

  setupContextDetection() {
    // Set up mutation observer for context changes
    this.observer = new MutationObserver((mutations) => {
      if (this.isActive && this.config.contextualHelp) {
        this.onContextChange(mutations);
      }
    });
    
    this.observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true
    });
  }

  setupVoiceCommands() {
    // Initialize voice command recognition
    if (typeof window !== 'undefined' && ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window)) {
      const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
      this.recognition = new SpeechRecognition();
      
      this.recognition.onresult = (event) => {
        const command = event.results[0][0].transcript;
        this.executeVoiceCommand(command);
      };
      
      this.recognition.onerror = (event) => {
        console.error('Voice recognition error:', event.error);
      };
    }
  }

  startContextMonitoring() {
    // Start monitoring for context changes
    this.monitoringInterval = setInterval(() => {
      if (this.isActive) {
        this.getCurrentContext();
      }
    }, 30000); // Every 30 seconds
  }

  stopContextMonitoring() {
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
    }
    if (this.observer) {
      this.observer.disconnect();
    }
  }

  onContextChange(mutations) {
    // Handle context changes and update suggestions
    console.log('Context changed, updating suggestions...');
    this.getSuggestions();
  }

  parseVoiceCommand(command) {
    // Simple voice command parsing
    const lowerCommand = command.toLowerCase();
    
    if (lowerCommand.includes('scroll up') || lowerCommand.includes('go up')) {
      return { action: 'scrollToTop' };
    }
    if (lowerCommand.includes('scroll down') || lowerCommand.includes('go down')) {
      return { action: 'scrollToBottom' };
    }
    if (lowerCommand.includes('focus') || lowerCommand.includes('input')) {
      return { action: 'focusFirstInput' };
    }
    if (lowerCommand.includes('dark mode') || lowerCommand.includes('dark')) {
      return { action: 'toggleDarkMode' };
    }
    
    return { action: 'unknown', params: { command } };
  }

  generateContextualHelp(context) {
    // Generate contextual help based on page type and elements
    const help = [];
    
    if (context.type === 'form') {
      help.push('This page contains a form. I can help you fill it out.');
    }
    if (context.elements.inputs > 5) {
      help.push('This form has many fields. Consider using tab navigation.');
    }
    
    return help;
  }

  generateElementSpecificHint(element) {
    // Generate specific hints for elements
    const hints = [];
    
    if (element.placeholder) {
      hints.push(`Placeholder: ${element.placeholder}`);
    }
    if (element.title) {
      hints.push(`Tooltip: ${element.title}`);
    }
    if (element.required) {
      hints.push('This field is required.');
    }
    
    return hints;
  }

  getVersion() { return this.version; }
  getName() { return this.name; }
  isActiveStatus() { return this.isActive; }
  getDependencies() { return []; }
}

export { UIAssistantSkill };
