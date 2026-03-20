# AI Bot Extension - Comprehensive Chrome Extension

A powerful, modular Chrome extension that implements 15+ AI-powered skills for background tasks, server integration, mail management, content creation, and more.

## Features

### 🎯 Core Skills
- **Background Tasks**: Task scheduling, chaining, and background processing
- **Server Skills**: Remote download, Whisper transcription, TTS, and note-taking
- **Mail Skills**: Gmail, Outlook, Venmail integration with AI composition
- **Video Generation**: Screen recording, Remotion integration, video effects
- **Audio Generation**: Voice processing, Suya backend, Suno AI music
- **Chat Skills**: Telegram Web, WhatsApp Web integration
- **Application Writing**: Smart form filling and application automation
- **Document Skills**: Google Docs/Slides integration, educational content
- **QA Testing**: Automated UI testing, visual regression, performance monitoring
- **UI Assistant**: Contextual help, voice commands, personalized suggestions

### 🏗️ Architecture
- **Manifest V3**: Modern Chrome extension architecture
- **Service Worker**: Event-driven background processing
- **Modular Skills**: Independent skill modules with cross-skill communication
- **Unified Storage**: Chrome storage API + IndexedDB for large data
- **Voice Interface**: Web Speech API integration for voice commands
- **Modern UI**: React + TypeScript + TailwindCSS + shadcn/ui

### 🔒 Security & Privacy
- **End-to-end Encryption**: AES-GCM encryption for sensitive data
- **Audit Logging**: Comprehensive security event tracking
- **Threat Detection**: Real-time security monitoring
- **Privacy Controls**: Data sanitization and privacy protection
- **Permission Management**: Fine-grained permission control

## Installation

### Development Setup
1. Clone this repository
2. Install dependencies:
   ```bash
   cd extension/ui
   npm install
   ```
3. Build the UI:
   ```bash
   npm run build
   ```
4. Load the extension in Chrome:
   - Open `chrome://extensions/`
   - Enable "Developer mode"
   - Click "Load unpacked"
   - Select the `extension` directory

### Production Build
```bash
cd extension/ui
npm run build
```
The built files will be in the `extension/dist` directory.

## Usage

### Voice Control
- Click the microphone button in the popup
- Say commands like:
  - "Start listening" - Activate voice recognition
  - "Create task" - Start a new background task
  - "Download this page" - Download current page
  - "Transcribe audio" - Transcribe audio on page
  - "Create note" - Create a note from selection

### Popup Interface
- **Skill Management**: Toggle skills on/off
- **Voice Controls**: Start/stop voice recognition
- **Quick Actions**: Create tasks, notes, open sidepanel
- **Status Monitoring**: View extension health and activity

### Side Panel
- Detailed skill configuration
- Task management interface
- Real-time monitoring
- Advanced settings

### Context Menu
Right-click on pages to access:
- Download with AI Assistant
- Transcribe Audio
- Create Note from Selection
- Background Task options

## Configuration

### Settings
Access settings through:
- Extension popup → Settings button
- Chrome extension options page
- Side panel settings tab

### Key Settings
- **Voice Settings**: Language, auto-restart, feedback options
- **Privacy Mode**: Enable/disable data collection
- **Skill Configuration**: Individual skill settings
- **Storage Options**: Compression, encryption preferences
- **Security Settings**: Permission management, audit controls

## API Reference

### Background Script Messages
```javascript
// Send message to background
chrome.runtime.sendMessage({
  action: 'createTask',
  skill: 'background-tasks',
  data: { /* task data */ }
});
```

### Skill Actions
Each skill supports specific actions:

#### Background Tasks
- `createTask` - Create new background task
- `getTask` - Get task details
- `updateTask` - Update task status
- `cancelTask` - Cancel running task
- `listTasks` - List all tasks

#### Server Skills
- `download` - Download file from URL
- `transcribe` - Transcribe audio to text
- `synthesize` - Generate speech from text
- `createNote` - Create new note
- `searchNotes` - Search existing notes

#### Mail Skills
- `composeEmail` - Compose new email
- `replyToEmail` - Reply to email
- `scheduleMeeting` - Schedule meeting
- `smartReply` - Generate smart reply

## Development

### Project Structure
```
extension/
├── manifest.json                 # Manifest V3 configuration
├── background/                   # Service worker and core logic
│   ├── service-worker.js        # Main service worker
│   ├── skill-registry.js        # Skill registration system
│   └── event-bus.js            # Cross-skill communication
├── content-scripts/             # Page interaction scripts
│   └── universal-handler.js     # Universal page handler
├── popup/                       # Extension popup
│   └── popup.html              # Popup interface
├── sidepanel/                   # Side panel interface
├── offscreen/                   # Offscreen document operations
├── skills/                      # Individual skill modules
│   ├── background-tasks/        # Task management
│   ├── server-skills/           # Server integration
│   ├── mail-skills/             # Email management
│   ├── video-generation/        # Video creation
│   ├── audio-generation/        # Audio processing
│   ├── chat-skills/             # Chat integration
│   ├── application-writing/     # Form automation
│   ├── document-skills/         # Document management
│   ├── qa-testing/              # Testing automation
│   └── ui-assistant/            # UI assistance
├── shared/                      # Shared utilities
│   ├── storage/                 # Storage management
│   ├── voice-interface/         # Voice processing
│   ├── security/                # Security features
│   └── utils/                   # Common utilities
├── ui/                          # React UI components
│   ├── src/                     # Source code
│   ├── package.json            # Dependencies
│   ├── webpack.config.js       # Build configuration
│   └── tailwind.config.js      # Styling configuration
└── assets/                      # Static assets
    └── icons/                   # Extension icons
```

### Adding New Skills
1. Create skill directory in `skills/`
2. Implement skill class with required methods:
   ```javascript
   class NewSkill {
     constructor(config) { /* ... */ }
     async initialize() { /* ... */ }
     async activate() { /* ... */ }
     async deactivate() { /* ... */ }
     async handleAction(action, data) { /* ... */ }
     // ... other required methods
   }
   ```
3. Register skill in `skill-registry.js`
4. Add skill configuration to service worker
5. Update UI components to support new skill

### UI Development
The UI uses:
- **React 18** with TypeScript
- **TailwindCSS** for styling
- **shadcn/ui** components
- **Zustand** for state management
- **Lucide React** for icons

Build commands:
```bash
npm run dev      # Development build with watch
npm run build    # Production build
npm run type-check  # TypeScript checking
```

## Security

### Data Protection
- All sensitive data encrypted with AES-GCM-256
- Local storage encryption optional
- API communication over HTTPS
- Regular security audits

### Privacy Features
- No data sent to external servers without consent
- Local processing by default
- Privacy mode for sensitive operations
- Comprehensive audit logging

### Threat Detection
- Real-time request validation
- SQL injection prevention
- XSS protection
- Rate limiting
- Suspicious pattern detection

## Troubleshooting

### Common Issues
1. **Extension not loading**: Check manifest syntax and permissions
2. **Voice recognition not working**: Ensure microphone permissions
3. **Skills not activating**: Check background script console
4. **UI not rendering**: Check React build and CSS loading

### Debug Mode
Enable debug mode by setting:
```javascript
localStorage.setItem('aibot-debug', 'true');
```

### Logs
Check logs in:
- Extension popup console
- Service worker console (`chrome://extensions/` → Service worker)
- Background page console
- Individual tab consoles for content scripts

## Contributing

### Development Guidelines
- Follow TypeScript best practices
- Use semantic versioning
- Write comprehensive tests
- Document new features
- Follow security best practices

### Pull Requests
1. Fork the repository
2. Create feature branch
3. Make changes with tests
4. Update documentation
5. Submit pull request

## Gotchas/Todos
 - Figure out how robust strategy to handle DOM changes/stale dom
 - Figure out how to handle voice recognition/recording failures painlessly
 - Add skill to work as a meeting assistant/note taker, pull in occassional helpful information as tips while meeting is ongoing
 - Add a 'shrinked' mode where only the antenae is visible and the other parts fade out or become nearly transparent
 - Dragging effects should always move or shrink the bot out of the way with an recovery time of 1 hour unless clicked/hovered on again


## License

This project is licensed under the MIT License - see the LICENSE file for details.

## Support

For support:
- Create an issue in the repository
- Check the troubleshooting section
- Review the API documentation
- Join the developer community

## Changelog

### v1.0.0
- Initial release
- 10+ core skills implemented
- Voice interface
- Security and privacy features
- Modern React UI
- Comprehensive documentation
