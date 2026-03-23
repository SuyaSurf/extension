const { chromium } = require('playwright');

async function captureGmailFull() {
  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext();
  const page = await context.newPage();

  console.log('🔍 Navigating to Gmail...');
  await page.goto('https://mail.google.com');
  
  // Wait for page to load
  await page.waitForTimeout(5000);
  
  console.log('📸 Capturing Gmail interface...');
  
  // Check if we need to login
  const needsLogin = await page.evaluate(() => {
    return window.location.hostname === 'accounts.google.com' ||
           document.querySelector('input[type="email"]') !== null;
  });
  
  if (needsLogin) {
    console.log('🔐 On login page. Please log in to Gmail...');
    console.log('Once logged in, I will capture the compose interface.');
    
    // Wait for login (you'll need to do this manually)
    await page.waitForTimeout(120000); // 2 minutes for login
    
    // Check if redirected to Gmail
    const onGmail = await page.evaluate(() => {
      return window.location.hostname === 'mail.google.com';
    });
    
    if (!onGmail) {
      console.log('❌ Not redirected to Gmail. Please complete login and try again.');
      await browser.close();
      return;
    }
  }
  
  console.log('✅ Logged in! Capturing main interface...');
  
  // Wait for Gmail to fully load
  await page.waitForTimeout(5000);
  
  // Capture the main interface
  const mainInterface = await page.evaluate(() => {
    const structure = {
      url: window.location.href,
      title: document.title,
      
      // Find compose buttons (Gmail uses specific patterns)
      composeButtons: Array.from(document.querySelectorAll('div[role="button"], button'))
        .filter(el => {
          const text = el.textContent?.toLowerCase() || '';
          const aria = el.getAttribute('aria-label')?.toLowerCase() || '';
          const dataTooltip = el.getAttribute('data-tooltip')?.toLowerCase() || '';
          const className = el.className?.toLowerCase() || '';
          
          return text.includes('compose') || text.includes('new') || text.includes('write') ||
                 aria.includes('compose') || aria.includes('new') || aria.includes('write') ||
                 dataTooltip.includes('compose') || dataTooltip.includes('new') ||
                 className.includes('compose') || className.includes('new');
        })
        .map(el => {
          // Generate stable selector avoiding Gmail's obfuscated IDs
          let selector = '';
          if (el.id && !el.id.match(/^[a-f0-9]{8,}$/i)) {
            selector = `#${el.id}`;
          } else if (el.getAttribute('data-tooltip')) {
            selector = `[data-tooltip="${el.getAttribute('data-tooltip')}"]`;
          } else if (el.getAttribute('aria-label')) {
            selector = `[aria-label="${el.getAttribute('aria-label')}"]`;
          } else {
            selector = el.tagName.toLowerCase();
          }
          
          return {
            tag: el.tagName,
            text: el.textContent?.trim(),
            ariaLabel: el.getAttribute('aria-label'),
            dataTooltip: el.getAttribute('data-tooltip'),
            className: el.className,
            id: el.id,
            selector: selector,
            visible: el.offsetParent !== null
          };
        })
        .filter(btn => btn.visible) // Only visible buttons
    };
    
    return structure;
  });
  
  console.log('\n📋 Gmail Main Interface:');
  console.log('================================');
  console.log('URL:', mainInterface.url);
  console.log('Title:', mainInterface.title);
  console.log('\n📝 Compose Buttons:', mainInterface.composeButtons);
  
  // Take screenshot
  await page.screenshot({ path: 'gmail-main.png', fullPage: true });
  console.log('\n📸 Main interface screenshot saved as gmail-main.png');
  
  console.log('\n⏳ Now please click the compose button and start composing an email...');
  console.log('I will capture the compose interface in 30 seconds...');
  
  // Wait for user to click compose
  await page.waitForTimeout(30000);
  
  // Capture compose interface
  const composeInterface = await page.evaluate(() => {
    // Look for compose modal/area (Gmail uses specific patterns)
    const composeSelectors = [
      'div[role="dialog"]',
      '.nH.if',
      '.nH.nn',
      '.AD',
      '.aO7',
      'div[aria-label*="compose"]',
      'div[aria-label*="message"]',
      'div[aria-label*="new"]'
    ];
    
    let composeArea = null;
    for (const selector of composeSelectors) {
      try {
        const elements = document.querySelectorAll(selector);
        for (const el of elements) {
          if (el.offsetParent !== null) { // Check if visible
            // Check if it contains email-related inputs
            const hasEmailInputs = el.querySelector('input[type="email"], textarea, [contenteditable="true"]');
            if (hasEmailInputs) {
              composeArea = el;
              break;
            }
          }
        }
        if (composeArea) break;
      } catch (e) {
        // Continue to next selector
      }
    }
    
    if (!composeArea) {
      // Fallback: look for any visible div with text inputs and email fields
      const allDivs = Array.from(document.querySelectorAll('div'));
      for (const div of allDivs) {
        if (div.offsetParent !== null) {
          const inputs = div.querySelectorAll('input, textarea, [contenteditable="true"]');
          const hasEmailField = Array.from(inputs).some(input => {
            const placeholder = (input.placeholder || '').toLowerCase();
            const aria = (input.getAttribute('aria-label') || '').toLowerCase();
            return placeholder.includes('to') || placeholder.includes('recipient') ||
                   aria.includes('to') || aria.includes('recipient') ||
                   input.type === 'email';
          });
          
          if (hasEmailField && inputs.length > 1) {
            composeArea = div;
            break;
          }
        }
      }
    }
    
    if (composeArea) {
      const inputs = Array.from(composeArea.querySelectorAll('input, textarea, [contenteditable="true"]'))
        .filter(el => el.offsetParent !== null) // Only visible inputs
        .map(el => {
          let fieldType = 'unknown';
          const placeholder = (el.placeholder || '').toLowerCase();
          const aria = (el.getAttribute('aria-label') || '').toLowerCase();
          const text = (el.textContent || '').toLowerCase();
          
          // Determine field type using semantic clues
          if (el.type === 'email' || placeholder.includes('to') || aria.includes('to') || 
              text.includes('to:') || aria.includes('recipient')) {
            fieldType = 'to';
          } else if (placeholder.includes('subject') || aria.includes('subject') || 
                     text.includes('subject:')) {
            fieldType = 'subject';
          } else if (placeholder.includes('cc') || aria.includes('cc')) {
            fieldType = 'cc';
          } else if (placeholder.includes('bcc') || aria.includes('bcc')) {
            fieldType = 'bcc';
          } else if (placeholder.includes('message') || aria.includes('message') || 
                     aria.includes('body') || el.getAttribute('contenteditable') === 'true') {
            fieldType = 'body';
          }
          
          // Generate stable selector
          let selector = '';
          if (el.id && !el.id.match(/^[a-f0-9]{8,}$/i)) {
            selector = `#${el.id}`;
          } else if (el.name) {
            selector = `[name="${el.name}"]`;
          } else if (el.getAttribute('aria-label')) {
            selector = `[aria-label="${el.getAttribute('aria-label')}"]`;
          } else if (placeholder) {
            selector = `[placeholder="${placeholder}"]`;
          } else {
            selector = el.tagName.toLowerCase();
          }
          
          return {
            tag: el.tagName,
            type: el.type || 'text',
            placeholder: el.placeholder,
            name: el.name,
            id: el.id,
            className: el.className,
            ariaLabel: el.getAttribute('aria-label'),
            fieldType: fieldType,
            value: el.value,
            selector: selector
          };
        });
      
      const sendButtons = Array.from(composeArea.querySelectorAll('div[role="button"], button'))
        .filter(el => {
          const text = el.textContent?.toLowerCase() || '';
          const aria = el.getAttribute('aria-label')?.toLowerCase() || '';
          const visible = el.offsetParent !== null;
          return visible && (text.includes('send') || text.includes('deliver') || text.includes('submit') ||
                            aria.includes('send') || aria.includes('deliver') || aria.includes('submit'));
        })
        .map(el => {
          let selector = '';
          if (el.id && !el.id.match(/^[a-f0-9]{8,}$/i)) {
            selector = `#${el.id}`;
          } else if (el.getAttribute('aria-label')) {
            selector = `[aria-label="${el.getAttribute('aria-label')}"]`;
          } else {
            selector = el.tagName.toLowerCase();
          }
          
          return {
            tag: el.tagName,
            text: el.textContent?.trim(),
            ariaLabel: el.getAttribute('aria-label'),
            className: el.className,
            id: el.id,
            selector: selector
          };
        });
      
      return {
        composeAreaSelector: generateSelector(composeArea),
        inputs: inputs,
        sendButtons: sendButtons
      };
    }
    
    return null;
    
    function generateSelector(el) {
      if (el.id && !el.id.match(/^[a-f0-9]{8,}$/i)) return `#${el.id}`;
      if (el.className) {
        const stableClasses = el.className.split(' ').filter(cls => 
          !cls.match(/^[a-f0-9]{8,}$/i) && !cls.includes('gmail') && cls.length > 2
        );
        if (stableClasses.length > 0) return `.${stableClasses.join('.')}`;
      }
      if (el.getAttribute('aria-label')) {
        return `[aria-label="${el.getAttribute('aria-label')}"]`;
      }
      return el.tagName.toLowerCase();
    }
  });
  
  if (composeInterface) {
    console.log('\n📝 Gmail Compose Interface Analysis:');
    console.log('====================================');
    console.log('Compose Area:', composeInterface.composeAreaSelector);
    console.log('Inputs:', composeInterface.inputs);
    console.log('Send Buttons:', composeInterface.sendButtons);
    
    // Save the analysis to a file
    const fs = require('fs');
    fs.writeFileSync('gmail-compose-analysis.json', JSON.stringify(composeInterface, null, 2));
    console.log('\n💾 Detailed analysis saved to gmail-compose-analysis.json');
  } else {
    console.log('❌ Could not find compose interface. Please make sure you have opened the compose window.');
  }
  
  // Take final screenshot
  await page.screenshot({ path: 'gmail-compose.png', fullPage: true });
  console.log('\n📸 Compose interface screenshot saved as gmail-compose.png');
  
  await browser.close();
}

captureGmailFull().catch(console.error);
