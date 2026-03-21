/**
 * Character Messenger for QA Skills
 * Provides a simple interface for QA skills to send messages to the character UI
 */

window.CharacterMessenger = (() => {
  const _queue = [];
  const MAX_QUEUE_SIZE = 50; // Prevent memory leaks
  let _characterReady = false;

  // Wait for character UI to be ready
  const waitForCharacter = () => {
    return new Promise((resolve) => {
      const checkCharacter = () => {
        try {
          // More robust character root detection with null checks
          const characterRoot = document?.getElementById?.('suya-character-ui-root');
          if (characterRoot && characterRoot._reactRootContainer) {
            _characterReady = true;
            resolve();
          } else {
            setTimeout(checkCharacter, 100);
          }
        } catch (error) {
          // Fallback if document access fails
          setTimeout(checkCharacter, 100);
        }
      };
      checkCharacter();
    });
  };

  // Send message to character UI
  const sendMessage = async (message, options = {}) => {
    const {
      mode = null,
      isThinkingHard = false,
      isShocked = false,
      isBusy = false,
      duration = 3000
    } = options;

    // Prevent queue overflow
    if (_queue.length >= MAX_QUEUE_SIZE) {
      _queue.shift(); // Remove oldest message
    }

    // Queue the message if character isn't ready yet
    _queue.push({ message, options });

    if (!_characterReady) {
      await waitForCharacter();
      // Process queued messages
      while (_queue.length > 0) {
        const queued = _queue.shift();
        _dispatchMessage(queued.message, queued.options);
      }
    } else {
      _dispatchMessage(message, options);
    }
  };

  // Internal message dispatch
  const _dispatchMessage = (message, options) => {
    try {
      // Safe event dispatch with fallback
      if (typeof window !== 'undefined' && window.dispatchEvent) {
        window.dispatchEvent(new CustomEvent('suya-character-message', {
          detail: { message, ...options }
        }));
      }
    } catch (error) {
      // Silently fail if event dispatch fails
      console.warn('Character messenger dispatch failed:', error);
    }
  };

  // Progress reporting for long operations
  const reportProgress = (operation, progress, message) => {
    sendMessage(`${operation}: ${message}`, {
      isThinkingHard: true,
      isBusy: true
    });
  };

  // Success reporting
  const reportSuccess = (operation, details = '') => {
    const message = details ? `${operation} completed! ${details}` : `${operation} completed!`;
    sendMessage(message, { mode: 'awake' });
  };

  // Error reporting
  const reportError = (operation, error) => {
    const message = `${operation} failed: ${error}`;
    sendMessage(message, { isShocked: true });
  };

  // Cleanup method
  const cleanup = () => {
    _queue.length = 0;
    _characterReady = false;
  };

  return {
    sendMessage,
    reportProgress,
    reportSuccess,
    reportError,
    cleanup
  };
})();
