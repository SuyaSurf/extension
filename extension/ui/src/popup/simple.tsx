import React from 'react';
import ReactDOM from 'react-dom/client';
import SuyaBot, { SuyaMode } from '@/components/SuyaBot';

type PopupCommand = 'analyze-page' | 'highlight-forms' | 'highlight-buttons' | 'sleep' | 'wake' | 'fill-forms' | 'scan-forms' | 'save-profile' | 'preview-fill';

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
        <div>
          <h1 style={{ margin: 0, fontSize: '18px', fontWeight: 700 }}>Suya Bot</h1>
          <p style={{ margin: '4px 0 0', fontSize: '12px', color: '#6b4b3d', lineHeight: 1.5 }}>
            Popup is only for decisions and content presentation. Interaction stays in-page.
          </p>
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

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
        {[
          ['Analyze page', 'analyze-page'],
          ['Scan forms', 'scan-forms'],
          ['Fill forms', 'fill-forms'],
          ['Preview fill', 'preview-fill'],
          ['Save profile', 'save-profile'],
          ['Highlight forms', 'highlight-forms'],
          ['Highlight actions', 'highlight-buttons'],
          [mode === 'sleeping' ? 'Wake Suya' : 'Sleep Suya', mode === 'sleeping' ? 'wake' : 'sleep']
        ].map(([label, command]) => (
          <button
            key={String(command)}
            onClick={() => runCommand(command as PopupCommand)}
            style={{
              padding: '11px 12px',
              borderRadius: '12px',
              border: '1px solid rgba(204, 123, 53, 0.28)',
              background: '#fff',
              color: '#66351a',
              fontSize: '12px',
              fontWeight: 600,
              cursor: command === 'fill-forms' || command === 'scan-forms' ? 'pointer' : 'pointer'
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
