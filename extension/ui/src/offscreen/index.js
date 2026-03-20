/**
 * Offscreen Document for Suya Bot Extension (JavaScript)
 * Handles background processing and API calls
 */

console.log('Suya Bot Offscreen Document initialized');

// Handle messages from background script
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  switch (message.type) {
    case 'process-api-call':
      handleApiCall(message.data).then(sendResponse);
      return true; // Keep message channel open for async response
      
    case 'process-media':
      handleMediaProcessing(message.data).then(sendResponse);
      return true;
      
    case 'cleanup':
      cleanup();
      sendResponse({ success: true });
      break;
      
    default:
      console.log('Unknown message type:', message.type);
  }
});

async function handleApiCall(data) {
  try {
    const { url, options, method = 'GET' } = data;
    
    const response = await fetch(url, {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...options?.headers
      },
      ...options
    });
    
    const result = await response.json();
    
    return {
      success: true,
      data: result,
      status: response.status
    };
  } catch (error) {
    return {
      success: false,
      error: error.message
    };
  }
}

async function handleMediaProcessing(data) {
  try {
    const { type, mediaData } = data;
    
    switch (type) {
      case 'transcribe':
        return await transcribeAudio(mediaData);
      case 'generate-speech':
        return await generateSpeech(mediaData);
      case 'process-image':
        return await processImage(mediaData);
      default:
        throw new Error(`Unknown media processing type: ${type}`);
    }
  } catch (error) {
    return {
      success: false,
      error: error.message
    };
  }
}

async function transcribeAudio(audioData) {
  // Mock transcription - replace with actual API call
  return {
    success: true,
    transcription: "This is a mock transcription of the audio content."
  };
}

async function generateSpeech(text) {
  // Mock speech generation - replace with actual API call
  return {
    success: true,
    audioUrl: "data:audio/wav;base64,mock-audio-data"
  };
}

async function processImage(imageData) {
  // Mock image processing - replace with actual API call
  return {
    success: true,
    processedData: "mock-processed-image-data"
  };
}

function cleanup() {
  console.log('Offscreen document cleanup');
  // Clean up any resources
}

// Notify background script that offscreen document is ready
chrome.runtime.sendMessage({ 
  type: 'offscreen-ready' 
});
