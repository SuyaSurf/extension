# Suya Surf Server

A high-performance Node.js server providing backend services for the Suya Surf browser extension, including download management, audio transcription, text-to-speech, and collaborative note-taking.

## Features

### 🚀 Core Services
- **Remote Download Manager**: Cookie-based authenticated downloads with resumable support
- **Whisper Transcription**: Multi-language audio transcription with local and cloud options
- **Text-to-Speech**: Multi-provider TTS with OpenAI, Google Cloud, and local options
- **Collaborative Notes**: Real-time note editing with operational transforms and sync

### ⚡ Performance
- **Cluster Mode**: Multi-process scaling for optimal CPU utilization
- **Redis Caching**: Fast caching for API responses and file metadata
- **Database Pooling**: Efficient PostgreSQL connection management
- **Worker Threads**: Background processing for CPU-intensive tasks

### 🔒 Security
- **JWT Authentication**: Secure token-based authentication
- **Role-based Access Control**: Granular permission management
- **API Rate Limiting**: Protection against abuse
- **End-to-end Encryption**: Optional encryption for sensitive notes

## Quick Start

### Prerequisites
- Node.js 18+ 
- PostgreSQL 15+
- Redis 7+
- Docker & Docker Compose (optional)

### Installation

1. **Clone and setup**
```bash
git clone <repository-url>
cd suya-surf/server
npm install
```

2. **Environment configuration**
```bash
cp .env.example .env
# Edit .env with your configuration
```

3. **Database setup**
```bash
# Create database and run schema
createdb suyasurf
psql -d suyasurf -f database/schema.sql
```

4. **Start the server**
```bash
# Development
npm run dev

# Production
npm start
```

### Docker Setup

```bash
# Copy environment file
cp .env.example .env

# Start all services
docker-compose up -d

# With monitoring
docker-compose --profile monitoring up -d
```

## API Documentation

### Authentication
All API endpoints (except `/health`) require JWT authentication:

```bash
curl -H "Authorization: Bearer <token>" \
     https://api.suyasurf.com/api/download/status/<id>
```

### Download Service

#### Start Download
```bash
POST /api/download/start
{
  "url": "https://example.com/file.pdf",
  "cookies": {"session": "abc123"},
  "priority": "high"
}
```

#### Get Status
```bash
GET /api/download/status/<id>
```

#### Stream File
```bash
GET /api/download/stream/<id>
```

### Transcription Service

#### Upload Audio
```bash
POST /api/transcribe/upload
Content-Type: multipart/form-data
{
  "file": <audio-file>,
  "language": "en",
  "model": "base"
}
```

#### Transcribe from URL
```bash
POST /api/transcribe/url
{
  "audioUrl": "https://example.com/audio.mp3",
  "language": "en"
}
```

#### Get Result
```bash
GET /api/transcribe/<id>
```

### Text-to-Speech Service

#### Synthesize Speech
```bash
POST /api/tts/synthesize
{
  "text": "Hello, world!",
  "voiceId": "alloy",
  "provider": "openai",
  "format": "mp3"
}
```

#### Stream Speech
```bash
POST /api/tts/stream
{
  "text": "Hello, world!",
  "voiceId": "alloy"
}
```

#### Get Voices
```bash
GET /api/tts/voices
```

### Notes Service

#### Create Note
```bash
POST /api/notes
{
  "title": "My Note",
  "content": {"ops": [{"insert": "Hello\n"}]},
  "tags": ["personal", "important"]
}
```

#### Real-time Collaboration
```javascript
// WebSocket connection
const ws = new WebSocket('ws://localhost:3000/api/notes/<id>/collaborate');

// Send edit operation
ws.send(JSON.stringify({
  type: 'edit',
  data: {
    operation: {
      type: 'insert',
      position: 5,
      text: "world"
    },
    version: 1
  }
}));
```

## Configuration

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `NODE_ENV` | Environment mode | `development` |
| `PORT` | Server port | `3000` |
| `DATABASE_URL` | PostgreSQL connection string | - |
| `REDIS_URL` | Redis connection string | - |
| `JWT_SECRET` | JWT signing secret | - |
| `OPENAI_API_KEY` | OpenAI API key | - |
| `WHISPER_WORKERS` | Number of transcription workers | `2` |

### Database Schema

The server uses PostgreSQL with the following main tables:
- `users` - User accounts and authentication
- `downloads` - Download job tracking
- `transcriptions` - Audio transcription jobs
- `tts_cache` - Cached TTS audio
- `notes` - Collaborative notes
- `collaborations` - Note sharing permissions

See `database/schema.sql` for the complete schema.

## Architecture

### Service Layer
- **Controllers**: Handle HTTP requests and responses
- **Services**: Business logic and external API integration
- **Models**: Database interaction and data validation
- **Middleware**: Authentication, validation, error handling

### Background Processing
- **Worker Threads**: CPU-intensive tasks (transcription, TTS)
- **Queue System**: Job scheduling and prioritization
- **WebSocket Hub**: Real-time collaboration management

### Caching Strategy
- **Redis**: Session management, API responses, file metadata
- **File Cache**: TTS audio and processed audio files
- **Memory Cache**: Frequently accessed data structures

## Monitoring

### Health Checks
```bash
curl http://localhost:3000/health
```

### Metrics
- **Prometheus**: Metrics collection (optional)
- **Grafana**: Visualization dashboard (optional)
- **Winston**: Structured logging with rotation

### Performance Monitoring
```bash
# View logs
tail -f logs/combined-$(date +%Y-%m-%d).log

# Monitor Redis
redis-cli monitor

# Database queries
psql -d suyasurf -c "SELECT * FROM pg_stat_activity;"
```

## Deployment

### Production Setup

1. **Environment preparation**
```bash
export NODE_ENV=production
export LOG_LEVEL=info
```

2. **Database migrations**
```bash
psql -d suyasurf -f database/schema.sql
```

3. **Start with cluster mode**
```bash
npm start
```

### Docker Production

```bash
# Build and deploy
docker-compose -f docker-compose.yml -f docker-compose.prod.yml up -d

# Scale workers
docker-compose up -d --scale app=4
```

### Nginx Configuration

```nginx
upstream suya-surf {
    server app:3000;
}

server {
    listen 80;
    server_name api.suyasurf.com;
    
    location / {
        proxy_pass http://suya-surf;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
```

## Development

### Running Tests
```bash
npm test
npm run test:watch
npm run test:coverage
```

### Code Quality
```bash
npm run lint
npm run format
```

### Database Development
```bash
# Reset database
psql -d suyasurf -c "DROP SCHEMA public CASCADE; CREATE SCHEMA public;"
psql -d suyasurf -f database/schema.sql

# Seed data
npm run seed
```

## Troubleshooting

### Common Issues

1. **Database connection failed**
   - Check DATABASE_URL format
   - Verify PostgreSQL is running
   - Confirm database exists

2. **Redis connection failed**
   - Check Redis server status
   - Verify REDIS_URL configuration
   - Check network connectivity

3. **Transcription errors**
   - Verify OpenAI API key
   - Check audio file format
   - Monitor worker thread status

4. **WebSocket connection issues**
   - Check firewall settings
   - Verify WebSocket support
   - Monitor connection logs

### Debug Mode

```bash
DEBUG=* npm run dev
```

### Log Analysis

```bash
# Error logs
grep ERROR logs/combined-*.log

# Performance logs
grep "Performance:" logs/combined-*.log

# Database queries
grep "Executed query" logs/combined-*.log
```

## Contributing

1. Fork the repository
2. Create feature branch
3. Make changes with tests
4. Submit pull request

## License

MIT License - see LICENSE file for details.

## Support

- **Issues**: GitHub Issues
- **Documentation**: Wiki
- **Community**: Discord Server
