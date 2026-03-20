import React from 'react'
import ReactDOM from 'react-dom/client'
import SuyaBot, { SuyaMode } from '@/components/SuyaBot'

interface PageContext {
  url: string
  domain: string
  path: string
  title: string
  type: string
  language: string
  hasForms: boolean
  hasButtons: boolean
  hasInputs: boolean
  primaryText: string
  formCount?: number
  fillableFields?: number
}

type PopupCommand = 'analyze-page' | 'highlight-forms' | 'highlight-buttons' | 'sleep' | 'wake' | 'fill-forms' | 'scan-forms' | 'save-profile' | 'preview-fill'

type RuntimeMessage = {
  type: string
  command?: PopupCommand
  data?: {
    mode?: SuyaMode
    message?: string
  }
}

const ROOT_ID = 'suya-character-ui-root'

function detectPageType(): string {
  const domain = window.location.hostname

  if (domain.includes('gmail.com')) return 'gmail'
  if (domain.includes('outlook.com')) return 'outlook'
  if (domain.includes('telegram.org')) return 'telegram'
  if (domain.includes('web.whatsapp.com')) return 'whatsapp'
  if (document.querySelector('form')) return 'form-page'
  if (document.querySelector('article, main article, .article, .post')) return 'article'
  if (document.querySelector('video, audio')) return 'media-page'

  return 'general'
}

// Load formfiller dependencies
async function loadFormFillerDependencies(): Promise<boolean> {
  if (typeof window === 'undefined') return false
  
  // Check if dependencies are already loaded
  if ((window as any).FormScanner && (window as any).FieldMatcher && (window as any).FormFiller) {
    return true
  }

  try {
    // Load utility scripts first
    await loadScript('/skills/application-writing/utils/dom-utils.js')
    await loadScript('/skills/application-writing/utils/fuzzy-match.js')
    
    // Load core formfiller scripts
    await loadScript('/skills/application-writing/form-scanner.js')
    await loadScript('/skills/application-writing/field-matcher.js')
    await loadScript('/skills/application-writing/form-filler.js')
    
    return !!((window as any).FormScanner && (window as any).FieldMatcher && (window as any).FormFiller)
  } catch (error) {
    console.error('Failed to load formfiller dependencies:', error)
    return false
  }
}

function loadScript(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const script = document.createElement('script')
    script.src = chrome.runtime.getURL(src)
    script.onload = () => resolve()
    script.onerror = () => reject(new Error(`Failed to load ${src}`))
    document.head.appendChild(script)
  })
}

function getPrimaryText(): string {
  const main = document.querySelector('main, article, [role="main"]')
  const source = main?.textContent ?? document.body.textContent ?? ''
  return source.replace(/\s+/g, ' ').trim().slice(0, 240)
}

function buildPageContext(): PageContext {
  const hasForms = Boolean(document.querySelector('form'))
  let formCount = 0
  let fillableFields = 0
  
  // If formfiller is available, get more accurate counts
  if ((window as any).FormScanner) {
    try {
      const scanResult = (window as any).FormScanner.scan()
      formCount = scanResult.fields.length
      fillableFields = scanResult.visibleFields.length
    } catch (e) {
      // Fallback to basic detection
      formCount = document.querySelectorAll('form').length
      fillableFields = document.querySelectorAll('input:not([type="hidden"]), textarea, select').length
    }
  } else {
    formCount = document.querySelectorAll('form').length
    fillableFields = document.querySelectorAll('input:not([type="hidden"]), textarea, select').length
  }

  return {
    url: window.location.href,
    domain: window.location.hostname,
    path: window.location.pathname,
    title: document.title,
    type: detectPageType(),
    language: document.documentElement.lang || 'en',
    hasForms,
    hasButtons: Boolean(document.querySelector('button, input[type="button"], input[type="submit"]')),
    hasInputs: Boolean(document.querySelector('input, textarea, select')),
    primaryText: getPrimaryText(),
    formCount,
    fillableFields
  }
}

function findHighlightTarget(command: PopupCommand): HTMLElement | null {
  if (command === 'highlight-forms') {
    // Use formfiller for more precise highlighting if available
    if ((window as any).FormScanner) {
      const scanResult = (window as any).FormScanner.scan()
      const firstField = scanResult.visibleFields[0]?.el
      return firstField || document.querySelector('form, input, textarea, select') as HTMLElement | null
    }
    return document.querySelector('form, input, textarea, select') as HTMLElement | null
  }

  if (command === 'highlight-buttons') {
    return document.querySelector('button, [role="button"], input[type="submit"], a') as HTMLElement | null
  }

  return document.querySelector('main, article, form, button, a') as HTMLElement | null
}

function summarizeContext(context: PageContext): string {
  const summaryParts = [
    `${context.title || 'This page'} looks like a ${context.type}.`,
    context.hasForms ? `I found ${context.formCount || 'some'} form${(context.formCount || 0) !== 1 ? 's' : ''} with ${context.fillableFields || 'some'} fillable fields.` : '',
    context.hasButtons ? 'There are actionable controls on the page.' : '',
    context.primaryText ? `Preview: ${context.primaryText}` : ''
  ].filter(Boolean)

  return summaryParts.join(' ')
}

const CharacterRuntime: React.FC = () => {
  const [mode, setMode] = React.useState<SuyaMode>('idle')
  const [message, setMessage] = React.useState('Suya is here when you need help deciding what to do on this page.')
  const [isBusy, setIsBusy] = React.useState(false)
  const [isThinkingHard, setIsThinkingHard] = React.useState(false)
  const [isShocked, setIsShocked] = React.useState(false)
  const [highlightTarget, setHighlightTarget] = React.useState<HTMLElement | null>(null)
  const [lastContext, setLastContext] = React.useState<PageContext>(() => buildPageContext())
  const [formFillerLoaded, setFormFillerLoaded] = React.useState(false)

  // Initialize formfiller dependencies
  React.useEffect(() => {
    loadFormFillerDependencies().then(loaded => {
      setFormFillerLoaded(loaded)
      if (loaded) {
        console.log('FormFiller dependencies loaded successfully')
      }
    })
  }, [])

  const refreshContext = React.useCallback(() => {
    const context = buildPageContext()
    setLastContext(context)

    try {
      chrome.runtime.sendMessage({
        type: 'suya-context-update',
        data: context
      })
    } catch {
      // ignore best-effort messaging failures
    }

    return context
  }, [])

  const pulseMode = React.useCallback((nextMode: SuyaMode, timeout = 1800) => {
    setMode(nextMode)

    if (nextMode !== 'sleeping') {
      window.setTimeout(() => setMode('idle'), timeout)
    }
  }, [])

  const runCommand = React.useCallback(async (command: PopupCommand) => {
    if (command === 'sleep') {
      setMode('sleeping')
      setMessage('Sleeping. Wake me from the popup when you need me again.')
      setIsBusy(false)
      setIsThinkingHard(false)
      setIsShocked(false)
      setHighlightTarget(null)
      return
    }

    if (command === 'wake') {
      setMode('awake')
      setMessage('I am awake and ready to help on this page.')
      setIsBusy(false)
      setIsThinkingHard(false)
      setIsShocked(false)
      return
    }

    const context = refreshContext()
    const target = findHighlightTarget(command)
    setHighlightTarget(target)
    pulseMode('awake')

    if (command === 'analyze-page') {
      setIsBusy(true)
      setIsThinkingHard(true)
      setMessage(summarizeContext(context))
      window.setTimeout(() => {
        setIsBusy(false)
        setIsThinkingHard(false)
      }, 1200)
      return
    }

    if (command === 'highlight-forms') {
      setMessage(target ? `I highlighted ${context.formCount || 'the'} form${(context.formCount || 0) !== 1 ? 's' : ''} for your decision.` : 'I could not find any forms to highlight here.')
      setIsShocked(!target)
      window.setTimeout(() => setIsShocked(false), 1200)
      return
    }

    if (command === 'highlight-buttons') {
      setMessage(target ? 'I highlighted the main action controls on this page.' : 'I could not find obvious action controls here.')
      setIsShocked(!target)
      window.setTimeout(() => setIsShocked(false), 1200)
      return
    }

    // New form filler commands
    if (command === 'scan-forms') {
      await handleScanForms()
      return
    }

    if (command === 'fill-forms') {
      await handleFillForms()
      return
    }

    if (command === 'save-profile') {
      await handleSaveProfile()
      return
    }

    if (command === 'preview-fill') {
      await handlePreviewFill()
      return
    }
  }, [pulseMode, refreshContext])

  // Form filler command handlers
  const handleScanForms = React.useCallback(async () => {
    if (!formFillerLoaded) {
      setMessage('Form filler components are still loading. Please wait a moment.')
      setIsShocked(true)
      window.setTimeout(() => setIsShocked(false), 2000)
      return
    }

    setIsBusy(true)
    setIsThinkingHard(true)
    setMessage('Scanning forms with advanced analysis...')

    try {
      const response = await chrome.runtime.sendMessage({
        type: 'skill-action',
        skill: 'application-writing',
        action: 'scanForms',
        data: {}
      })

      if (response && response.success && response.data) {
        const { analysis, matches, profileAvailable, profileName } = response.data
        const formCount = response.data.forms?.length || 0
        
        let message = `I found ${formCount} form${formCount !== 1 ? 's' : ''} on this page.`
        
        if (analysis?.formType) {
          message += ` This looks like a ${analysis.formType.replace('_', ' ')}.`
        }
        
        if (profileAvailable) {
          message += ` I can fill ${matches?.length || 0} fields using your ${profileName} profile.`
        } else {
          message += ' Set up a profile to enable auto-filling.'
        }

        setMessage(message)
        
        // Highlight first form if available
        if (response.data.forms?.length > 0) {
          const firstField = response.data.scanResult?.visibleFields[0]?.el
          if (firstField) {
            setHighlightTarget(firstField)
          }
        }
      } else {
        setMessage(response?.error || 'Form scan failed. Please try again.')
        setIsShocked(true)
      }
    } catch (error) {
      console.error('Scan forms error:', error)
      setMessage('Failed to scan forms. Please check if the extension is properly loaded.')
      setIsShocked(true)
    }

    window.setTimeout(() => {
      setIsBusy(false)
      setIsThinkingHard(false)
    }, 2000)
  }, [formFillerLoaded])

  const handleFillForms = React.useCallback(async () => {
    if (!formFillerLoaded) {
      setMessage('Form filler components are still loading. Please wait a moment.')
      setIsShocked(true)
      window.setTimeout(() => setIsShocked(false), 2000)
      return
    }

    setIsBusy(true)
    setMessage('Filling forms with your profile data...')
    
    // Show eating expression while filling
    const originalBusy = isBusy
    setIsBusy(false)  // Will be set to true by eating

    try {
      const response = await chrome.runtime.sendMessage({
        type: 'skill-action',
        skill: 'application-writing',
        action: 'fillForms',
        data: { generateContent: true }
      })

      if (response.success && response.data) {
        const { filled, total, message: fillMessage } = response.data
        
        if (filled > 0) {
          setMessage(`Successfully filled ${filled} of ${total} fields! ${fillMessage || ''}`)
          // Show happy expression briefly
          window.setTimeout(() => {
            setIsBusy(false)
            setMode('awake')
            window.setTimeout(() => setMode('idle'), 2000)
          }, 1000)
        } else {
          setMessage('No fields could be filled. Check your profile or try manual filling.')
          setIsShocked(true)
        }
      } else {
        setMessage(response.error || 'Form filling failed. Please update your profile.')
        setIsShocked(true)
      }
    } catch (error) {
      setMessage('Failed to fill forms. Please try again.')
      setIsShocked(true)
    }

    window.setTimeout(() => {
      setIsBusy(false)
      setIsThinkingHard(false)
    }, 3000)
  }, [formFillerLoaded, isBusy])

  const handleSaveProfile = React.useCallback(async () => {
    setIsBusy(true)
    setIsThinkingHard(true)
    setMessage('Extracting form data to create profile...')

    try {
      const response = await chrome.runtime.sendMessage({
        type: 'skill-action',
        skill: 'application-writing',
        action: 'createProfileFromForm',
        data: { profileName: `Profile from ${window.location.hostname}` }
      })

      if (response.success && response.data) {
        setMessage('Profile created successfully! You can now use it for form filling.')
        // Show happy expression
        setMode('awake')
        window.setTimeout(() => setMode('idle'), 2000)
      } else {
        setMessage(response.error || 'Failed to create profile. Make sure there are filled fields on the page.')
        setIsShocked(true)
      }
    } catch (error) {
      setMessage('Failed to create profile. Please try again.')
      setIsShocked(true)
    }

    window.setTimeout(() => {
      setIsBusy(false)
      setIsThinkingHard(false)
    }, 2000)
  }, [])

  const handlePreviewFill = React.useCallback(async () => {
    if (!formFillerLoaded) {
      setMessage('Form filler components are still loading. Please wait a moment.')
      setIsShocked(true)
      window.setTimeout(() => setIsShocked(false), 2000)
      return
    }

    setIsBusy(true)
    setIsThinkingHard(true)
    setMessage('Analyzing what I can fill...')

    try {
      const response = await chrome.runtime.sendMessage({
        type: 'skill-action',
        skill: 'application-writing',
        action: 'previewFill',
        data: {}
      })

      if (response.success && response.data) {
        const { matches, total } = response.data
        
        if (total > 0) {
          const preview = matches.slice(0, 3).map((m: any) => 
            `${m.field}: ${m.value}`
          ).join(', ')
          
          setMessage(`I can fill ${total} fields. Preview: ${preview}${total > 3 ? '...' : ''}`)
        } else {
          setMessage('No matching fields found for your current profile.')
          setIsShocked(true)
        }
      } else {
        setMessage(response.error || 'Preview failed. Please check your profile.')
        setIsShocked(true)
      }
    } catch (error) {
      setMessage('Failed to preview fill. Please try again.')
      setIsShocked(true)
    }

    window.setTimeout(() => {
      setIsBusy(false)
      setIsThinkingHard(false)
    }, 2000)
  }, [formFillerLoaded])

  React.useEffect(() => {
    const handleRuntimeMessage = (message: RuntimeMessage) => {
      if (message.type === 'suya-popup-command' && message.command) {
        runCommand(message.command)
      }

      if (message.type === 'inject-ui' && message.data?.message) {
        setMessage(message.data.message)
        pulseMode(message.data.mode ?? 'awake')
      }

      if (message.type === 'remove-ui') {
        setMode('sleeping')
      }
    }

    chrome.runtime.onMessage.addListener(handleRuntimeMessage)
    return () => chrome.runtime.onMessage.removeListener(handleRuntimeMessage)
  }, [pulseMode, runCommand])

  React.useEffect(() => {
    const observer = new MutationObserver(() => {
      window.clearTimeout((window as typeof window & { __suyaObserverTimer?: number }).__suyaObserverTimer)
      ;(window as typeof window & { __suyaObserverTimer?: number }).__suyaObserverTimer = window.setTimeout(() => {
        const next = buildPageContext()
        setLastContext(next)
      }, 900)
    })

    observer.observe(document.body, { childList: true, subtree: true })
    return () => observer.disconnect()
  }, [])

  return (
    <SuyaBot
      mode={mode}
      isActive={mode === 'awake'}
      isBusy={isBusy}
      isThinkingHard={isThinkingHard}
      isShocked={isShocked}
      message={message}
      highlightTarget={highlightTarget}
      onInteraction={() => {
        if (mode === 'sleeping') {
          setMode('awake')
          setMessage('Awake again. Use the popup to choose what you want me to inspect.')
          window.setTimeout(() => setMode('idle'), 1600)
          return
        }

        const context = lastContext
        if (context.hasForms && formFillerLoaded) {
          setMessage(`I found ${context.formCount || 'forms'} on this page. I can help you fill them!`)
        } else {
          setMessage(summarizeContext(context))
        }
        
        setMode('awake')
        window.setTimeout(() => setMode('idle'), 1800)
      }}
    />
  )
}

function mountCharacterUI() {
  if (document.getElementById(ROOT_ID)) {
    return
  }

  const rootElement = document.createElement('div')
  rootElement.id = ROOT_ID
  document.documentElement.appendChild(rootElement)

  const root = ReactDOM.createRoot(rootElement)
  root.render(<CharacterRuntime />)
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', mountCharacterUI, { once: true })
} else {
  mountCharacterUI()
}
