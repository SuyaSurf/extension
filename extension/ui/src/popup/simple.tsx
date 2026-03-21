import React from 'react';
import ReactDOM from 'react-dom/client';
import SuyaBot, { SuyaMode } from '@/components/SuyaBot';

type PopupCommand = 'analyze-page' | 'highlight-forms' | 'highlight-buttons' | 'sleep' | 'wake' | 'fill-forms' | 'scan-forms' | 'save-profile' | 'preview-fill' | 'run-qa-review' | 'quick-test' | 'take-screenshot' | 'schedule-review' | 'test-element' | 'view-history' | 'switch-profile' | 'export-data' | 'compose-email' | 'smart-reply' | 'summarize-thread' | 'send-message';

interface Profile {
  id: string;
  name: string;
  email?: string;
  isActive: boolean;
}

interface FormStatus {
  hasForms: boolean;
  formCount: number;
  fillableFields: number;
  lastScan: number;
}

const sendCommandToActiveTab = async (command: PopupCommand) => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) {
    throw new Error('No active tab available');
  }

  return chrome.tabs.sendMessage(tab.id, {
    type: 'suya-popup-command',
    command
  });
};

const SimplePopup: React.FC = () => {
  const [statusMessage, setStatusMessage] = React.useState('Ready to guide decisions on this page.');
  const [mode, setMode] = React.useState<SuyaMode>('idle');
  const [isBusy, setIsBusy] = React.useState(false);
  const [profiles, setProfiles] = React.useState<Profile[]>([]);
  const [currentProfile, setCurrentProfile] = React.useState<Profile | null>(null);
  const [formStatus, setFormStatus] = React.useState<FormStatus>({
    hasForms: false,
    formCount: 0,
    fillableFields: 0,
    lastScan: 0
  });
  const [showProfileSwitcher, setShowProfileSwitcher] = React.useState(false);
  const [showHistory, setShowHistory] = React.useState(false);

  // Load initial data
  React.useEffect(() => {
    loadProfiles();
    checkFormStatus();
  }, []);

  const loadProfiles = async () => {
    try {
      const response = await chrome.runtime.sendMessage({
        type: 'skill-action',
        skill: 'application-writing',
        action: 'getProfiles',
        data: {}
      });
      
      if (response.success) {
        const profilesData = response.profiles.profiles || [];
        const activeProfile = response.profiles.activeProfile;
        
        setProfiles(profilesData);
        setCurrentProfile(activeProfile);
      }
    } catch (error) {
      console.error('Failed to load profiles:', error);
    }
  };

  const checkFormStatus = async () => {
    try {
      const response = await chrome.runtime.sendMessage({
        type: 'skill-action',
        skill: 'application-writing',
        action: 'getStatus',
        data: {}
      });
      
      if (response.success) {
        setFormStatus({
          hasForms: response.hasForms,
          formCount: response.detectedForms,
          fillableFields: response.detectedForms,
          lastScan: Date.now()
        });
      }
    } catch (error) {
      console.error('Failed to check form status:', error);
    }
  };

  const switchProfile = async (profileId: string) => {
    try {
      const response = await chrome.runtime.sendMessage({
        type: 'skill-action',
        skill: 'application-writing',
        action: 'setActiveProfile',
        data: { profileId }
      });
      
      if (response.success) {
        await loadProfiles();
        setShowProfileSwitcher(false);
        setStatusMessage(`Switched to profile: ${currentProfile?.name}`);
      }
    } catch (error) {
      setStatusMessage('Failed to switch profile');
    }
  };

  const runCommand = async (command: PopupCommand) => {
    try {
      setIsBusy(command === 'analyze-page');
      setMode(command === 'sleep' ? 'sleeping' : 'awake');
      await sendCommandToActiveTab(command);

      if (command === 'analyze-page') {
        setStatusMessage('Suya is analyzing this page and will respond in-page.');
      }

      if (command === 'highlight-forms') {
        setStatusMessage('Highlighting forms in the current page for your decision.');
      }

      if (command === 'highlight-buttons') {
        setStatusMessage('Highlighting primary actions on the current page.');
      }

      if (command === 'scan-forms') {
        setStatusMessage('Suya is scanning forms with advanced analysis...');
      }

      if (command === 'fill-forms') {
        setStatusMessage('Suya is filling forms with your profile data...');
      }

      if (command === 'save-profile') {
        setStatusMessage('Suya is creating a profile from current form data...');
      }

      if (command === 'preview-fill') {
        setStatusMessage('Suya is analyzing what can be filled...');
      }

      if (command === 'sleep') {
        setStatusMessage('Suya has gone to sleep until you wake it.');
      }

      if (command === 'wake') {
        setStatusMessage('Suya is awake and ready for the next instruction.');
      }

      if (command === 'run-qa-review') {
        setStatusMessage('Suya is running a comprehensive UX review...');
      }

      if (command === 'quick-test') {
        setStatusMessage('Suya is running quick QA tests...');
      }

      if (command === 'take-screenshot') {
        setStatusMessage('Suya is capturing a screenshot...');
      }

      if (command === 'schedule-review') {
        setStatusMessage('Review scheduling feature coming soon...');
      }

      if (command === 'test-element') {
        setStatusMessage('Select an element and right-click to test it...');
      }

      if (command === 'view-history') {
        setShowHistory(true);
        setStatusMessage('Loading application history...');
      }

      if (command === 'switch-profile') {
        setShowProfileSwitcher(true);
        setStatusMessage('Select a profile to switch to...');
      }

      if (command === 'export-data') {
        setStatusMessage('Preparing data export...');
        // Trigger export
        try {
          const exportResponse = await chrome.runtime.sendMessage({
            type: 'skill-action',
            skill: 'application-writing',
            action: 'exportAll',
            data: { includeProfiles: true, includeHistory: true, includeTemplates: true }
          });
          
          if (exportResponse.success) {
            const downloadResponse = await chrome.runtime.sendMessage({
              type: 'skill-action',
              skill: 'application-writing',
              action: 'downloadExport',
              data: { exportData: exportResponse.exportData }
            });
            
            if (downloadResponse.success) {
              setStatusMessage(`Export downloaded: ${downloadResponse.filename}`);
            }
          }
        } catch (error) {
          setStatusMessage('Export failed');
        }
      }

      if (command === 'compose-email') {
        setStatusMessage('Opening email composer...');
        await sendCommandToActiveTab('compose-email');
      }

      if (command === 'smart-reply') {
        setStatusMessage('Generating smart reply...');
        await sendCommandToActiveTab('smart-reply');
      }

      if (command === 'summarize-thread') {
        setStatusMessage('Summarizing conversation...');
        await sendCommandToActiveTab('summarize-thread');
      }

      if (command === 'send-message') {
        setStatusMessage('Sending message...');
        await sendCommandToActiveTab('send-message');
      }
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : 'Unable to contact the page UI.');
    } finally {
      if (command === 'analyze-page') {
        window.setTimeout(() => setIsBusy(false), 900);
      } else {
        setIsBusy(false);
      }

      if (command !== 'sleep') {
        window.setTimeout(() => setMode('idle'), 1400);
      }
    }
  };

  return (
    <div
      style={{
        width: '360px',
        minHeight: '320px',
        padding: '18px',
        fontFamily: 'system-ui, -apple-system, sans-serif',
        background: 'linear-gradient(180deg, #fffaf3 0%, #fff 100%)',
        color: '#2e1408',
        display: 'flex',
        flexDirection: 'column',
        gap: '16px'
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
        <div style={{ position: 'relative', width: '32px', height: '32px', transform: 'scale(0.75)', transformOrigin: 'top left' }}>
          <SuyaBot mode={mode} isBusy={isBusy} message={undefined} fixedPosition={{ x: 0, y: 0, corner: 'top-left' }} />
        </div>
        <div style={{ flex: 1 }}>
          <h1 style={{ margin: 0, fontSize: '18px', fontWeight: 700 }}>Suya Bot</h1>
          <p style={{ margin: '4px 0 0', fontSize: '12px', color: '#6b4b3d', lineHeight: 1.5 }}>
            Popup is only for decisions and content presentation. Interaction stays in-page.
          </p>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '4px' }}>
          {formStatus.hasForms && (
            <div style={{
              padding: '4px 8px',
              borderRadius: '8px',
              background: '#4CAF50',
              color: 'white',
              fontSize: '10px',
              fontWeight: 600
            }}>
              {formStatus.formCount} forms
            </div>
          )}
          {currentProfile && (
            <div style={{
              padding: '4px 8px',
              borderRadius: '8px',
              background: '#2196F3',
              color: 'white',
              fontSize: '10px',
              fontWeight: 600,
              maxWidth: '120px',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap'
            }}>
              {currentProfile.name}
            </div>
          )}
        </div>
      </div>

      <div
        style={{
          padding: '14px 16px',
          borderRadius: '16px',
          background: 'rgba(255, 241, 220, 0.75)',
          border: '1px solid rgba(223, 157, 96, 0.28)',
          fontSize: '13px',
          lineHeight: 1.5,
          color: '#53301f'
        }}
      >
        {statusMessage}
      </div>

      {/* Profile Switcher Modal */}
      {showProfileSwitcher && (
        <div style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(0,0,0,0.5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          borderRadius: '16px',
          zIndex: 1000
        }}>
          <div style={{
            background: 'white',
            padding: '20px',
            borderRadius: '12px',
            width: '280px',
            maxHeight: '200px',
            overflowY: 'auto'
          }}>
            <h3 style={{ margin: '0 0 12px', fontSize: '16px' }}>Select Profile</h3>
            {profiles.map(profile => (
              <div
                key={profile.id}
                onClick={() => switchProfile(profile.id)}
                style={{
                  padding: '8px 12px',
                  borderRadius: '8px',
                  background: profile.isActive ? '#2196F3' : '#f5f5f5',
                  color: profile.isActive ? 'white' : '#333',
                  cursor: 'pointer',
                  marginBottom: '4px'
                }}
              >
                <div style={{ fontWeight: 600 }}>{profile.name}</div>
                {profile.email && (
                  <div style={{ fontSize: '12px', opacity: 0.8 }}>{profile.email}</div>
                )}
              </div>
            ))}
            <button
              onClick={() => setShowProfileSwitcher(false)}
              style={{
                marginTop: '12px',
                padding: '8px 16px',
                borderRadius: '8px',
                border: 'none',
                background: '#666',
                color: 'white',
                cursor: 'pointer'
              }}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
        {[
          ['Analyze page', 'analyze-page'],
          ['Scan forms', 'scan-forms'],
          ['Fill forms', 'fill-forms'],
          ['Preview fill', 'preview-fill'],
          ['Save profile', 'save-profile'],
          ['Highlight forms', 'highlight-forms'],
          ['Highlight actions', 'highlight-buttons'],
          ['Compose Email', 'compose-email'],
          ['Smart Reply', 'smart-reply'],
          ['Summarize', 'summarize-thread'],
          ['Send Message', 'send-message'],
          ['QA Review', 'run-qa-review'],
          ['Quick Test', 'quick-test'],
          ['Screenshot', 'take-screenshot'],
          ['Switch Profile', 'switch-profile'],
          ['View History', 'view-history'],
          ['Export Data', 'export-data'],
          [mode === 'sleeping' ? 'Wake Suya' : 'Sleep Suya', mode === 'sleeping' ? 'wake' : 'sleep']
        ].map(([label, command]) => (
          <button
            key={String(command)}
            onClick={() => runCommand(command as PopupCommand)}
            style={{
              padding: '11px 12px',
              borderRadius: '12px',
              border: '1px solid rgba(204, 123, 53, 0.28)',
              background: command === 'fill-forms' && formStatus.hasForms ? '#4CAF50' : 
                       command === 'scan-forms' && formStatus.hasForms ? '#2196F3' : 
                       (command === 'compose-email' || command === 'smart-reply' || command === 'summarize-thread' || command === 'send-message') ? '#FF9800' : '#fff',
              color: (command === 'fill-forms' && formStatus.hasForms) || 
                     (command === 'scan-forms' && formStatus.hasForms) || 
                     (command === 'compose-email' || command === 'smart-reply' || command === 'summarize-thread' || command === 'send-message') ? 'white' : '#66351a',
              fontSize: '12px',
              fontWeight: 600,
              cursor: 'pointer'
            }}
          >
            {label}
          </button>
        ))}
      </div>
    </div>
  );
};

// Initialize React app
const root = ReactDOM.createRoot(document.getElementById('root')!);
root.render(<SimplePopup />);
