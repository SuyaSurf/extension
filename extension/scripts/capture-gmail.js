const { chromium } = require('playwright');

async function captureGmailInterface() {
  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext();
  const page = await context.newPage();

  console.log('🔍 Navigating to Gmail...');
  await page.goto('https://mail.google.com');
  
  // Wait for page to load (might need to wait for login)
  await page.waitForTimeout(5000);
  
  console.log('📸 Capturing Gmail interface structure...');
  
  // Capture the overall page structure
  const pageStructure = await page.evaluate(() => {
    const structure = {
      url: window.location.href,
      title: document.title,
      
      // Find compose buttons (Gmail uses specific selectors)
      composeButtons: Array.from(document.querySelectorAll('button, div[role="button"]'))
        .filter(el => {
          const text = el.textContent?.toLowerCase() || '';
          const aria = el.getAttribute('aria-label')?.toLowerCase() || '';
          const dataTooltip = el.getAttribute('data-tooltip')?.toLowerCase() || '';
          return text.includes('compose') || text.includes('new') || text.includes('write') ||
                 aria.includes('compose') || aria.includes('new') || aria.includes('write') ||
                 dataTooltip.includes('compose') || dataTooltip.includes('new');
        })
        .map(el => ({
          tag: el.tagName,
          text: el.textContent?.trim(),
          ariaLabel: el.getAttribute('aria-label'),
          dataTooltip: el.getAttribute('data-tooltip'),
          className: el.className,
          id: el.id,
          selector: generateSelector(el)
        })),
      
      // Find form inputs (look for common Gmail patterns)
      formInputs: Array.from(document.querySelectorAll('input, textarea, [contenteditable="true"]'))
        .filter(el => {
          // Filter out hidden inputs and search-related inputs
          if (el.type === 'hidden') return false;
          const placeholder = (el.placeholder || '').toLowerCase();
          const aria = (el.getAttribute('aria-label') || '').toLowerCase();
          return placeholder.includes('to') || placeholder.includes('subject') || 
                 placeholder.includes('cc') || placeholder.includes('bcc') ||
                 aria.includes('to') || aria.includes('subject') || 
                 aria.includes('message') || aria.includes('body');
        })
        .map(el => ({
          tag: el.tagName,
          type: el.type || 'text',
          placeholder: el.placeholder,
          name: el.name,
          id: el.id,
          className: el.className,
          ariaLabel: el.getAttribute('aria-label'),
          selector: generateSelector(el)
        })),
      
      // Find send buttons
      sendButtons: Array.from(document.querySelectorAll('button, [type="submit"], div[role="button"]'))
        .filter(el => {
          const text = el.textContent?.toLowerCase() || '';
          const aria = el.getAttribute('aria-label')?.toLowerCase() || '';
          return text.includes('send') || text.includes('deliver') || text.includes('submit') ||
                 aria.includes('send') || aria.includes('deliver') || aria.includes('submit');
        })
        .map(el => ({
          tag: el.tagName,
          text: el.textContent?.trim(),
          ariaLabel: el.getAttribute('aria-label'),
          className: el.className,
          id: el.id,
          selector: generateSelector(el)
        }))
    };
    
    function generateSelector(el) {
      // Try to create stable selectors avoiding Gmail's obfuscated IDs
      if (el.id && !el.id.match(/^[a-f0-9]{8,}$/i)) return `#${el.id}`;
      if (el.className) {
        const stableClasses = el.className.split(' ').filter(cls => 
          !cls.match(/^[a-f0-9]{8,}$/i) && !cls.includes('gmail') && cls.length > 2
        );
        if (stableClasses.length > 0) return `.${stableClasses.join('.')}`;
      }
      if (el.name) return `[name="${el.name}"]`;
      if (el.getAttribute('data-tooltip')) return `[data-tooltip="${el.getAttribute('data-tooltip')}"]`;
      return el.tagName.toLowerCase();
    }
    
    return structure;
  });
  
  console.log('\n📋 Gmail Interface Analysis:');
  console.log('================================');
  console.log('URL:', pageStructure.url);
  console.log('Title:', pageStructure.title);
  console.log('\n📝 Compose Buttons:', pageStructure.composeButtons);
  console.log('\n📧 Form Inputs:', pageStructure.formInputs);
  console.log('\n📤 Send Buttons:', pageStructure.sendButtons);
  
  // Take a screenshot for reference
  await page.screenshot({ path: 'gmail-interface.png', fullPage: true });
  console.log('\n📸 Screenshot saved as gmail-interface.png');
  
  console.log('\n⏳ Waiting for you to compose an email...');
  console.log('Please compose an email manually so I can capture the process.');
  
  // Wait for user to compose (you can adjust this time)
  await page.waitForTimeout(30000);
  
  // Capture the composition interface
  const composeStructure = await page.evaluate(() => {
    // Look for compose modal/area (Gmail uses specific patterns)
    const composeSelectors = [
      'div[role="dialog"]',
      '.nH.if',
      '.nH.nn',
      '[role="main"] div:has(textarea)',
      'div[aria-label*="compose"]',
      'div[aria-label*="message"]'
    ];
    
    let composeArea = null;
    for (const selector of composeSelectors) {
      try {
        const el = document.querySelector(selector);
        if (el && el.offsetParent !== null) { // Check if visible
          composeArea = el;
          break;
        }
      } catch (e) {
        // Continue to next selector
      }
    }
    
    if (composeArea) {
      const inputs = Array.from(composeArea.querySelectorAll('input, textarea, [contenteditable="true"]'))
        .filter(el => {
          // Filter out hidden inputs
          if (el.type === 'hidden') return false;
          if (el.offsetParent === null) return false; // Not visible
          return true;
        })
        .map(el => {
          let selector = generateSelector(el);
          // Try to find semantic meaning
          let fieldType = 'unknown';
          const placeholder = (el.placeholder || '').toLowerCase();
          const aria = (el.getAttribute('aria-label') || '').toLowerCase();
          const text = (el.textContent || '').toLowerCase();
          
          if (placeholder.includes('to') || aria.includes('to')) fieldType = 'to';
          else if (placeholder.includes('subject') || aria.includes('subject')) fieldType = 'subject';
          else if (placeholder.includes('cc') || aria.includes('cc')) fieldType = 'cc';
          else if (placeholder.includes('bcc') || aria.includes('bcc')) fieldType = 'bcc';
          else if (placeholder.includes('message') || aria.includes('message') || 
                   aria.includes('body') || el.getAttribute('contenteditable') === 'true') fieldType = 'body';
          
          return {
            tag: el.tagName,
            type: el.type || 'text',
            placeholder: el.placeholder,
            name: el.name,
            id: el.id,
            className: el.className,
            ariaLabel: el.getAttribute('aria-label'),
            fieldType: fieldType,
            selector: selector
          };
        });
      
      return {
        composeAreaSelector: generateSelector(composeArea),
        inputs: inputs
      };
    }
    
    return null;
  });
  
  if (composeStructure) {
    console.log('\n📝 Compose Interface Analysis:');
    console.log('================================');
    console.log('Compose Area:', composeStructure.composeAreaSelector);
    console.log('Inputs:', composeStructure.inputs);
  }
  
  await browser.close();
  return { pageStructure, composeStructure };
}

captureGmailInterface().catch(console.error);
