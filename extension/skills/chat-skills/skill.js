/**
 * Chat Skills Skill
 * Telegram Web and WhatsApp Web integration
 */
class ChatSkillsSkill {
  constructor(config = {}) {
    this.name = 'chat-skills';
    this.version = '1.0.0';
    this.isActive = false;
    this.config = {
      platforms: ['telegram', 'whatsapp'],
      autoDetect: true,
      smartReplies: true,
      ...config
    };
    this.currentPlatform = null;
  }

  async initialize() {
    console.log('Initializing Chat Skills Skill...');
    this.detectChatPlatform();
    console.log('Chat Skills Skill initialized');
  }

  async activate() {
    this.isActive = true;
    console.log('Chat Skills Skill activated');
  }

  async deactivate() {
    this.isActive = false;
    console.log('Chat Skills Skill deactivated');
  }

  async handleAction(action, data, sender = null) {
    switch (action) {
      case 'getStatus':
        return await this.getStatus();
      case 'sendMessage':
        return await this.sendMessage(data);
      case 'getSmartReply':
        return await this.getSmartReply(data.message);
      case 'searchChats':
        return await this.searchChats(data.query);
      case 'getPlatform':
        return await this.getCurrentPlatform();
      default:
        throw new Error(`Unknown action: ${action}`);
    }
  }

  detectChatPlatform() {
    const url = typeof window !== 'undefined' ? window.location.href : '';
    
    if (url.includes('web.telegram.org')) {
      this.currentPlatform = 'telegram';
    } else if (url.includes('web.whatsapp.com')) {
      this.currentPlatform = 'whatsapp';
    }
  }

  async sendMessage(data) {
    console.log('Sending message:', data);
    
    try {
      // Get the current platform adapter
      const adapter = window.PlatformAdapters?.getActiveAdapter?.();
      if (!adapter) {
        throw new Error('No active chat platform detected');
      }
      
      // Check if adapter has sendMessage method
      if (typeof adapter.sendMessage !== 'function') {
        throw new Error('Message sending not supported on this platform');
      }
      
      // Send the message using the platform-specific adapter
      const result = await adapter.sendMessage(data.message, data.chatId);
      
      return result;
      
    } catch (error) {
      console.error('Failed to send message:', error);
      return { 
        success: false, 
        error: error.message || 'Failed to send message' 
      };
    }
  }

  async getSmartReply(message) {
    console.log('Generating smart reply for:', message);
    
    try {
      // Simple rule-based smart replies
      const text = message.toLowerCase();
      let suggestions = [];
      
      // Thank you responses
      if (text.includes('thank') || text.includes('thanks')) {
        suggestions.push("You're welcome!", "No problem!", "Happy to help!");
      }
      
      // Agreement responses
      else if (text.includes('ok') || text.includes('okay') || text.includes('alright')) {
        suggestions.push("Sounds good!", "Great!", "Perfect!");
      }
      
      // Questions
      else if (text.includes('?')) {
        if (text.includes('how are') || text.includes('how do')) {
          suggestions.push("I'm doing well, thanks!", "Everything is good!", "Fine, thanks!");
        } else if (text.includes('what') || text.includes('which')) {
          suggestions.push("Let me check...", "I'll look into that.", "Good question!");
        } else if (text.includes('when') || text.includes('what time')) {
          suggestions.push("Let me confirm the timing.", "I'll get back to you on that.", "Soon!");
        } else {
          suggestions.push("Let me think about that.", "I'll get back to you.", "Good point!");
        }
      }
      
      // Greetings
      else if (text.includes('hello') || text.includes('hi') || text.includes('hey')) {
        suggestions.push("Hello!", "Hi there!", "Hey!");
      }
      
      // Goodbye
      else if (text.includes('bye') || text.includes('goodbye') || text.includes('see you')) {
        suggestions.push("Goodbye!", "See you later!", "Take care!");
      }
      
      // Acknowledgment
      else if (text.includes('got it') || text.includes('understood') || text.includes('received')) {
        suggestions.push("Great!", "Perfect!", "Thanks for letting me know!");
      }
      
      // Default responses
      else {
        suggestions.push("Got it!", "Sounds good!", "Thanks!", "I see.", "Understood.");
      }
      
      return { 
        suggestions: suggestions.slice(0, 4), // Limit to 4 suggestions
        confidence: 0.7
      };
      
    } catch (error) {
      console.error('Failed to generate smart reply:', error);
      return { 
        suggestions: ["Sounds good!", "Thanks!", "Got it!"],
        confidence: 0.5
      };
    }
  }

  async searchChats(query) {
    console.log('Searching chats:', query);
    return { results: [], query };
  }

  async summarizeChat(data) {
    console.log('Summarizing chat:', data);
    
    try {
      // Extract current chat messages from DOM
      const messages = this.extractCurrentChatMessages();
      
      if (!messages || messages.length === 0) {
        throw new Error('No chat messages found for summarization');
      }
      
      const summary = this.generateChatSummary(messages);
      
      return { 
        success: true, 
        summary: summary.summary,
        messageCount: messages.length,
        participants: summary.participants,
        topics: summary.topics
      };
      
    } catch (error) {
      console.error('Failed to summarize chat:', error);
      return { 
        success: false, 
        error: error.message || 'Failed to summarize chat' 
      };
    }
  }

  extractCurrentChatMessages() {
    // Try to get messages from the messaging skill if available
    if (window.MessagingSkill && window.MessageExtractor) {
      try {
        const result = window.MessageExtractor.scan();
        return result.items || [];
      } catch (error) {
        console.error('Failed to extract messages via MessagingSkill:', error);
      }
    }
    
    // Fallback: try direct DOM extraction
    const messageSelectors = [
      '[data-testid="msg-container"]', // WhatsApp
      '[data-testid*="message-"]', // WhatsApp alternative
      '.bubble:not(.bubble-service)', // Telegram
      '.message', // Generic message
      '[role="row"]', // Generic message row
      '.chat-message', // Generic chat message
      'div[class*="message"]' // Generic message div
    ];
    
    const messages = [];
    
    for (const selector of messageSelectors) {
      const elements = document.querySelectorAll(selector);
      elements.forEach(el => {
        const text = el.textContent?.trim();
        if (text && text.length > 5 && text.length < 1000) {
          messages.push({
            text: text,
            timestamp: Date.now(),
            direction: 'unknown' // Would need more complex logic to determine
          });
        }
      });
      
      if (messages.length > 0) break; // Stop if we found messages
    }
    
    return messages.slice(0, 50); // Limit to last 50 messages
  }

  generateChatSummary(messages) {
    if (messages.length === 0) {
      return { summary: 'No messages to summarize.', participants: [], topics: [] };
    }
    
    // Extract key information
    const summary = {
      participants: new Set(),
      topics: new Set(),
      actionItems: [],
      questions: [],
      keyPoints: []
    };
    
    const actionWords = ['will', 'should', 'need to', 'must', 'please', 'can you', 'could you'];
    const questionWords = ['what', 'when', 'where', 'who', 'why', 'how', '?'];
    
    messages.forEach(msg => {
      const text = msg.text.toLowerCase();
      
      // Extract topics (simple keyword extraction)
      const words = text.split(/\s+/);
      words.forEach(word => {
        if (word.length > 6 && !this.isStopWord(word)) {
          summary.topics.add(word);
        }
      });
      
      // Find action items
      if (actionWords.some(actionWord => text.includes(actionWord))) {
        summary.actionItems.push(msg.text.trim());
      }
      
      // Find questions
      if (questionWords.some(questionWord => text.includes(questionWord)) || text.includes('?')) {
        summary.questions.push(msg.text.trim());
      }
      
      // Extract key points (simple heuristic)
      if (msg.text.length > 20 && msg.text.length < 200 && !text.includes('http')) {
        summary.keyPoints.push(msg.text.trim());
      }
    });
    
    // Generate formatted summary
    let summaryText = `Chat Summary (${messages.length} messages):\n\n`;
    
    if (summary.keyPoints.length > 0) {
      summaryText += 'Key Points:\n' + summary.keyPoints.slice(0, 5).map(point => '• ' + point).join('\n') + '\n\n';
    }
    
    if (summary.actionItems.length > 0) {
      summaryText += 'Action Items:\n' + summary.actionItems.slice(0, 3).map(item => '• ' + item).join('\n') + '\n\n';
    }
    
    if (summary.questions.length > 0) {
      summaryText += 'Questions:\n' + summary.questions.slice(0, 3).map(q => '• ' + q).join('\n') + '\n\n';
    }
    
    if (summary.topics.size > 0) {
      summaryText += 'Topics: ' + Array.from(summary.topics).slice(0, 5).join(', ') + '\n\n';
    }
    
    // If no structured summary, provide basic stats
    if (summary.keyPoints.length === 0 && summary.actionItems.length === 0) {
      summaryText += `Conversation with ${messages.length} messages.`;
      if (summary.topics.size > 0) {
        summaryText += ` Main topics: ${Array.from(summary.topics).slice(0, 3).join(', ')}.`;
      }
    }
    
    return {
      summary: summaryText.trim(),
      participants: Array.from(summary.participants),
      topics: Array.from(summary.topics).slice(0, 10)
    };
  }

  isStopWord(word) {
    const stopWords = ['the', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by', 'from', 'that', 'this', 'it', 'is', 'are', 'was', 'were', 'be', 'been', 'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could', 'should', 'may', 'might', 'must', 'can', 'shall', 'about', 'after', 'before', 'during', 'under', 'over', 'through', 'between', 'among', 'around', 'against', 'without', 'within', 'upon', 'down', 'up', 'out', 'off', 'above', 'below', 'again', 'further', 'then', 'once', 'here', 'there', 'when', 'where', 'why', 'how', 'all', 'any', 'both', 'each', 'few', 'more', 'most', 'other', 'some', 'such', 'no', 'nor', 'not', 'only', 'own', 'same', 'so', 'than', 'too', 'very', 'just', 'now'];
    return stopWords.includes(word.toLowerCase());
  }

  async getCurrentPlatform() {
    return { platform: this.currentPlatform };
  }

  async getStatus() {
    return {
      active: this.isActive,
      version: this.version,
      platform: this.currentPlatform,
      features: this.config
    };
  }

  getVersion() { return this.version; }
  getName() { return this.name; }
  isActiveStatus() { return this.isActive; }
  getDependencies() { return []; }

  getContextMenuItems() {
    return [
      {
        id: 'chat-smart-reply',
        title: 'Suya: Smart Reply',
        contexts: ['selection'],
        documentUrlPatterns: [
          '*://web.whatsapp.com/*',
          '*://web.telegram.org/*'
        ]
      },
      {
        id: 'chat-summarize',
        title: 'Suya: Summarize Chat',
        contexts: ['page', 'selection'],
        documentUrlPatterns: [
          '*://web.whatsapp.com/*',
          '*://web.telegram.org/*'
        ]
      },
      {
        id: 'chat-send-message',
        title: 'Suya: Send Selected Message',
        contexts: ['selection'],
        documentUrlPatterns: [
          '*://web.whatsapp.com/*',
          '*://web.telegram.org/*'
        ]
      }
    ];
  }

  async handleContextMenu(info, tab) {
    switch (info.menuItemId) {
      case 'chat-smart-reply':
        await this.handleSmartReplyAction(tab, info.selectionText);
        break;
      case 'chat-summarize':
        await this.handleSummarizeAction(tab);
        break;
      case 'chat-send-message':
        await this.handleSendMessageAction(tab, info.selectionText);
        break;
    }
  }

  async handleSmartReplyAction(tab, selectionText) {
    try {
      const messageToReply = selectionText || 'Last message in chat';
      const response = await chrome.tabs.sendMessage(tab.id, {
        type: 'skill-action',
        skill: 'chat-skills',
        action: 'getSmartReply',
        data: { message: messageToReply }
      });
      
      return response;
    } catch (error) {
      console.error('Failed to generate smart reply from context menu:', error);
      return { success: false, error: error.message };
    }
  }

  async handleSummarizeAction(tab) {
    try {
      const response = await chrome.tabs.sendMessage(tab.id, {
        type: 'skill-action',
        skill: 'chat-skills',
        action: 'summarizeChat',
        data: {}
      });
      
      return response;
    } catch (error) {
      console.error('Failed to summarize chat from context menu:', error);
      return { success: false, error: error.message };
    }
  }

  async handleSendMessageAction(tab, selectionText) {
    try {
      if (!selectionText) {
        return { success: false, error: 'No message text selected' };
      }

      const response = await chrome.tabs.sendMessage(tab.id, {
        type: 'skill-action',
        skill: 'chat-skills',
        action: 'sendMessage',
        data: { message: selectionText }
      });
      
      return response;
    } catch (error) {
      console.error('Failed to send message from context menu:', error);
      return { success: false, error: error.message };
    }
  }
}

export { ChatSkillsSkill };
