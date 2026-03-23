const { chromium } = require('playwright');

async function captureVenmailFull() {
  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext();
  const page = await context.newPage();

  console.log('🔍 Navigating to Venmail...');
  await page.goto('https://m.venmail.io');
  
  // Wait for page to load
  await page.waitForLoadState('networkidle');
  
  console.log('📸 Capturing Venmail login interface...');
  
  // Check if we're on login page
  const isLoginPage = await page.evaluate(() => {
    return window.location.pathname.includes('/login') || 
           document.querySelector('input[type="email"]') !== null;
  });
  
  if (isLoginPage) {
    console.log('🔐 On login page. Please log in to Venmail...');
    console.log('Once logged in, I will capture the compose interface.');
    
    // Wait for login (you'll need to do this manually)
    await page.waitForTimeout(60000); // 1 minute for login
    
    // Check if still on login page
    const stillOnLogin = await page.evaluate(() => {
      return window.location.pathname.includes('/login');
    });
    
    if (stillOnLogin) {
      console.log('❌ Still on login page. Please log in and try again.');
      await browser.close();
      return;
    }
  }
  
  console.log('✅ Logged in! Capturing main interface...');
  
  // Capture the main interface
  const mainInterface = await page.evaluate(() => {
    const structure = {
      url: window.location.href,
      title: document.title,
      
      // Find compose buttons/links
      composeButtons: Array.from(document.querySelectorAll('button, a, [role="button"], div[role="button"]'))
        .filter(el => {
          const text = el.textContent?.toLowerCase() || '';
          const aria = el.getAttribute('aria-label')?.toLowerCase() || '';
          const className = el.className?.toLowerCase() || '';
          return text.includes('compose') || text.includes('new') || text.includes('write') || text.includes('mail') ||
                 aria.includes('compose') || aria.includes('new') || aria.includes('write') ||
                 className.includes('compose') || className.includes('new') || className.includes('mail');
        })
        .map(el => ({
          tag: el.tagName,
          text: el.textContent?.trim(),
          ariaLabel: el.getAttribute('aria-label'),
          className: el.className,
          id: el.id,
          selector: generateSelector(el)
        })),
      
      // Navigation elements
      navigation: Array.from(document.querySelectorAll('nav, .nav, [role="navigation"]'))
        .map(nav => ({
          tag: nav.tagName,
          className: nav.className,
          id: nav.id,
          selector: generateSelector(nav),
          buttons: Array.from(nav.querySelectorAll('button, a, [role="button"]')).map(btn => ({
            text: btn.textContent?.trim(),
            ariaLabel: btn.getAttribute('aria-label'),
            className: btn.className,
            selector: generateSelector(btn)
          }))
        }))
    };
    
    function generateSelector(el) {
      if (el.id) return `#${el.id}`;
      if (el.className) {
        const classes = el.className.split(' ').filter(cls => cls.length > 0);
        if (classes.length > 0) return `.${classes.join('.')}`;
      }
      if (el.name) return `[name="${el.name}"]`;
      return el.tagName.toLowerCase();
    }
    
    return structure;
  });
  
  console.log('\n📋 Venmail Main Interface:');
  console.log('================================');
  console.log('URL:', mainInterface.url);
  console.log('Title:', mainInterface.title);
  console.log('\n📝 Compose Buttons:', mainInterface.composeButtons);
  console.log('\n🧭 Navigation:', mainInterface.navigation);
  
  // Take screenshot
  await page.screenshot({ path: 'venmail-main.png', fullPage: true });
  console.log('\n📸 Main interface screenshot saved as venmail-main.png');
  
  console.log('\n⏳ Now please click the compose button and start composing an email...');
  console.log('I will capture the compose interface in 30 seconds...');
  
  // Wait for user to click compose
  await page.waitForTimeout(30000);
  
  // Capture compose interface
  const composeInterface = await page.evaluate(() => {
    // Look for compose modal/area
    const composeSelectors = [
      '[role="dialog"]',
      '.compose',
      '.new-message',
      '.compose-window',
      '.modal',
      '.popup',
      'div[aria-label*="compose"]',
      'div[aria-label*="new"]',
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
    
    if (!composeArea) {
      // Fallback: look for any visible div with text inputs
      const divsWithInputs = Array.from(document.querySelectorAll('div')).filter(div => {
        return div.offsetParent !== null && 
               div.querySelector('input, textarea, [contenteditable="true"]') &&
               (div.textContent?.includes('To:') || div.textContent?.includes('Subject:') || 
                div.querySelector('input[placeholder*="to" i], input[placeholder*="subject" i]'));
      });
      composeArea = divsWithInputs[0];
    }
    
    if (composeArea) {
      const inputs = Array.from(composeArea.querySelectorAll('input, textarea, [contenteditable="true"]'))
        .filter(el => el.offsetParent !== null) // Only visible inputs
        .map(el => {
          let fieldType = 'unknown';
          const placeholder = (el.placeholder || '').toLowerCase();
          const aria = (el.getAttribute('aria-label') || '').toLowerCase();
          const text = (el.textContent || '').toLowerCase();
          
          // Determine field type
          if (placeholder.includes('to') || aria.includes('to') || text.includes('to:')) fieldType = 'to';
          else if (placeholder.includes('subject') || aria.includes('subject') || text.includes('subject:')) fieldType = 'subject';
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
            value: el.value,
            selector: generateSelector(el)
          };
        });
      
      const sendButtons = Array.from(composeArea.querySelectorAll('button, [type="submit"], [role="button"]'))
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
        }));
      
      return {
        composeAreaSelector: generateSelector(composeArea),
        inputs: inputs,
        sendButtons: sendButtons
      };
    }
    
    return null;
  });
  
  if (composeInterface) {
    console.log('\n📝 Venmail Compose Interface Analysis:');
    console.log('=====================================');
    console.log('Compose Area:', composeInterface.composeAreaSelector);
    console.log('Inputs:', composeInterface.inputs);
    console.log('Send Buttons:', composeInterface.sendButtons);
    
    // Save the analysis to a file
    const fs = require('fs');
    fs.writeFileSync('venmail-compose-analysis.json', JSON.stringify(composeInterface, null, 2));
    console.log('\n💾 Detailed analysis saved to venmail-compose-analysis.json');
  } else {
    console.log('❌ Could not find compose interface. Please make sure you have opened the compose window.');
  }
  
  // Take final screenshot
  await page.screenshot({ path: 'venmail-compose.png', fullPage: true });
  console.log('\n📸 Compose interface screenshot saved as venmail-compose.png');
  
  await browser.close();
}

captureVenmailFull().catch(console.error);
