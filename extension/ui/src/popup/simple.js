// Simple popup for Suya Bot Extension
document.addEventListener('DOMContentLoaded', function() {
  const root = document.getElementById('root');
  
  if (root) {
    root.innerHTML = `
      <div style="width: 380px; min-height: 200px; padding: 20px; font-family: system-ui, -apple-system, sans-serif; background: #ffffff; color: #333333;">
        <div style="display: flex; align-items: center; gap: 12px; margin-bottom: 16px;">
          <div style="width: 12px; height: 12px; border-radius: 50%; background: #10b981;"></div>
          <h1 style="margin: 0; font-size: 18px; font-weight: 600;">Suya Bot Extension</h1>
        </div>
        
        <div style="margin-bottom: 16px;">
          <p style="margin: 0; font-size: 14px; color: #666;">
            Suya is ready to assist you with intelligent page analysis and automation.
          </p>
        </div>
        
        <div style="display: flex; gap: 8px; flex-wrap: wrap;">
          <button id="analyze-btn" style="padding: 8px 16px; border: 1px solid #d1d5db; border-radius: 6px; background: #ffffff; color: #374151; font-size: 12px; cursor: pointer;">
            Analyze Page
          </button>
          <button id="settings-btn" style="padding: 8px 16px; border: 1px solid #d1d5db; border-radius: 6px; background: #ffffff; color: #374151; font-size: 12px; cursor: pointer;">
            Settings
          </button>
        </div>
      </div>
    `;
    
    // Add event listeners
    document.getElementById('analyze-btn').addEventListener('click', function() {
      console.log('Analyze page clicked');
      // Send message to background script
      chrome.runtime.sendMessage({ type: 'analyze-page' });
    });
    
    document.getElementById('settings-btn').addEventListener('click', function() {
      console.log('Settings clicked');
      chrome.runtime.openOptionsPage();
    });
    
    // Check extension status
    chrome.runtime.sendMessage({ type: 'get-status' }, function(response) {
      console.log('Extension status:', response);
    });
  }
});
