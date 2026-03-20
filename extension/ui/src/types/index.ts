export interface ExtensionMessage {
  action: string
  skill: string
  data?: any
  messageId: string
}

export interface ExtensionResponse<T = any> {
  success: boolean
  data?: T
  error?: string
  messageId?: string
}

export interface Skill {
  name: string
  version: string
  isActive: boolean
  dependencies: string[]
  config: Record<string, any>
  health: 'healthy' | 'warning' | 'error' | 'unknown'
}

export interface Task {
  id: string
  skill: string
  action: string
  data: any
  status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled'
  createdAt: number
  startedAt?: number
  completedAt?: number
  result?: any
  error?: string
  retryCount: number
  maxRetries: number
}

export interface VoiceCommand {
  intent: string
  confidence: number
  entities: Record<string, string[]>
  parameters: Record<string, any>
  originalText: string
}

export interface StorageStats {
  chromeLocal: number
  chromeSync: number
  indexedDB: number
  cache: number
  total: number
}

export interface ExtensionSettings {
  voiceEnabled: boolean
  autoStartSkills: string[]
  theme: 'light' | 'dark' | 'auto'
  language: string
  notifications: boolean
  privacyMode: boolean
  compressionEnabled: boolean
  encryptionEnabled: boolean
}

export interface UserProfile {
  id: string
  createdAt: number
  preferences: Record<string, any>
}

export interface NotificationOptions {
  type: 'basic' | 'image' | 'list'
  title: string
  message: string
  iconUrl?: string
  imageUrl?: string
  items?: Array<{ title: string; message: string }>
  buttons?: Array<{ title: string; iconUrl?: string }>
}

export interface ContextMenuItem {
  id: string
  title: string
  contexts: chrome.contextMenus.ContextType[]
  parentId?: string
}

export interface PerformanceMetrics {
  operation: string
  duration: number
  timestamp: number
  memoryUsage?: number
}

export interface SecurityAuditEvent {
  type: string
  data: any
  timestamp: number
  userId?: string
}

export interface EventHistory {
  event: string
  data: any
  timestamp: number
}

export interface EventStats {
  count: number
  totalDuration: number
  averageDuration: number
  minDuration: number
  maxDuration: number
  lastEmitted: number
}

// Skill-specific types
export interface BackgroundTasksConfig {
  maxConcurrentTasks: number
  retryAttempts: number
  taskTimeout: number
}

export interface ServerSkillsConfig {
  apiEndpoints: {
    download: string
    whisper: string
    tts: string
    notes: string
  }
}

export interface MailSkillsConfig {
  providers: string[]
  autoReplyEnabled: boolean
  smartComposeEnabled: boolean
}

export interface VideoGenerationConfig {
  maxVideoLength: number
  quality: string
  format: string
}

export interface AudioGenerationConfig {
  sampleRate: number
  bitRate: number
  format: string
}

export interface ChatSkillsConfig {
  platforms: string[]
  messageHistorySize: number
}

export interface ApplicationWritingConfig {
  autoDetectForms: boolean
  smartFillEnabled: boolean
  templateLibrary: boolean
}

export interface DocumentSkillsConfig {
  googleDocsEnabled: boolean
  slidesEnabled: boolean
  youtubeEnabled: boolean
}

export interface QATestingConfig {
  autoTestEnabled: boolean
  visualRegressionEnabled: boolean
  performanceMonitoringEnabled: boolean
}

export interface UIAssistantConfig {
  contextualHelp: boolean
  voiceCommands: boolean
  personalizedSuggestions: boolean
}
