import React, { useState, useRef, useEffect, useCallback } from 'react';
import './SuyaInputInterface.css';
import { CharacterMessenger } from '../types';

export interface SuyaInputProps {
  isActive: boolean;
  onClose: () => void;
  onSubmit: (input: string, isVoice: boolean) => void;
  isListening?: boolean;
  listeningState?: 'idle' | 'starting' | 'listening' | 'processing' | 'error';
}

interface Suggestion {
  id: string;
  text: string;
  icon: string;
  action: () => void;
}

interface Result {
  id: string;
  type: 'text' | 'action' | 'card';
  content: string;
  actions?: Array<{
    label: string;
    action: () => void;
    variant?: 'primary' | 'secondary';
  }>;
}

export const SuyaInputInterface: React.FC<SuyaInputProps> = ({
  isActive,
  onClose,
  onSubmit,
  isListening = false,
  listeningState = 'idle'
}) => {
  const [input, setInput] = useState('');
  const [isVoiceMode, setIsVoiceMode] = useState(false);
  const [results, setResults] = useState<Result[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(true);
  const [isProcessing, setIsProcessing] = useState(false);
  const [voiceWaveIntensity, setVoiceWaveIntensity] = useState(0);
  
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Auto-resize textarea
  useEffect(() => {
    if (inputRef.current) {
      inputRef.current.style.height = 'auto';
      inputRef.current.style.height = `${Math.min(inputRef.current.scrollHeight, 120)}px`;
    }
  }, [input]);

  // Focus input when activated
  useEffect(() => {
    if (isActive && inputRef.current && !isVoiceMode) {
      inputRef.current.focus();
    }
  }, [isActive, isVoiceMode]);

  // Listen for bot responses from character-ui
  useEffect(() => {
    const handleBotResponse = (event: Event) => {
      const customEvent = event as CustomEvent;
      const { results } = customEvent.detail;
      
      if (results && Array.isArray(results)) {
        setResults(results);
        setIsProcessing(false);
        setShowSuggestions(false);
      }
    };

    window.addEventListener('suya-bot-response', handleBotResponse);
    
    return () => {
      window.removeEventListener('suya-bot-response', handleBotResponse);
    };
  }, []);

  // Real voice wave animation using Web Audio API
  useEffect(() => {
    if (listeningState === 'listening') {
      let audioContext: AudioContext | null = null;
      let analyser: AnalyserNode | null = null;
      let microphone: MediaStreamAudioSourceNode | null = null;
      let stream: MediaStream | null = null;
      let animationId: number | null = null;
      
      const startAudioCapture = async () => {
        try {
          // Request microphone access
          stream = await navigator.mediaDevices.getUserMedia({ 
            audio: {
              echoCancellation: true,
              noiseSuppression: true,
              autoGainControl: true
            }
          });
          
          // Set up audio context and analyser
          audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
          analyser = audioContext.createAnalyser();
          microphone = audioContext.createMediaStreamSource(stream);
          
          microphone.connect(analyser);
          analyser.fftSize = 256;
          analyser.smoothingTimeConstant = 0.8;
          
          const updateVoiceIntensity = () => {
            if (analyser && listeningState === 'listening') {
              const dataArray = new Uint8Array(analyser.frequencyBinCount);
              analyser.getByteFrequencyData(dataArray);
              
              // Calculate average intensity with bass emphasis
              const bassEnd = Math.floor(dataArray.length * 0.3);
              const bassAverage = dataArray.slice(0, bassEnd).reduce((a, b) => a + b, 0) / bassEnd;
              const overallAverage = dataArray.reduce((a, b) => a + b, 0) / dataArray.length;
              
              // Combine bass and overall for more natural visualization
              const intensity = (bassAverage * 0.7 + overallAverage * 0.3) / 255 * 100;
              setVoiceWaveIntensity(Math.min(100, Math.max(0, intensity)));
              
              animationId = requestAnimationFrame(updateVoiceIntensity);
            }
          };
          
          updateVoiceIntensity();
        } catch (error) {
          console.error('Audio capture failed:', error);
          setVoiceWaveIntensity(0);
          // Fall back to subtle animation if audio access fails
          const fallbackInterval = setInterval(() => {
            setVoiceWaveIntensity(prev => prev > 0 ? prev * 0.9 : Math.random() * 20);
          }, 200);
          
          // Store interval for cleanup
          (audioContext as any) = { close: () => clearInterval(fallbackInterval) };
        }
      };
      
      startAudioCapture();
      
      return () => {
        // Cleanup audio resources
        if (animationId) cancelAnimationFrame(animationId);
        if (stream) stream.getTracks().forEach(track => track.stop());
        if (audioContext && audioContext.close) audioContext.close();
        if (microphone) microphone.disconnect();
        if (analyser) analyser.disconnect();
      };
    } else {
      setVoiceWaveIntensity(0);
    }
  }, [listeningState]);

  const handleSubmit = useCallback(async () => {
    if (!input.trim() && !isVoiceMode) return;
    
    setIsProcessing(true);
    onSubmit(input, isVoiceMode);
    
    try {
      // Use CharacterMessenger to send to bot skills
      if (window.CharacterMessenger) {
        await window.CharacterMessenger.sendMessage(input, {
          mode: 'thinking',
          isThinkingHard: true
        });
      }
      
      // Emit event for skill processing
      window.dispatchEvent(new CustomEvent('suya-bot-input', {
        detail: { message: input, isVoice: isVoiceMode }
      }));
      
      // Clear input and suggestions immediately
      setInput('');
      setShowSuggestions(false);
      
    } catch (error) {
      console.error('Bot processing failed:', error);
      // Show error result as fallback
      const newResults: Result[] = [
        {
          id: 'error',
          type: 'text',
          content: 'Sorry, I had trouble processing that. Please try again.',
          actions: [
            { label: 'Retry', action: () => setInput(input), variant: 'primary' }
          ]
        }
      ];
      setResults(newResults);
    } finally {
      setIsProcessing(false);
    }
  }, [input, isVoiceMode, onSubmit]);

  const handleVoiceToggle = useCallback(() => {
    if (isVoiceMode) {
      setIsVoiceMode(false);
      return;
    }
    
    setIsVoiceMode(true);
    setInput('');
    // Start voice recording
    setTimeout(() => {
      if (listeningState === 'idle') {
        onSubmit('', true);
      }
    }, 500);
  }, [isVoiceMode, listeningState, onSubmit]);

  const handleKeyPress = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    } else if (e.key === 'Escape') {
      onClose();
    }
  }, [handleSubmit, onClose]);

  const suggestions: Suggestion[] = [
    { id: '1', text: 'Help me write an email', icon: '✉️', action: () => setInput('Help me write an email') },
    { id: '2', text: 'Summarize this page', icon: '📄', action: () => setInput('Summarize this page') },
    { id: '3', text: 'Translate to Spanish', icon: '🌐', action: () => setInput('Translate to Spanish') },
    { id: '4', text: 'Explain this concept', icon: '💡', action: () => setInput('Explain this concept') }
  ];

  if (!isActive) return null;

  return (
    <div className="suya-input-overlay" onClick={onClose}>
      <div className="suya-input-container" onClick={e => e.stopPropagation()}>
        {/* Animated background elements */}
        <div className="input-bg-elements">
          <div className="floating-orb orb-1" />
          <div className="floating-orb orb-2" />
          <div className="floating-orb orb-3" />
        </div>

        {/* Main input area */}
        <div className="input-main-area">
          <div className="input-header">
            <div className="suya-mini-icon">🍢</div>
            <h3 className="input-title">What can I help you with?</h3>
            <button className="close-btn" onClick={onClose} aria-label="Close">
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                <path d="M12 4L4 12M4 4L12 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
              </svg>
            </button>
          </div>

          {/* Input section */}
          <div className="input-section">
            <div className={`input-wrapper ${isVoiceMode ? 'voice-mode' : ''}`}>
              {!isVoiceMode ? (
                <textarea
                  ref={inputRef}
                  value={input}
                  onChange={e => setInput(e.target.value)}
                  onKeyPress={handleKeyPress}
                  placeholder="Type your message or press the microphone..."
                  className="text-input"
                  rows={1}
                  disabled={isProcessing}
                />
              ) : (
                <div className="voice-input-area">
                  <div className="voice-visualizer">
                    <div className="voice-center">
                      <div className={`voice-pulse ${listeningState}`} />
                      {listeningState === 'listening' && (
                        <div className="voice-waves">
                          {[...Array(5)].map((_, i) => (
                            <div 
                              key={i} 
                              className="wave-ring"
                              style={{ 
                                animationDelay: `${i * 0.1}s`,
                                transform: `scale(${1 + (voiceWaveIntensity / 100) * 0.5})`
                              }}
                            />
                          ))}
                        </div>
                      )}
                    </div>
                    <div className="voice-status">
                      {listeningState === 'starting' && 'Getting ready...'}
                      {listeningState === 'listening' && 'Listening...'}
                      {listeningState === 'processing' && 'Processing...'}
                      {listeningState === 'error' && 'Try again'}
                    </div>
                  </div>
                </div>
              )}
              
              <div className="input-actions">
                <button
                  className={`voice-toggle ${isVoiceMode ? 'active' : ''}`}
                  onClick={handleVoiceToggle}
                  disabled={isProcessing}
                  aria-label={isVoiceMode ? 'Stop voice input' : 'Start voice input'}
                >
                  <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                    <path d="M10 2C10 2 15 7 15 10C15 13 12.5 15 10 15C7.5 15 5 13 5 10C5 7 10 2 10 2Z" 
                          fill="currentColor" opacity="0.3"/>
                    <path d="M10 5V10M7 8H13" 
                          stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                  </svg>
                </button>
                
                {!isVoiceMode && (
                  <button
                    className="send-btn"
                    onClick={handleSubmit}
                    disabled={!input.trim() || isProcessing}
                    aria-label="Send message"
                  >
                    <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
                      <path d="M2 9L16 2L9 16L7 10L2 9Z" fill="currentColor"/>
                    </svg>
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Processing indicator */}
          {isProcessing && (
            <div className="processing-indicator">
              <div className="processing-dots">
                <span></span>
                <span></span>
                <span></span>
              </div>
              <span className="processing-text">Thinking...</span>
            </div>
          )}

          {/* Suggestions */}
          {showSuggestions && !input && !isVoiceMode && (
            <div className="suggestions-grid">
              {suggestions.map(suggestion => (
                <button
                  key={suggestion.id}
                  className="suggestion-chip"
                  onClick={() => {
                    setInput(suggestion.text);
                    setShowSuggestions(false);
                  }}
                >
                  <span className="suggestion-icon">{suggestion.icon}</span>
                  <span className="suggestion-text">{suggestion.text}</span>
                </button>
              ))}
            </div>
          )}

          {/* Results */}
          {results.length > 0 && (
            <div className="results-container">
              {results.map(result => (
                <div key={result.id} className={`result-item result-${result.type}`}>
                  <div className="result-content">{result.content}</div>
                  {result.actions && (
                    <div className="result-actions">
                      {result.actions.map((action, idx) => (
                        <button
                          key={idx}
                          className={`action-btn ${action.variant || 'secondary'}`}
                          onClick={action.action}
                        >
                          {action.label}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer hints */}
        <div className="input-footer">
          <div className="footer-hints">
            <span className="hint">Press Enter to send</span>
            <span className="hint">Shift+Enter for new line</span>
            <span className="hint">Esc to close</span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SuyaInputInterface;
