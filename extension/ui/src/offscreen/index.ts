/**
 * Offscreen Document for Suya Bot Extension
 * Handles background processing and API calls
 */

interface ApiCallData {
  url: string;
  options?: RequestInit;
  method?: string;
}

interface MediaProcessingData {
  type: 'transcribe' | 'generate-speech' | 'process-image';
  mediaData: any;
}

console.log('Suya Bot Offscreen Document initialized');

// Handle messages from background script
chrome.runtime.onMessage.addListener((message: any, sender: any, sendResponse: any) => {
  switch (message.type) {
    case 'process-api-call':
      handleApiCall(message.data as ApiCallData).then(sendResponse);
      return true; // Keep message channel open for async response
      
    case 'process-media':
      handleMediaProcessing(message.data as MediaProcessingData).then(sendResponse);
      return true;
      
    case 'cleanup':
      cleanup();
      sendResponse({ success: true });
      break;
      
    default:
      console.log('Unknown message type:', message.type);
  }
});

async function handleApiCall(data: ApiCallData) {
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
      error: (error as Error).message
    };
  }
}

async function handleMediaProcessing(data: MediaProcessingData) {
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
      error: (error as Error).message
    };
  }
}

async function transcribeAudio(audioData: any) {
  try {
    // Get API keys from storage
    const result = await chrome.storage.local.get(['secureApiKey:openai', 'secureApiKey:anthropic', 'secureApiKey:groq']);
    const apiKey = result['secureApiKey:openai'] || result['secureApiKey:groq'];
    
    if (!apiKey) {
      throw new Error('No transcription API key available');
    }
    
    // Use OpenAI Whisper API for transcription
    const response = await fetch('https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${atob(apiKey)}`,
        'Content-Type': 'multipart/form-data'
      },
      body: audioData // Should be FormData with audio file
    });
    
    if (!response.ok) {
      throw new Error(`Transcription API error: ${response.statusText}`);
    }
    
    const data = await response.json();
    return {
      success: true,
      transcription: data.text
    };
  } catch (error) {
    console.error('Transcription failed:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown transcription error',
      transcription: ''
    };
  }
}

async function generateSpeech(text: any) {
  try {
    // Get API keys from storage
    const result = await chrome.storage.local.get(['secureApiKey:openai', 'secureApiKey:anthropic', 'secureApiKey:groq']);
    const apiKey = result['secureApiKey:openai'] || result['secureApiKey:groq'];
    
    if (!apiKey) {
      throw new Error('No speech generation API key available');
    }
    
    // Use OpenAI TTS API for speech generation
    const response = await fetch('https://api.openai.com/v1/audio/speech', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${atob(apiKey)}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'tts-1',
        input: text,
        voice: 'alloy',
        response_format: 'mp3'
      })
    });
    
    if (!response.ok) {
      throw new Error(`Speech API error: ${response.statusText}`);
    }
    
    const audioBlob = await response.blob();
    const audioUrl = URL.createObjectURL(audioBlob);
    
    return {
      success: true,
      audioUrl
    };
  } catch (error) {
    console.error('Speech generation failed:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown speech generation error',
      audioUrl: ''
    };
  }
}

async function processImage(imageData: any) {
  try {
    // Get API keys from storage
    const result = await chrome.storage.local.get(['secureApiKey:openai', 'secureApiKey:anthropic']);
    const apiKey = result['secureApiKey:openai'] || result['secureApiKey:anthropic'];
    
    if (!apiKey) {
      throw new Error('No image processing API key available');
    }
    
    // Use OpenAI Vision API for image processing
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${atob(apiKey)}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'gpt-4-vision-preview',
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text: 'Analyze this image and describe what you see.'
              },
              {
                type: 'image_url',
                image_url: {
                  url: imageData
                }
              }
            ]
          }
        ],
        max_tokens: 300
      })
    });
    
    if (!response.ok) {
      throw new Error(`Vision API error: ${response.statusText}`);
    }
    
    const data = await response.json();
    return {
      success: true,
      processedData: data.choices[0]?.message?.content || 'No analysis available'
    };
  } catch (error) {
    console.error('Image processing failed:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown image processing error',
      processedData: ''
    };
  }
}

function cleanup() {
  console.log('Offscreen document cleanup');
  // Clean up any resources
}

// Notify background script that offscreen document is ready
chrome.runtime.sendMessage({ 
  type: 'offscreen-ready' 
});
