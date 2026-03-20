import React, { useState, useEffect } from 'react';
import ReactDOM from 'react-dom/client';
import { useExtensionStore } from '@/store/extension-store';
import { sendMessageToBackground } from '@/lib/utils';
import { Mic, MicOff, Volume2, VolumeX, Settings, Activity, Zap, FileText, Download, MessageSquare, Video, Music, Mail, Search, CheckCircle } from 'lucide-react';

interface Skill {
  name: string;
  displayName: string;
  description: string;
  icon: React.ReactNode;
  isActive: boolean;
  category: string;
}

const Popup: React.FC = () => {
  const skills = useExtensionStore((state) => state.skills);
  const activeSkills = useExtensionStore((state) => state.activeSkills);
  const isListening = useExtensionStore((state) => state.isListening);
  const isSpeaking = useExtensionStore((state) => state.isSpeaking);
  const isLoading = useExtensionStore((state) => state.isLoading);
  const error = useExtensionStore((state) => state.error);
  
  const activateSkill = useExtensionStore((state) => state.activateSkill);
  const deactivateSkill = useExtensionStore((state) => state.deactivateSkill);
  const setListening = useExtensionStore((state) => state.setListening);
  const setSpeaking = useExtensionStore((state) => state.setSpeaking);
  const setLoading = useExtensionStore((state) => state.setLoading);
  const setError = useExtensionStore((state) => state.setError);

  const [extensionStatus, setExtensionStatus] = useState<'online' | 'offline' | 'error'>('online');
  const [lastCommand, setLastCommand] = useState<string>('');

  useEffect(() => {
    // Load initial data
    loadExtensionData();
    
    // Set up message listener
    chrome.runtime.onMessage.addListener(handleMessage);
    
    return () => {
      chrome.runtime.onMessage.removeListener(handleMessage);
    };
  }, []);

  const loadExtensionData = async () => {
    try {
      setLoading(true);
      
      // Get skills status
      const response = await sendMessageToBackground('getStatus', 'ui-assistant');
      if (response.skills) {
        useExtensionStore.getState().updateSkills(response.skills);
      }
      
      // Check extension health
      const health = await sendMessageToBackground('getHealth', 'ui-assistant');
      setExtensionStatus(health.status === 'healthy' ? 'online' : 'error');
      
    } catch (err) {
      console.error('Failed to load extension data:', err);
      setError('Failed to load extension data');
      setExtensionStatus('error');
    } finally {
      setLoading(false);
    }
  };

  const handleMessage = (message: any, sender: any, sendResponse: any) => {
    switch (message.type) {
      case 'voice-status':
        setListening(message.isListening);
        setSpeaking(message.isSpeaking);
        break;
      case 'command-processed':
        setLastCommand(message.command);
        break;
      case 'skill-status-changed':
        // Refresh skills list
        loadExtensionData();
        break;
    }
  };

  const handleVoiceToggle = async () => {
    try {
      if (isListening) {
        await sendMessageToBackground('stopListening', 'voice-interface');
        setListening(false);
      } else {
        await sendMessageToBackground('startListening', 'voice-interface');
        setListening(true);
      }
    } catch (err) {
      console.error('Failed to toggle voice:', err);
      setError('Failed to toggle voice recognition');
    }
  };

  const handleSkillToggle = async (skillName: string) => {
    try {
      const skill = skills.find(s => s.name === skillName);
      if (skill) {
        if (skill.isActive) {
          await sendMessageToBackground('deactivateSkill', 'background-tasks', { skillName });
          deactivateSkill(skillName);
        } else {
          await sendMessageToBackground('activateSkill', 'background-tasks', { skillName });
          activateSkill(skillName);
        }
      }
    } catch (err) {
      console.error('Failed to toggle skill:', err);
      setError('Failed to toggle skill');
    }
  };

  const handleQuickAction = async (action: string) => {
    try {
      setLoading(true);
      await sendMessageToBackground('quickAction', 'ui-assistant', { action });
    } catch (err) {
      console.error('Failed to execute quick action:', err);
      setError('Failed to execute action');
    } finally {
      setLoading(false);
    }
  };

  const getSkillIcon = (skillName: string) => {
    const iconMap: Record<string, React.ReactNode> = {
      'background-tasks': <Activity className="w-5 h-5" />,
      'server-skills': <Download className="w-5 h-5" />,
      'mail-skills': <Mail className="w-5 h-5" />,
      'video-generation': <Video className="w-5 h-5" />,
      'audio-generation': <Music className="w-5 h-5" />,
      'chat-skills': <MessageSquare className="w-5 h-5" />,
      'application-writing': <FileText className="w-5 h-5" />,
      'document-skills': <FileText className="w-5 h-5" />,
      'qa-testing': <Search className="w-5 h-5" />,
      'ui-assistant': <Zap className="w-5 h-5" />
    };
    return iconMap[skillName] || <Settings className="w-5 h-5" />;
  };

  const getSkillDisplayName = (skillName: string) => {
    const nameMap: Record<string, string> = {
      'background-tasks': 'Background Tasks',
      'server-skills': 'Server Skills',
      'mail-skills': 'Mail Skills',
      'video-generation': 'Video Generation',
      'audio-generation': 'Audio Generation',
      'chat-skills': 'Chat Skills',
      'application-writing': 'Application Writing',
      'document-skills': 'Document Skills',
      'qa-testing': 'QA Testing',
      'ui-assistant': 'UI Assistant'
    };
    return nameMap[skillName] || skillName;
  };

  const getSkillDescription = (skillName: string) => {
    const descMap: Record<string, string> = {
      'background-tasks': 'Manage background processes and task scheduling',
      'server-skills': 'Remote download, transcription, and note-taking',
      'mail-skills': 'Email management and smart composition',
      'video-generation': 'AI-powered video creation and editing',
      'audio-generation': 'Music generation and audio processing',
      'chat-skills': 'Multi-platform chat integration',
      'application-writing': 'Smart form filling and applications',
      'document-skills': 'Document creation and management',
      'qa-testing': 'Automated testing and quality assurance',
      'ui-assistant': 'Contextual help and interface assistance'
    };
    return descMap[skillName] || 'AI-powered functionality';
  };

  const getVoiceButtonState = () => {
    if (isListening) return 'listening';
    if (isSpeaking) return 'speaking';
    return 'idle';
  };

  const getVoiceButtonIcon = () => {
    if (isListening) return <MicOff className="w-5 h-5" />;
    if (isSpeaking) return <Volume2 className="w-5 h-5" />;
    return <Mic className="w-5 h-5" />;
  };

  const getStatusColor = () => {
    switch (extensionStatus) {
      case 'online': return 'bg-green-500';
      case 'offline': return 'bg-gray-500';
      case 'error': return 'bg-red-500';
      default: return 'bg-gray-500';
    }
  };

  if (isLoading && skills.length === 0) {
    return (
      <div className="popup-container flex items-center justify-center">
        <div className="loading-spinner"></div>
      </div>
    );
  }

  return (
    <div className="popup-container">
      {/* Header */}
      <div className="header">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <div className={`status-indicator ${extensionStatus}`}></div>
            <h1 className="text-lg font-semibold">AI Bot Extension</h1>
          </div>
          <button
            onClick={() => chrome.runtime.openOptionsPage()}
            className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-800"
          >
            <Settings className="w-4 h-4" />
          </button>
        </div>
        
        {/* Voice Controls */}
        <div className="voice-controls">
          <button
            onClick={handleVoiceToggle}
            className={`voice-button ${getVoiceButtonState()}`}
            disabled={isLoading}
          >
            {getVoiceButtonIcon()}
          </button>
          <div className="flex-1">
            <div className="text-sm font-medium">
              {isListening ? 'Listening...' : isSpeaking ? 'Speaking...' : 'Voice Control'}
            </div>
            {lastCommand && (
              <div className="text-xs text-muted-foreground truncate">
                Last: {lastCommand}
              </div>
            )}
          </div>
        </div>
        
        {error && (
          <div className="mt-2 p-2 bg-red-100 dark:bg-red-900 border border-red-200 dark:border-red-800 rounded text-sm text-red-800 dark:text-red-200">
            {error}
          </div>
        )}
      </div>

      {/* Content */}
      <div className="content">
        {/* Active Skills Summary */}
        <div className="mb-4">
          <h2 className="text-sm font-medium text-muted-foreground mb-2">
            Active Skills ({activeSkills.length}/{skills.length})
          </h2>
          <div className="flex flex-wrap gap-1">
            {activeSkills.map((skill) => (
              <div
                key={skill.name}
                className="inline-flex items-center gap-1 px-2 py-1 bg-primary/10 text-primary text-xs rounded-full"
              >
                {getSkillIcon(skill.name)}
                <span>{getSkillDisplayName(skill.name)}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Skills Grid */}
        <div className="mb-4">
          <h2 className="text-sm font-medium text-muted-foreground mb-2">All Skills</h2>
          <div className="skill-grid">
            {skills.map((skill) => (
              <div
                key={skill.name}
                onClick={() => handleSkillToggle(skill.name)}
                className={`skill-item ${skill.isActive ? 'active' : ''}`}
              >
                <div className="flex items-center gap-2 mb-1">
                  {getSkillIcon(skill.name)}
                  <div className="flex-1">
                    <div className="text-sm font-medium truncate">
                      {getSkillDisplayName(skill.name)}
                    </div>
                  </div>
                  <div className={`w-2 h-2 rounded-full ${
                    skill.isActive ? 'bg-green-500' : 'bg-gray-300'
                  }`}></div>
                </div>
                <div className="text-xs text-muted-foreground line-clamp-2">
                  {getSkillDescription(skill.name)}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Quick Actions */}
        <div className="quick-actions">
          <button
            onClick={() => handleQuickAction('create-task')}
            className="quick-action-button"
          >
            <Activity className="w-3 h-3 mr-1" />
            Task
          </button>
          <button
            onClick={() => handleQuickAction('create-note')}
            className="quick-action-button"
          >
            <FileText className="w-3 h-3 mr-1" />
            Note
          </button>
          <button
            onClick={() => handleQuickAction('open-sidepanel')}
            className="quick-action-button"
          >
            <Settings className="w-3 h-3 mr-1" />
            Panel
          </button>
          <button
            onClick={() => handleQuickAction('show-stats')}
            className="quick-action-button"
          >
            <Activity className="w-3 h-3 mr-1" />
            Stats
          </button>
        </div>
      </div>
    </div>
  );
};

// Initialize React app
const root = ReactDOM.createRoot(document.getElementById('root')!);
root.render(<Popup />);
