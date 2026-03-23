/**
 * Venmail Email Composition Implementation
 * Handles composing emails in Venmail web interface
 */

class VenmailComposer {
  constructor() {
    this.isVenmailSite = window.location.hostname === 'm.venmail.io';
    this.composeWindow = null;
    this.fieldSelectors = {
      composeButton: 'button[aria-label*="compose"], button:contains("Compose"), .compose-btn',
      toField: 'input[type="email"], input[placeholder*="to"], input[name="to"]',
      subjectField: 'input[placeholder*="subject"], input[name="subject"]',
      bodyField: 'textarea, [contenteditable="true"]',
      sendButton: 'button:contains("Send"), button[aria-label*="send"], .send-btn'
    };
  }

  /**
   * Check if we're on Venmail
   */
  isVenmailPage() {
    return this.isVenmailSite;
  }

  /**
   * Open compose window
   */
  async openComposeWindow() {
    try {
      // Look for compose button using multiple selectors
      const composeSelectors = [
        'button[aria-label*="compose"]',
        'button[aria-label*="new"]',
        'button:contains("Compose")',
        'button:contains("New")',
        '.compose-btn',
        '.new-email',
        '[data-action="compose"]'
      ];

      let composeButton = null;
      for (const selector of composeSelectors) {
        composeButton = document.querySelector(selector);
        if (composeButton && composeButton.offsetParent !== null) {
          break;
        }
      }

      if (!composeButton) {
        throw new Error('Compose button not found. Please make sure you\'re on the Venmail main page.');
      }

      // Click compose button
      composeButton.click();
      
      // Wait for compose window to appear
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      // Find the compose window
      this.composeWindow = this.findComposeWindow();
      
      if (!this.composeWindow) {
        throw new Error('Compose window did not open. Please try clicking the compose button manually.');
      }

      return { success: true, message: 'Compose window opened' };
    } catch (error) {
      console.error('Failed to open compose window:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Find the compose window/modal
   */
  findComposeWindow() {
    const composeSelectors = [
      '[role="dialog"]',
      '.compose-modal',
      '.compose-window',
      '.new-message',
      '.modal:has(input[type="email"])',
      '.popup:has(textarea)'
    ];

    for (const selector of composeSelectors) {
      const element = document.querySelector(selector);
      if (element && element.offsetParent !== null) {
        // Check if it contains email fields
        const hasEmailField = element.querySelector('input[type="email"], input[placeholder*="to"]');
        if (hasEmailField) {
          return element;
        }
      }
    }

    return null;
  }

  /**
   * Fill email fields
   */
  async fillEmailFields(data) {
    try {
      if (!this.composeWindow) {
        this.composeWindow = this.findComposeWindow();
      }

      if (!this.composeWindow) {
        throw new Error('No compose window found. Please open compose window first.');
      }

      const results = {};

      // Fill To field
      if (data.to) {
        const toField = this.composeWindow.querySelector('input[type="email"], input[placeholder*="to"], input[name="to"]');
        if (toField) {
          toField.value = data.to;
          toField.dispatchEvent(new Event('input', { bubbles: true }));
          toField.dispatchEvent(new Event('change', { bubbles: true }));
          results.to = 'filled';
        } else {
          results.to = 'field not found';
        }
      }

      // Fill Subject field
      if (data.subject) {
        const subjectField = this.composeWindow.querySelector('input[placeholder*="subject"], input[name="subject"]');
        if (subjectField) {
          subjectField.value = data.subject;
          subjectField.dispatchEvent(new Event('input', { bubbles: true }));
          subjectField.dispatchEvent(new Event('change', { bubbles: true }));
          results.subject = 'filled';
        } else {
          results.subject = 'field not found';
        }
      }

      // Fill Body field
      if (data.body) {
        const bodyField = this.composeWindow.querySelector('textarea, [contenteditable="true"]');
        if (bodyField) {
          if (bodyField.getAttribute('contenteditable') === 'true') {
            // For contenteditable divs
            bodyField.focus();
            bodyField.innerText = data.body;
            bodyField.dispatchEvent(new Event('input', { bubbles: true }));
            bodyField.dispatchEvent(new Event('change', { bubbles: true }));
          } else {
            // For textarea
            bodyField.value = data.body;
            bodyField.dispatchEvent(new Event('input', { bubbles: true }));
            bodyField.dispatchEvent(new Event('change', { bubbles: true }));
          }
          results.body = 'filled';
        } else {
          results.body = 'field not found';
        }
      }

      // Fill CC field if provided
      if (data.cc) {
        const ccField = this.composeWindow.querySelector('input[placeholder*="cc"], input[name="cc"]');
        if (ccField) {
          ccField.value = data.cc;
          ccField.dispatchEvent(new Event('input', { bubbles: true }));
          ccField.dispatchEvent(new Event('change', { bubbles: true }));
          results.cc = 'filled';
        } else {
          results.cc = 'field not found';
        }
      }

      // Fill BCC field if provided
      if (data.bcc) {
        const bccField = this.composeWindow.querySelector('input[placeholder*="bcc"], input[name="bcc"]');
        if (bccField) {
          bccField.value = data.bcc;
          bccField.dispatchEvent(new Event('input', { bubbles: true }));
          bccField.dispatchEvent(new Event('change', { bubbles: true }));
          results.bcc = 'filled';
        } else {
          results.bcc = 'field not found';
        }
      }

      return { success: true, results };
    } catch (error) {
      console.error('Failed to fill email fields:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Send the email
   */
  async sendEmail() {
    try {
      if (!this.composeWindow) {
        throw new Error('No compose window found.');
      }

      // Find send button
      const sendSelectors = [
        'button:contains("Send")',
        'button[aria-label*="send"]',
        '.send-btn',
        '[data-action="send"]',
        'button[type="submit"]'
      ];

      let sendButton = null;
      for (const selector of sendSelectors) {
        // Handle :contains pseudo-selector
        if (selector.includes(':contains(')) {
          const match = selector.match(/:contains\("([^"]+)"\)/);
          if (match) {
            const text = match[1];
            const buttons = this.composeWindow.querySelectorAll('button');
            for (const btn of buttons) {
              if (btn.textContent?.includes(text)) {
                sendButton = btn;
                break;
              }
            }
          }
        } else {
          sendButton = this.composeWindow.querySelector(selector);
        }
        
        if (sendButton && sendButton.offsetParent !== null) {
          break;
        }
      }

      if (!sendButton) {
        throw new Error('Send button not found. Please send the email manually.');
      }

      // Click send button
      sendButton.click();

      // Wait a moment for send to complete
      await new Promise(resolve => setTimeout(resolve, 2000));

      return { success: true, message: 'Email sent successfully' };
    } catch (error) {
      console.error('Failed to send email:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Complete email composition workflow
   */
  async composeEmail(data) {
    try {
      // Step 1: Open compose window
      const openResult = await this.openComposeWindow();
      if (!openResult.success) {
        return openResult;
      }

      // Step 2: Fill email fields
      const fillResult = await this.fillEmailFields(data);
      if (!fillResult.success) {
        return fillResult;
      }

      // Step 3: Send email if requested
      if (data.send !== false) {
        const sendResult = await this.sendEmail();
        return sendResult;
      }

      return { success: true, message: 'Email composed successfully', results: fillResult.results };
    } catch (error) {
      console.error('Failed to compose email:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Check if compose window is open
   */
  isComposeWindowOpen() {
    return this.composeWindow !== null && this.composeWindow.offsetParent !== null;
  }

  /**
   * Close compose window
   */
  async closeComposeWindow() {
    if (this.composeWindow) {
      // Look for close button
      const closeSelectors = [
        'button[aria-label*="close"]',
        'button:contains("Close")',
        'button:contains("×")',
        '.close-btn',
        '.modal-close'
      ];

      for (const selector of closeSelectors) {
        let closeButton = null;
        
        if (selector.includes(':contains(')) {
          const match = selector.match(/:contains\("([^"]+)"\)/);
          if (match) {
            const text = match[1];
            const buttons = this.composeWindow.querySelectorAll('button');
            for (const btn of buttons) {
              if (btn.textContent?.includes(text)) {
                closeButton = btn;
                break;
              }
            }
          }
        } else {
          closeButton = this.composeWindow.querySelector(selector);
        }
        
        if (closeButton && closeButton.offsetParent !== null) {
          closeButton.click();
          break;
        }
      }

      this.composeWindow = null;
    }
  }
}

// Export for use in skill
window.VenmailComposer = VenmailComposer;
