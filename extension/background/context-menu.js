/**
 * Context Menu Handler for Suya Bot Extension
 * Creates and manages right-click context menu options
 */

class ContextMenuHandler {
  constructor() {
    this.contextMenuItems = [
      // Application Writing Skill Items
      {
        id: 'application-writing-fill-form',
        title: 'Fill Form with AI',
        contexts: ['page', 'editable'],
        action: 'fill-forms'
      },
      {
        id: 'application-writing-scan-form',
        title: 'Scan Form Fields',
        contexts: ['page'],
        action: 'scan-forms'
      },
      {
        id: 'application-writing-save-profile',
        title: 'Save Profile Data',
        contexts: ['selection', 'editable'],
        action: 'save-profile'
      },
      {
        id: 'application-writing-preview-fill',
        title: 'Preview Form Fill',
        contexts: ['page'],
        action: 'preview-fill'
      },
      // QA Testing Items
      {
        id: 'qa-test-page',
        title: 'Test This Page',
        contexts: ['page'],
        action: 'run-qa-review'
      },
      {
        id: 'qa-quick-test',
        title: 'Quick Test',
        contexts: ['page'],
        action: 'quick-test'
      },
      {
        id: 'qa-screenshot',
        title: 'Screenshot Page',
        contexts: ['page'],
        action: 'take-screenshot'
      },
      {
        id: 'qa-test-element',
        title: 'Test This Element',
        contexts: ['selection', 'link', 'image', 'video', 'audio'],
        action: 'test-element'
      }
    ];
  }

  async initialize() {
    // Remove existing context menus
    await chrome.contextMenus.removeAll();

    // Create QA testing context menu items
    for (const item of this.contextMenuItems) {
      chrome.contextMenus.create({
        id: item.id,
        title: item.title,
        contexts: item.contexts
      });
    }

    // Add click handler
    chrome.contextMenus.onClicked.addListener((info, tab) => {
      this.handleContextMenuClick(info, tab);
    });
  }

  async handleContextMenuClick(info, tab) {
    const menuItem = this.contextMenuItems.find(item => item.id === info.menuItemId);
    if (!menuItem || !tab?.id) return;

    try {
      // Send command to content script
      await chrome.tabs.sendMessage(tab.id, {
        type: 'suya-popup-command',
        command: menuItem.action
      });
    } catch (error) {
      console.error('Failed to execute context menu action:', error);
    }
  }

  async cleanup() {
    await chrome.contextMenus.removeAll();
  }
}

// Export for use in service worker
export { ContextMenuHandler };
