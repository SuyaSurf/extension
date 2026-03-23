const { chromium } = require('playwright');

async function captureVenmailInterface() {
  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext();
  const page = await context.newPage();

  console.log('🔍 Navigating to Venmail...');
  await page.goto('https://m.venmail.io');
  
  // Wait for page to load
  await page.waitForLoadState('networkidle');
  
  console.log('📸 Capturing Venmail interface structure...');
  
  // Capture the overall page structure
  const pageStructure = await page.evaluate(() => {
    const structure = {
      url: window.location.href,
      title: document.title,
      
      // Find compose buttons/links
      composeButtons: Array.from(document.querySelectorAll('button, a, [role="button"]'))
        .filter(el => {
          const text = el.textContent?.toLowerCase() || '';
          const aria = el.getAttribute('aria-label')?.toLowerCase() || '';
          return text.includes('compose') || text.includes('new') || text.includes('write') ||
                 aria.includes('compose') || aria.includes('new') || aria.includes('write');
        })
        .map(el => ({
          tag: el.tagName,
          text: el.textContent?.trim(),
          ariaLabel: el.getAttribute('aria-label'),
          className: el.className,
          id: el.id,
          selector: generateSelector(el)
        })),
      
      // Find form inputs
      formInputs: Array.from(document.querySelectorAll('input, textarea, [contenteditable="true"]'))
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
      sendButtons: Array.from(document.querySelectorAll('button, [type="submit"], [role="button"]'))
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
      if (el.id) return `#${el.id}`;
      if (el.className) return `.${el.className.split(' ').join('.')}`;
      if (el.name) return `[name="${el.name}"]`;
      return el.tagName.toLowerCase();
    }
    
    return structure;
  });
  
  console.log('\n📋 Venmail Interface Analysis:');
  console.log('================================');
  console.log('URL:', pageStructure.url);
  console.log('Title:', pageStructure.title);
  console.log('\n📝 Compose Buttons:', pageStructure.composeButtons);
  console.log('\n📧 Form Inputs:', pageStructure.formInputs);
  console.log('\n📤 Send Buttons:', pageStructure.sendButtons);
  
  // Take a screenshot for reference
  await page.screenshot({ path: 'venmail-interface.png', fullPage: true });
  console.log('\n📸 Screenshot saved as venmail-interface.png');
  
  console.log('\n⏳ Waiting for you to compose an email...');
  console.log('Please compose an email manually so I can capture the process.');
  
  // Wait for user to compose (you can adjust this time)
  await page.waitForTimeout(30000);
  
  // Capture the composition interface
  const composeStructure = await page.evaluate(() => {
    // Look for compose modal/area
    const composeArea = document.querySelector('[role="dialog"], .compose, .new-message, .compose-window') ||
                       document.querySelector('div:has(textarea), div:has(input[type="email"])');
    
    if (composeArea) {
      const inputs = Array.from(composeArea.querySelectorAll('input, textarea, [contenteditable="true"]'))
        .map(el => ({
          tag: el.tagName,
          type: el.type || 'text',
          placeholder: el.placeholder,
          name: el.name,
          id: el.id,
          className: el.className,
          ariaLabel: el.getAttribute('aria-label'),
          value: el.value,
          selector: generateSelector(el)
        }));
      
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

captureVenmailInterface().catch(console.error);
