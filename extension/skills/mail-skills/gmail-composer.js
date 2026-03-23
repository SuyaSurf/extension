/**
 * Gmail Email Composition Implementation
 * Handles composing emails in Gmail web interface
 * Uses stable selectors to avoid Gmail's obfuscated IDs
 */

class GmailComposer {
  constructor() {
    this.isGmailSite = window.location.hostname === 'mail.google.com';
    this.composeWindow = null;
    this.fieldSelectors = {
      // Gmail-specific stable selectors
      composeButton: 'div[role="button"][data-tooltip*="Compose"]',
      toField: 'input[aria-label*="To"], input[placeholder*="To"]',
      subjectField: 'input[aria-label*="Subject"], input[name="subjectbox"]',
      bodyField: 'div[aria-label*="Message"], div[contenteditable="true"]',
      sendButton: 'div[role="button"][aria-label*="Send"]'
    };
  }

  /**
   * Check if we're on Gmail
   */
  isGmailPage() {
    return this.isGmailSite;
  }

  /**
   * Open compose window
   */
  async openComposeWindow() {
    try {
      // Look for Gmail's compose button using stable attributes
      const composeSelectors = [
        'div[role="button"][data-tooltip*="Compose"]',
        'div[role="button"][aria-label*="Compose"]',
        'div[role="button"]:has(span:contains("Compose"))',
        '.T-I.J-J5-Ji.T-I-KE.L3', // Gmail's compose button class (may change)
        'div[gh="cm"]' // Gmail's compose button data attribute
      ];

      let composeButton = null;
      for (const selector of composeSelectors) {
        composeButton = document.querySelector(selector);
        if (composeButton && composeButton.offsetParent !== null) {
          break;
        }
      }

      // Fallback: look for any button with "Compose" text
      if (!composeButton) {
        const allButtons = document.querySelectorAll('div[role="button"], button');
        for (const btn of allButtons) {
          if (btn.textContent?.includes('Compose') && btn.offsetParent !== null) {
            composeButton = btn;
            break;
          }
        }
      }

      if (!composeButton) {
        throw new Error('Compose button not found. Please make sure you\'re on the Gmail main page.');
      }

      // Click compose button
      composeButton.click();
      
      // Wait for compose window to appear (Gmail can be slow)
      await new Promise(resolve => setTimeout(resolve, 1500));
      
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
   * Find the compose window in Gmail
   */
  findComposeWindow() {
    // Gmail uses specific patterns for compose windows
    const composeSelectors = [
      'div[role="dialog"]:has(input[aria-label*="To"])',
      'div.nH.if:has(input[aria-label*="To"])',
      'div.nH.nn:has(input[aria-label*="To"])',
      'div.AD:has(input[aria-label*="To"])',
      'div.aO7:has(input[aria-label*="To"])',
      'div[aria-label*="New Message"]',
      'div[aria-label*="Compose"]'
    ];

    for (const selector of composeSelectors) {
      try {
        const element = document.querySelector(selector);
        if (element && element.offsetParent !== null) {
          return element;
        }
      } catch (e) {
        // Continue to next selector
      }
    }

    // Fallback: look for any dialog with email inputs
    const allDialogs = document.querySelectorAll('[role="dialog"], .nH, .AD');
    for (const dialog of allDialogs) {
      if (dialog.offsetParent !== null) {
        const hasEmailField = dialog.querySelector('input[aria-label*="To"], input[type="email"]');
        if (hasEmailField) {
          return dialog;
        }
      }
    }

    return null;
  }

  /**
   * Fill email fields in Gmail
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

      // Fill To field - Gmail uses aria-label
      if (data.to) {
        const toField = this.composeWindow.querySelector('input[aria-label*="To"], input[placeholder*="To"]');
        if (toField) {
          toField.value = data.to;
          toField.focus();
          toField.dispatchEvent(new Event('input', { bubbles: true }));
          toField.dispatchEvent(new Event('change', { bubbles: true }));
          // Gmail often requires a blur event to process the input
          toField.blur();
          results.to = 'filled';
        } else {
          results.to = 'field not found';
        }
      }

      // Fill Subject field
      if (data.subject) {
        const subjectField = this.composeWindow.querySelector('input[aria-label*="Subject"], input[name="subjectbox"]');
        if (subjectField) {
          subjectField.value = data.subject;
          subjectField.focus();
          subjectField.dispatchEvent(new Event('input', { bubbles: true }));
          subjectField.dispatchEvent(new Event('change', { bubbles: true }));
          subjectField.blur();
          results.subject = 'filled';
        } else {
          results.subject = 'field not found';
        }
      }

      // Fill Body field - Gmail uses contenteditable div
      if (data.body) {
        const bodyField = this.composeWindow.querySelector('div[aria-label*="Message"], div[contenteditable="true"]');
        if (bodyField) {
          bodyField.focus();
          // Clear existing content
          bodyField.textContent = '';
          // Add new content
          bodyField.textContent = data.body;
          // Trigger input events
          bodyField.dispatchEvent(new Event('input', { bubbles: true }));
          bodyField.dispatchEvent(new Event('change', { bubbles: true }));
          bodyField.blur();
          results.body = 'filled';
        } else {
          results.body = 'field not found';
        }
      }

      // Fill CC field if provided
      if (data.cc) {
        // Look for CC button to show CC field
        const ccButton = this.composeWindow.querySelector('div[role="button"][aria-label*="Cc"], div[role="button"]:has(span:contains("Cc"))');
        if (ccButton) {
          ccButton.click();
          await new Promise(resolve => setTimeout(resolve, 500));
        }

        const ccField = this.composeWindow.querySelector('input[aria-label*="Cc"], input[placeholder*="Cc"]');
        if (ccField) {
          ccField.value = data.cc;
          ccField.focus();
          ccField.dispatchEvent(new Event('input', { bubbles: true }));
          ccField.dispatchEvent(new Event('change', { bubbles: true }));
          ccField.blur();
          results.cc = 'filled';
        } else {
          results.cc = 'field not found';
        }
      }

      // Fill BCC field if provided
      if (data.bcc) {
        // Look for BCC button to show BCC field
        const bccButton = this.composeWindow.querySelector('div[role="button"][aria-label*="Bcc"], div[role="button"]:has(span:contains("Bcc"))');
        if (bccButton) {
          bccButton.click();
          await new Promise(resolve => setTimeout(resolve, 500));
        }

        const bccField = this.composeWindow.querySelector('input[aria-label*="Bcc"], input[placeholder*="Bcc"]');
        if (bccField) {
          bccField.value = data.bcc;
          bccField.focus();
          bccField.dispatchEvent(new Event('input', { bubbles: true }));
          bccField.dispatchEvent(new Event('change', { bubbles: true }));
          bccField.blur();
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
   * Send the email in Gmail
   */
  async sendEmail() {
    try {
      if (!this.composeWindow) {
        throw new Error('No compose window found.');
      }

      // Find send button using stable attributes
      const sendSelectors = [
        'div[role="button"][aria-label*="Send"]',
        'div[role="button"]:has(span:contains("Send"))',
        'div[role="button"][data-tooltip*="Send"]',
        'div.T-I.J-J5-Ji.aoO.T-I-atl.L3' // Gmail's send button class
      ];

      let sendButton = null;
      for (const selector of sendSelectors) {
        sendButton = this.composeWindow.querySelector(selector);
        if (sendButton && sendButton.offsetParent !== null) {
          break;
        }
      }

      // Fallback: look for any button with "Send" text
      if (!sendButton) {
        const allButtons = this.composeWindow.querySelectorAll('div[role="button"], button');
        for (const btn of allButtons) {
          if (btn.textContent?.includes('Send') && btn.offsetParent !== null) {
            sendButton = btn;
            break;
          }
        }
      }

      if (!sendButton) {
        throw new Error('Send button not found. Please send the email manually.');
      }

      // Click send button
      sendButton.click();

      // Wait for send to complete and window to close
      await new Promise(resolve => setTimeout(resolve, 3000));

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
      // Look for close button in Gmail
      const closeSelectors = [
        'div[role="button"][aria-label*="Close"]',
        'div[role="button"]:has(span:contains("Close"))',
        'div[role="button"]:has(span:contains("×"))',
        '.Ha.hx' // Gmail's close button class
      ];

      for (const selector of closeSelectors) {
        let closeButton = this.composeWindow.querySelector(selector);
        if (closeButton && closeButton.offsetParent !== null) {
          closeButton.click();
          break;
        }
      }

      this.composeWindow = null;
    }
  }

  /**
   * Wait for Gmail to fully load
   */
  async waitForGmailLoad() {
    // Wait for Gmail interface to be ready
    await new Promise(resolve => {
      const checkGmail = () => {
        const inbox = document.querySelector('div[role="main"], .nH, .aeJ');
        if (inbox) {
          resolve();
        } else {
          setTimeout(checkGmail, 500);
        }
      };
      checkGmail();
    });
  }
}

// Export for use in skill
window.GmailComposer = GmailComposer;
