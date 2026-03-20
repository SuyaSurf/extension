import { create } from 'zustand'
import { ExtensionSettings, Skill, Task, VoiceCommand, StorageStats } from '@/types'

interface ExtensionState {
  // Settings
  settings: ExtensionSettings
  updateSettings: (settings: Partial<ExtensionSettings>) => void
  
  // Skills
  skills: Skill[]
  activeSkills: Skill[]
  updateSkills: (skills: Skill[]) => void
  activateSkill: (skillName: string) => void
  deactivateSkill: (skillName: string) => void
  
  // Tasks
  tasks: Task[]
  activeTasks: Task[]
  addTask: (task: Task) => void
  updateTask: (taskId: string, updates: Partial<Task>) => void
  removeTask: (taskId: string) => void
  
  // Voice
  isListening: boolean
  isSpeaking: boolean
  lastVoiceCommand: VoiceCommand | null
  setListening: (listening: boolean) => void
  setSpeaking: (speaking: boolean) => void
  setLastVoiceCommand: (command: VoiceCommand | null) => void
  
  // Storage
  storageStats: StorageStats | null
  updateStorageStats: (stats: StorageStats) => void
  
  // UI State
  isLoading: boolean
  error: string | null
  setLoading: (loading: boolean) => void
  setError: (error: string | null) => void
  
  // Theme
  theme: 'light' | 'dark' | 'auto'
  setTheme: (theme: 'light' | 'dark' | 'auto') => void
}

export const useExtensionStore = create<ExtensionState>((set, get) => ({
  // Initial state
  settings: {
    voiceEnabled: true,
    autoStartSkills: ['background-tasks', 'server-skills', 'ui-assistant'],
    theme: 'auto',
    language: 'en-US',
    notifications: true,
    privacyMode: false,
    compressionEnabled: true,
    encryptionEnabled: false
  },
  
  skills: [],
  activeSkills: [],
  tasks: [],
  activeTasks: [],
  isListening: false,
  isSpeaking: false,
  lastVoiceCommand: null,
  storageStats: null,
  isLoading: false,
  error: null,
  theme: 'auto',
  
  // Settings actions
  updateSettings: (newSettings) => {
    set((state) => ({
      settings: { ...state.settings, ...newSettings }
    }))
  },
  
  // Skills actions
  updateSkills: (skills) => {
    const activeSkills = skills.filter(skill => skill.isActive)
    set({ skills, activeSkills })
  },
  
  activateSkill: (skillName) => {
    set((state) => {
      const updatedSkills = state.skills.map(skill =>
        skill.name === skillName ? { ...skill, isActive: true } : skill
      )
      const activeSkills = updatedSkills.filter(skill => skill.isActive)
      return { skills: updatedSkills, activeSkills }
    })
  },
  
  deactivateSkill: (skillName) => {
    set((state) => {
      const updatedSkills = state.skills.map(skill =>
        skill.name === skillName ? { ...skill, isActive: false } : skill
      )
      const activeSkills = updatedSkills.filter(skill => skill.isActive)
      return { skills: updatedSkills, activeSkills }
    })
  },
  
  // Tasks actions
  addTask: (task) => {
    set((state) => {
      const updatedTasks = [...state.tasks, task]
      const activeTasks = updatedTasks.filter(t => 
        t.status === 'pending' || t.status === 'running'
      )
      return { tasks: updatedTasks, activeTasks }
    })
  },
  
  updateTask: (taskId, updates) => {
    set((state) => {
      const updatedTasks = state.tasks.map(task =>
        task.id === taskId ? { ...task, ...updates } : task
      )
      const activeTasks = updatedTasks.filter(t => 
        t.status === 'pending' || t.status === 'running'
      )
      return { tasks: updatedTasks, activeTasks }
    })
  },
  
  removeTask: (taskId) => {
    set((state) => {
      const updatedTasks = state.tasks.filter(task => task.id !== taskId)
      const activeTasks = updatedTasks.filter(t => 
        t.status === 'pending' || t.status === 'running'
      )
      return { tasks: updatedTasks, activeTasks }
    })
  },
  
  // Voice actions
  setListening: (listening) => set({ isListening: listening }),
  setSpeaking: (speaking) => set({ isSpeaking: speaking }),
  setLastVoiceCommand: (command) => set({ lastVoiceCommand: command }),
  
  // Storage actions
  updateStorageStats: (stats) => set({ storageStats: stats }),
  
  // UI actions
  setLoading: (loading) => set({ isLoading: loading }),
  setError: (error) => set({ error }),
  
  // Theme actions
  setTheme: (theme) => set({ theme })
}))

// Selectors
export const useSettings = () => useExtensionStore((state) => state.settings)
export const useSkills = () => useExtensionStore((state) => state.skills)
export const useActiveSkills = () => useExtensionStore((state) => state.activeSkills)
export const useTasks = () => useExtensionStore((state) => state.tasks)
export const useActiveTasks = () => useExtensionStore((state) => state.activeTasks)
export const useVoiceState = () => useExtensionStore((state) => ({
  isListening: state.isListening,
  isSpeaking: state.isSpeaking,
  lastVoiceCommand: state.lastVoiceCommand
}))
export const useUIState = () => useExtensionStore((state) => ({
  isLoading: state.isLoading,
  error: state.error
}))
export const useTheme = () => useExtensionStore((state) => state.theme)
