-- Suya Surf Server Database Schema
-- PostgreSQL schema for all services

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Users table
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    role VARCHAR(50) DEFAULT 'user',
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    last_login TIMESTAMP
);

-- Downloads tracking
CREATE TABLE IF NOT EXISTS downloads (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    url TEXT NOT NULL,
    filename TEXT,
    file_path TEXT,
    file_size BIGINT DEFAULT 0,
    status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'downloading', 'completed', 'failed', 'cancelled')),
    progress INTEGER DEFAULT 0 CHECK (progress >= 0 AND progress <= 100),
    cookies JSONB,
    headers JSONB,
    error TEXT,
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    priority TEXT DEFAULT 'normal' CHECK (priority IN ('low', 'normal', 'high')),
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    completed_at TIMESTAMP
);

-- Transcription jobs
CREATE TABLE IF NOT EXISTS transcriptions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    audio_path TEXT NOT NULL,
    audio_url TEXT,
    audio_duration DECIMAL(10, 2),
    language VARCHAR(10),
    model VARCHAR(50) DEFAULT 'base',
    status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
    result JSONB,
    error TEXT,
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    options JSONB,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    completed_at TIMESTAMP
);

-- TTS cache
CREATE TABLE IF NOT EXISTS tts_cache (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    text_hash TEXT UNIQUE NOT NULL,
    text TEXT NOT NULL,
    voice_id VARCHAR(100),
    provider VARCHAR(50) DEFAULT 'openai',
    audio_path TEXT,
    audio_size BIGINT,
    format VARCHAR(10) DEFAULT 'mp3',
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    created_at TIMESTAMP DEFAULT NOW(),
    expires_at TIMESTAMP
);

-- Notes and collaboration
CREATE TABLE IF NOT EXISTS notes (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    title TEXT,
    content JSONB NOT NULL,
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    encrypted BOOLEAN DEFAULT FALSE,
    tags TEXT[],
    version INTEGER DEFAULT 1,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    last_edited_by UUID REFERENCES users(id)
);

-- Collaborations for real-time editing
CREATE TABLE IF NOT EXISTS collaborations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    note_id UUID REFERENCES notes(id) ON DELETE CASCADE,
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    permissions TEXT DEFAULT 'read' CHECK (permissions IN ('read', 'write', 'admin')),
    joined_at TIMESTAMP DEFAULT NOW(),
    last_activity TIMESTAMP DEFAULT NOW(),
    UNIQUE(note_id, user_id)
);

-- Edit history for conflict resolution
CREATE TABLE IF NOT EXISTS note_edits (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    note_id UUID REFERENCES notes(id) ON DELETE CASCADE,
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    operation JSONB NOT NULL,
    timestamp TIMESTAMP DEFAULT NOW(),
    revision INTEGER
);

-- Sessions for authentication
CREATE TABLE IF NOT EXISTS user_sessions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    token_hash VARCHAR(255) NOT NULL,
    refresh_token_hash VARCHAR(255),
    expires_at TIMESTAMP NOT NULL,
    created_at TIMESTAMP DEFAULT NOW(),
    last_activity TIMESTAMP DEFAULT NOW(),
    ip_address INET,
    user_agent TEXT
);

-- API keys for service authentication
CREATE TABLE IF NOT EXISTS api_keys (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(100) NOT NULL,
    key_hash VARCHAR(255) UNIQUE NOT NULL,
    permissions JSONB,
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    created_at TIMESTAMP DEFAULT NOW(),
    expires_at TIMESTAMP,
    last_used TIMESTAMP
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_downloads_user_id ON downloads(user_id);
CREATE INDEX IF NOT EXISTS idx_downloads_status ON downloads(status);
CREATE INDEX IF NOT EXISTS idx_downloads_created_at ON downloads(created_at);

CREATE INDEX IF NOT EXISTS idx_transcriptions_user_id ON transcriptions(user_id);
CREATE INDEX IF NOT EXISTS idx_transcriptions_status ON transcriptions(status);
CREATE INDEX IF NOT EXISTS idx_transcriptions_created_at ON transcriptions(created_at);

CREATE INDEX IF NOT EXISTS idx_tts_cache_text_hash ON tts_cache(text_hash);
CREATE INDEX IF NOT EXISTS idx_tts_cache_user_id ON tts_cache(user_id);
CREATE INDEX IF NOT EXISTS idx_tts_cache_expires_at ON tts_cache(expires_at);

CREATE INDEX IF NOT EXISTS idx_notes_user_id ON notes(user_id);
CREATE INDEX IF NOT EXISTS idx_notes_updated_at ON notes(updated_at);
CREATE INDEX IF NOT EXISTS idx_notes_tags ON notes USING GIN(tags);
CREATE INDEX IF NOT EXISTS idx_notes_content ON notes USING GIN(content);

CREATE INDEX IF NOT EXISTS idx_collaborations_note_id ON collaborations(note_id);
CREATE INDEX IF NOT EXISTS idx_collaborations_user_id ON collaborations(user_id);

CREATE INDEX IF NOT EXISTS idx_note_edits_note_id ON note_edits(note_id);
CREATE INDEX IF NOT EXISTS idx_note_edits_timestamp ON note_edits(timestamp);

CREATE INDEX IF NOT EXISTS idx_user_sessions_user_id ON user_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_user_sessions_expires_at ON user_sessions(expires_at);

CREATE INDEX IF NOT EXISTS idx_api_keys_user_id ON api_keys(user_id);
CREATE INDEX IF NOT EXISTS idx_api_keys_key_hash ON api_keys(key_hash);

-- Create trigger for updating updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_downloads_updated_at BEFORE UPDATE ON downloads
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_transcriptions_updated_at BEFORE UPDATE ON transcriptions
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_notes_updated_at BEFORE UPDATE ON notes
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_collaborations_last_activity BEFORE UPDATE ON collaborations
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Clean up expired sessions and cache
CREATE OR REPLACE FUNCTION cleanup_expired_data()
RETURNS void AS $$
BEGIN
    DELETE FROM user_sessions WHERE expires_at < NOW();
    DELETE FROM tts_cache WHERE expires_at < NOW();
    DELETE FROM api_keys WHERE expires_at < NOW();
END;
$$ LANGUAGE plpgsql;

-- Schedule cleanup job (run daily)
-- This would typically be handled by a cron job or pg_cron extension
