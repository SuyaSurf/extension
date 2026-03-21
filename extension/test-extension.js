// Simple test script to verify the extension loads correctly
console.log('Testing Suya Extension...');

// Test 1: Check if manifest is valid
try {
  const manifest = chrome.runtime.getManifest();
  console.log('✓ Manifest loaded:', manifest.name, 'v' + manifest.version);
  console.log('  - New tab override:', manifest.chrome_url_overrides?.newtab);
  console.log('  - Permissions:', manifest.permissions?.join(', '));
} catch (e) {
  console.error('✗ Manifest error:', e);
}

// Test 2: Check if service worker is active
if (typeof chrome !== 'undefined' && chrome.runtime) {
  chrome.runtime.sendMessage({ type: 'ping' }, (response) => {
    if (response) {
      console.log('✓ Service worker responding');
    } else {
      console.log('⚠ Service worker not responding (expected in content script)');
    }
  });
}

// Test 3: Check storage access
if (typeof chrome !== 'undefined' && chrome.storage) {
  chrome.storage.sync.get(['test'], (result) => {
    console.log('✓ Storage accessible');
    chrome.storage.sync.set({ test: Date.now() });
  });
}

console.log('Extension test complete.');
