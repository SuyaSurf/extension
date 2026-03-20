# Suya Bot UI Integration Guide

This guide explains how to integrate with the **character-first UI** model used by the Suya Bot extension. It covers the communication patterns, component usage, and recommended architecture for extensions that want to adopt this approach.

## Overview

The Suya Bot UI follows these principles:

- **Character as the only user-facing interface** – All interactions happen through the in-page character
- **Popup is for decisions and content presentation only** – Minimal launcher/status shell
- **Centralized communication wiring** – All skills/features route through the character UI
- **Awake/Idle/Sleeping modes** – Visual state management through character expressions
- **Compact expressive animations** – Face-first design with subtle hand gestures

## Architecture

```
┌─────────────────┐    chrome.runtime.sendMessage    ┌──────────────────────┐
│   Popup Shell   │ ───────────────────────────────► │   Content Script     │
│ (decisions only)│                                    │ (character runtime)  │
└─────────────────┘                                    └──────────────────────┘
                                                              │
                                                              ▼
                                                    ┌──────────────────────┐
                                                    │   SuyaBot Component   │
                                                    │ (React)               │
                                                    └──────────────────────┘
```

## Core Components

### 1. SuyaBot Component (`@/components/SuyaBot`)

The main character UI component with these props:

```tsx
interface SuyaBotProps {
  isActive?: boolean;           // Active/engaged state
  isBusy?: boolean;             // Working/processing
  isListening?: boolean;       // Voice input mode
  isShocked?: boolean;          // Surprise/error state
  isThinkingHard?: boolean;    // Deep processing
  mode?: SuyaMode;             // 'awake' | 'idle' | 'sleeping'
  message?: string;             // Bubble message text
  onInteraction?: () => void;  // Click/tap handler
  highlightTarget?: HTMLElement | null; // Element to highlight
  fixedPosition?: Position;     // Override auto-positioning
}
```

#### Visual Modes

- **awake**: Character is alert and responsive
- **idle**: Default resting state, slightly subdued
- **sleeping**: Closed eyes, reduced opacity, 'Z' effect

#### Expressions

- **neutral**: Default face
- **happy**: Engaged/positive state
- **thinking**: Light processing
- **eating**: Busy with hands+skewer animation
- **listening**: Voice input mode with rings
- **thinking_hard**: Deep processing with sweat drops
- **shocked**: Error/surprise with hands covering mouth
- **sleeping**: Closed eyes with 'Z' effect

### 2. Content Script Runtime

The content script mounts the character and handles:

- Page context analysis
- Popup command routing
- Highlight management
- Mode transitions
- Background communication

### 3. Popup Shell

Minimal popup that only:
- Shows current character state
- Sends high-level commands to content script
- Displays status messages
- Provides sleep/wake controls

## Integration Steps

### Step 1: Adopt the Character-First Pattern

Remove or deprecate:
- Side panels
- Complex popup UIs
- Multiple interaction surfaces

Replace with:
- Single in-page character
- Minimal decision-focused popup
- Centralized message routing

### Step 2: Set Up Communication

#### Popup to Content Script

```tsx
// In popup
const sendCommand = async (command: PopupCommand) => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) return;
  
  return chrome.tabs.sendMessage(tab.id, {
    type: 'suya-popup-command',
    command
  });
};
```

#### Content Script Message Handler

```tsx
// In content script
chrome.runtime.onMessage.addListener((message: RuntimeMessage) => {
  if (message.type === 'suya-popup-command' && message.command) {
    runCommand(message.command);
  }
});
```

### Step 3: Implement Character Runtime

```tsx
const CharacterRuntime: React.FC = () => {
  const [mode, setMode] = React.useState<SuyaMode>('idle');
  const [message, setMessage] = React.useState('Character ready.');
  const [isBusy, setIsBusy] = React.useState(false);
  const [highlightTarget, setHighlightTarget] = React.useState<HTMLElement | null>(null);

  const runCommand = (command: PopupCommand) => {
    // Handle analyze, highlight, sleep, wake commands
    // Update mode, message, and visual state accordingly
  };

  return (
    <SuyaBot
      mode={mode}
      isActive={mode === 'awake'}
      isBusy={isBusy}
      message={message}
      highlightTarget={highlightTarget}
      onInteraction={() => {
        // Handle direct character interaction
      }}
    />
  );
};
```

### Step 4: Add Page Analysis

```tsx
function buildPageContext(): PageContext {
  return {
    url: window.location.href,
    domain: window.location.hostname,
    type: detectPageType(),
    hasForms: Boolean(document.querySelector('form')),
    hasButtons: Boolean(document.querySelector('button')),
    primaryText: getPrimaryText()
  };
}

function summarizeContext(context: PageContext): string {
  return `${context.title} looks like a ${context.type}. ${
    context.hasForms ? 'I found forms you can act on.' : ''
  }`;
}
```

### Step 5: Implement Highlighting

```tsx
function findHighlightTarget(command: PopupCommand): HTMLElement | null {
  if (command === 'highlight-forms') {
    return document.querySelector('form, input, textarea, select');
  }
  if (command === 'highlight-buttons') {
    return document.querySelector('button, [role="button"]');
  }
  return null;
}

// In component
const target = findHighlightTarget(command);
setHighlightTarget(target);
```

## Message Types

### Popup Commands

```tsx
type PopupCommand = 
  | 'analyze-page'      // Analyze current page
  | 'highlight-forms'   // Highlight form elements
  | 'highlight-buttons' // Highlight action buttons
  | 'sleep'            // Put character to sleep
  | 'wake';            // Wake character up
```

### Runtime Messages

```tsx
interface RuntimeMessage {
  type: string;
  command?: PopupCommand;
  data?: {
    mode?: SuyaMode;
    message?: string;
  };
}
```

### Context Updates

```tsx
chrome.runtime.sendMessage({
  type: 'suya-context-update',
  data: pageContext
});
```

## Styling Integration

### Import Character Styles

```css
/* In your main CSS or component */
@import '@/components/SuyaBot.css';
```

### Key CSS Classes

- `.suya-bot` – Main character container
- `.suya-overlay` – Full-page overlay for interactions
- `.suya-bubble` – Message bubble
- `.suya-highlight-wrapper` – Highlight frame
- Mode classes: `.awake`, `.idle`, `.sleeping`
- Expression classes: `.busy`, `.listening`, `.shocked`, `.thinking-hard`

### Responsive Behavior

The character automatically:
- Positions itself to avoid UI conflicts
- Scales down on mobile devices
- Respects reduced motion preferences
- Adapts to dark/light themes

## Build Configuration

### Webpack Setup

```javascript
module.exports = {
  entry: {
    popup: './src/popup/simple.tsx',
    'content-script': './src/content-scripts/character-ui.tsx'
  },
  plugins: [
    new HtmlWebpackPlugin({
      template: '../popup/popup.html',
      filename: '../popup/popup.html',
      chunks: ['popup']
    })
  ]
};
```

### TypeScript Paths

```json
{
  "compilerOptions": {
    "baseUrl": ".",
    "paths": {
      "@/components/*": ["./src/components/*"],
      "@/types/*": ["./src/types/*"]
    }
  }
}
```

## Best Practices

### 1. Keep the Character Central

- All user interactions should route through the character
- Avoid creating separate UI panels or popups
- Use the character's expressions and messages for feedback

### 2. Use Modes Appropriately

- **awake**: When actively processing or responding
- **idle**: Default waiting state
- **sleeping**: When inactive for extended periods

### 3. Provide Clear Feedback

- Use `message` prop for status updates
- Use expressions to indicate processing state
- Highlight relevant page elements during actions

### 4. Handle Errors Gracefully

- Use `shocked` expression for errors
- Provide clear error messages in bubbles
- Auto-recover to idle state after errors

### 5. Respect Page Context

- Analyze page type and features
- Adapt behavior based on detected elements
- Avoid interfering with page functionality

## Migration Checklist

- [ ] Remove sidepanel manifest entries
- [ ] Replace complex popup with minimal shell
- [ ] Implement character content script
- [ ] Set up popup-to-content communication
- [ ] Add page analysis and highlighting
- [ ] Update build configuration
- [ ] Test character expressions and modes
- [ ] Verify responsive behavior
- [ ] Remove legacy UI files

## Example Extension Structure

```
extension/
├── manifest.json          # No sidepanel entry
├── popup/
│   └── popup.html         # Minimal shell
├── ui/
│   ├── src/
│   │   ├── components/
│   │   │   └── SuyaBot.tsx    # Character component
│   │   ├── content-scripts/
│   │   │   └── character-ui.tsx # In-page runtime
│   │   └── popup/
│   │       └── simple.tsx     # Minimal popup
│   └── webpack.config.js
└── dist/
    ├── popup.js
    ├── content-script.js
    └── popup.html
```

## Troubleshooting

### Character Not Appearing

- Check content script is injected
- Verify React mounting logic
- Ensure CSS is loaded

### Commands Not Working

- Verify popup-to-content message routing
- Check command type definitions
- Ensure active tab detection

### Highlighting Issues

- Verify target element selection
- Check highlight CSS classes
- Ensure proper DOM timing

### Mode Transitions

- Verify mode state management
- Check expression logic
- Ensure proper cleanup

## Support

For questions about implementing this UI pattern:

1. Review the Suya Bot source code in this repository
2. Check the component props and CSS classes
3. Test with the provided example implementation
4. Follow the migration checklist for existing extensions

This approach ensures a consistent, character-first user experience across all extensions while maintaining clean separation of concerns and testable components.
