/**
 * Mail Skills Skill
 * Integrates with Gmail, Outlook, and Venmail
 */
class MailSkillsSkill {
  constructor(config = {}) {
    this.name = 'mail-skills';
    this.version = '1.0.0';
    this.isActive = false;
    this.config = {
      providers: ['gmail', 'outlook', 'venmail'],
      autoDetect: true,
      smartCompose: true,
      ...config
    };
    this.currentProvider = null;
  }

  async initialize() {
    console.log('Initializing Mail Skills Skill...');
    this.detectMailProvider();
    console.log('Mail Skills Skill initialized');
  }

  async activate() {
    this.isActive = true;
    console.log('Mail Skills Skill activated');
  }

  async deactivate() {
    this.isActive = false;
    console.log('Mail Skills Skill deactivated');
  }

  async handleAction(action, data, sender = null) {
    switch (action) {
      case 'getStatus':
        return await this.getStatus();
      case 'composeEmail':
        return await this.composeEmail(data);
      case 'replyToEmail':
        return await this.replyToEmail(data);
      case 'searchEmails':
        return await this.searchEmails(data.query);
      case 'organizeInbox':
        return await this.organizeInbox();
      case 'getProvider':
        return await this.getCurrentProvider();
      default:
        throw new Error(`Unknown action: ${action}`);
    }
  }

  detectMailProvider() {
    const win = typeof window !== 'undefined' ? window : null;
    const url = win ? win.location.href : '';
    
    if (url.includes('mail.google.com')) {
      this.currentProvider = 'gmail';
    } else if (url.includes('outlook.live.com') || url.includes('outlook.office.com')) {
      this.currentProvider = 'outlook';
    } else if (url.includes('venmail')) {
      this.currentProvider = 'venmail';
    }
  }

  async composeEmail(data) {
    console.log('Composing email:', data);
    
    try {
      const provider = this.currentProvider;
      if (!provider) {
        throw new Error('No email provider detected');
      }
      
      switch (provider) {
        case 'gmail':
          return await this.composeGmailEmail(data);
        case 'outlook':
          return await this.composeOutlookEmail(data);
        case 'venmail':
          return await this.composeVenmailEmail(data);
        default:
          throw new Error(`Email composition not supported for ${provider}`);
      }
      
    } catch (error) {
      console.error('Failed to compose email:', error);
      return { 
        success: false, 
        error: error.message || 'Failed to compose email' 
      };
    }
  }

  async composeGmailEmail(data) {
    try {
      // Find Gmail compose button
      const composeBtn = document.querySelector('[data-tooltip*="Compose"]') ||
                        document.querySelector('div[gh="cm"]') ||
                        document.querySelector('.T-I.J-J5-Ji.T-I-KE.L3') ||
                        document.querySelector('[role="button"][data-tooltip*="Compose"]');
      
      if (!composeBtn) {
        throw new Error('Gmail compose button not found');
      }
      
      // Click compose button
      composeBtn.click();
      
      // Wait for compose window to appear
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      // Find compose window
      const composeWindow = document.querySelector('.nH.if') ||
                           document.querySelector('[role="dialog"]') ||
                           document.querySelector('.AD') ||
                           document.querySelector('div[role="dialog"]');
      
      if (!composeWindow) {
        throw new Error('Gmail compose window not found');
      }
      
      // Fill recipients
      if (data.to) {
        const toField = composeWindow.querySelector('input[name="to"]') ||
                       composeWindow.querySelector('textarea[aria-label*="To"]') ||
                       composeWindow.querySelector('input[aria-label*="To"]') ||
                       composeWindow.querySelector('textarea[placeholder*="To"]');
        
        if (toField) {
          toField.focus();
          toField.value = data.to;
          toField.dispatchEvent(new Event('input', { bubbles: true }));
          toField.dispatchEvent(new Event('change', { bubbles: true }));
        }
      }
      
      // Fill subject
      if (data.subject) {
        const subjectField = composeWindow.querySelector('input[name="subjectbox"]') ||
                           composeWindow.querySelector('input[placeholder*="Subject"]') ||
                           composeWindow.querySelector('input[aria-label*="Subject"]');
        
        if (subjectField) {
          subjectField.focus();
          subjectField.value = data.subject;
          subjectField.dispatchEvent(new Event('input', { bubbles: true }));
          subjectField.dispatchEvent(new Event('change', { bubbles: true }));
        }
      }
      
      // Fill body
      if (data.body) {
        const bodyField = composeWindow.querySelector('div[contenteditable="true"]') ||
                        composeWindow.querySelector('[g_editable="true"]') ||
                        composeWindow.querySelector('div[role="textbox"]') ||
                        composeWindow.querySelector('.Am.Al.editable');
        
        if (bodyField) {
          bodyField.focus();
          bodyField.textContent = data.body;
          bodyField.dispatchEvent(new Event('input', { bubbles: true }));
          bodyField.dispatchEvent(new Event('change', { bubbles: true }));
        }
      }
      
      // Send or save as draft
      if (data.send === true) {
        await new Promise(resolve => setTimeout(resolve, 500));
        const sendBtn = composeWindow.querySelector('[data-tooltip*="Send"]') ||
                       composeWindow.querySelector('div[role="button"][data-tooltip*="Send"]') ||
                       composeWindow.querySelector('.T-I.J-J5-Ji.aoO.T-I-KE') ||
                       composeWindow.querySelector('button[aria-label*="Send"]');
        
        if (sendBtn) {
          sendBtn.click();
          return { success: true, message: 'Gmail email sent' };
        } else {
          return { success: true, message: 'Gmail email composed (send button not found)' };
        }
      } else {
        return { success: true, message: 'Gmail email composed as draft' };
      }
      
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  async composeOutlookEmail(data) {
    try {
      // Find Outlook new mail button
      const newMailBtn = document.querySelector('[aria-label*="New mail"]') ||
                        document.querySelector('button[aria-label*="New email"]') ||
                        document.querySelector('[data-icon-name="Mail"]') ||
                        document.querySelector('button[title*="New mail"]');
      
      if (!newMailBtn) {
        throw new Error('Outlook new mail button not found');
      }
      
      newMailBtn.click();
      
      // Wait for compose window
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      const composeWindow = document.querySelector('[role="dialog"]') ||
                           document.querySelector('.allowTextSelection') ||
                           document.querySelector('div[role="dialog"]');
      
      if (!composeWindow) {
        throw new Error('Outlook compose window not found');
      }
      
      // Fill recipients
      if (data.to) {
        const toField = composeWindow.querySelector('input[aria-label*="To"]') ||
                       composeWindow.querySelector('div[role="combobox"] input') ||
                       composeWindow.querySelector('input[placeholder*="To"]');
        
        if (toField) {
          toField.value = data.to;
          toField.dispatchEvent(new Event('input', { bubbles: true }));
        }
      }
      
      // Fill subject
      if (data.subject) {
        const subjectField = composeWindow.querySelector('input[aria-label*="Subject"]') ||
                           composeWindow.querySelector('input[placeholder*="Subject"]');
        
        if (subjectField) {
          subjectField.value = data.subject;
          subjectField.dispatchEvent(new Event('input', { bubbles: true }));
        }
      }
      
      // Fill body
      if (data.body) {
        const bodyField = composeWindow.querySelector('div[contenteditable="true"]') ||
                        composeWindow.querySelector('div[role="textbox"]') ||
                        composeWindow.querySelector('[contenteditable="true"]');
        
        if (bodyField) {
          bodyField.textContent = data.body;
          bodyField.dispatchEvent(new Event('input', { bubbles: true }));
        }
      }
      
      if (data.send === true) {
        await new Promise(resolve => setTimeout(resolve, 500));
        const sendBtn = composeWindow.querySelector('button[aria-label*="Send"]') ||
                       composeWindow.querySelector('[data-icon-name="Send"]') ||
                       composeWindow.querySelector('button[title*="Send"]');
        
        if (sendBtn) {
          sendBtn.click();
          return { success: true, message: 'Outlook email sent' };
        }
      }
      
      return { success: true, message: 'Outlook email composed' };
      
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  async composeVenmailEmail(data) {
    try {
      // Load Venmail composer if not already loaded
      if (!window.VenmailComposer) {
        const script = document.createElement('script');
        script.src = chrome.runtime.getURL('skills/mail-skills/venmail-composer.js');
        document.head.appendChild(script);
        
        // Wait for script to load
        await new Promise(resolve => {
          script.onload = resolve;
        });
      }
      
      const composer = new window.VenmailComposer();
      
      if (!composer.isVenmailPage()) {
        return { 
          success: false, 
          error: 'Please navigate to Venmail (m.venmail.io) before composing emails' 
        };
      }
      
      return await composer.composeEmail(data);
    } catch (error) {
      console.error('Failed to compose Venmail email:', error);
      return { 
        success: false, 
        error: error.message || 'Failed to compose Venmail email' 
      };
    }
  }

  async composeGmailEmail(data) {
    try {
      // Load Gmail composer if not already loaded
      if (!window.GmailComposer) {
        const script = document.createElement('script');
        script.src = chrome.runtime.getURL('skills/mail-skills/gmail-composer.js');
        document.head.appendChild(script);
        
        // Wait for script to load
        await new Promise(resolve => {
          script.onload = resolve;
        });
      }
      
      const composer = new window.GmailComposer();
      
      if (!composer.isGmailPage()) {
        return { 
          success: false, 
          error: 'Please navigate to Gmail (mail.google.com) before composing emails' 
        };
      }
      
      // Wait for Gmail to fully load
      await composer.waitForGmailLoad();
      
      return await composer.composeEmail(data);
    } catch (error) {
      console.error('Failed to compose Gmail email:', error);
      return { 
        success: false, 
        error: error.message || 'Failed to compose Gmail email' 
      };
    }
  }

  async replyToEmail(data) {
    console.log('Replying to email:', data);
    return { success: true, message: 'Reply initiated' };
  }

  async searchEmails(query) {
    console.log('Searching emails:', query);
    return { results: [], query };
  }

  async summarizeThread(data) {
    console.log('Summarizing email thread:', data);
    
    try {
      // Extract current email content from DOM
      const emailContent = this.extractCurrentEmailContent();
      
      if (!emailContent) {
        throw new Error('No email content found for summarization');
      }
      
      const summary = this.generateEmailSummary(emailContent);
      
      return { 
        success: true, 
        summary: summary,
        originalLength: emailContent.length,
        summaryLength: summary.length
      };
      
    } catch (error) {
      console.error('Failed to summarize email:', error);
      return { 
        success: false, 
        error: error.message || 'Failed to summarize email' 
      };
    }
  }

  extractCurrentEmailContent() {
    // Try different selectors for email content
    const contentSelectors = [
      '.a3s', // Gmail content
      '[role="main"] div', // Gmail alternative
      '.allowTextSelection', // Outlook
      '[role="article"]', // Generic email content
      'div[role="main"]', // Generic main content
      '.message-content', // Generic message content
      'article' // HTML5 article tag
    ];
    
    for (const selector of contentSelectors) {
      const element = document.querySelector(selector);
      if (element && element.textContent.trim().length > 50) {
        return element.textContent.trim();
      }
    }
    
    return null;
  }

  generateEmailSummary(content) {
    // Simple rule-based summarization
    const sentences = content.split(/[.!?]+/).filter(s => s.trim().length > 10);
    
    if (sentences.length <= 3) {
      return content; // Too short to summarize
    }
    
    // Extract key information
    const summary = {
      mainPoints: [],
      actionItems: [],
      people: [],
      topics: []
    };
    
    // Simple keyword extraction
    const actionWords = ['will', 'should', 'need to', 'must', 'please', 'request', 'ask'];
    const peoplePattern = /\b[A-Z][a-z]+ [A-Z][a-z]+\b/g;
    
    sentences.forEach(sentence => {
      const lowerSentence = sentence.toLowerCase();
      
      // Find action items
      if (actionWords.some(word => lowerSentence.includes(word))) {
        summary.actionItems.push(sentence.trim());
      }
      
      // Find people names
      const people = sentence.match(peoplePattern);
      if (people) {
        summary.people.push(...people);
      }
      
      // Extract key topics (simple approach)
      if (sentence.length > 20 && sentence.length < 200) {
        summary.mainPoints.push(sentence.trim());
      }
    });
    
    // Generate formatted summary
    let summaryText = '';
    
    if (summary.mainPoints.length > 0) {
      summaryText += 'Key Points:\n' + summary.mainPoints.slice(0, 3).join('\n• ') + '\n\n';
    }
    
    if (summary.actionItems.length > 0) {
      summaryText += 'Action Items:\n' + summary.actionItems.map(item => '• ' + item).join('\n') + '\n\n';
    }
    
    if (summary.people.length > 0) {
      const uniquePeople = [...new Set(summary.people)];
      summaryText += 'People Mentioned: ' + uniquePeople.join(', ') + '\n\n';
    }
    
    // If no structured summary, return first few sentences
    if (!summaryText) {
      summaryText = sentences.slice(0, 2).join('. ') + '.';
    }
    
    return summaryText.trim();
  }

  async organizeInbox() {
    console.log('Organizing inbox...');
    return { success: true, message: 'Inbox organization started' };
  }

  async getStatus() {
    return {
      active: this.isActive,
      version: this.version,
      provider: this.currentProvider,
      features: this.config
    };
  }

  async getCurrentProvider() {
    return { provider: this.currentProvider };
  }

  getVersion() { return this.version; }
  getName() { return this.name; }
  isActiveStatus() { return this.isActive; }
  getDependencies() { return []; }

  getContextMenuItems() {
    return [
      {
        id: 'mail-compose',
        title: 'Suya: Compose Email',
        contexts: ['page'],
        documentUrlPatterns: [
          '*://mail.google.com/*',
          '*://outlook.live.com/*',
          '*://outlook.office.com/*'
        ]
      },
      {
        id: 'mail-summarize',
        title: 'Suya: Summarize Email Thread',
        contexts: ['page', 'selection'],
        documentUrlPatterns: [
          '*://mail.google.com/*',
          '*://outlook.live.com/*',
          '*://outlook.office.com/*'
        ]
      }
    ];
  }

  async handleContextMenu(info, tab) {
    switch (info.menuItemId) {
      case 'mail-compose':
        await this.handleComposeAction(tab);
        break;
      case 'mail-summarize':
        await this.handleSummarizeAction(tab);
        break;
    }
  }

  async handleComposeAction(tab) {
    try {
      const response = await chrome.tabs.sendMessage(tab.id, {
        type: 'skill-action',
        skill: 'mail-skills',
        action: 'composeEmail',
        data: { send: false }
      });
      
      return response;
    } catch (error) {
      console.error('Failed to compose email from context menu:', error);
      return { success: false, error: error.message };
    }
  }

  async handleSummarizeAction(tab) {
    try {
      const response = await chrome.tabs.sendMessage(tab.id, {
        type: 'skill-action',
        skill: 'mail-skills',
        action: 'summarizeThread',
        data: {}
      });
      
      return response;
    } catch (error) {
      console.error('Failed to summarize email from context menu:', error);
      return { success: false, error: error.message };
    }
  }
}

export { MailSkillsSkill };
