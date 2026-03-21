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
  formType?: string
  isSignInPage?: boolean
  isSearchPage?: boolean
  shouldAppear?: boolean
}

type PopupCommand = 'analyze-page' | 'highlight-forms' | 'highlight-buttons' | 'sleep' | 'wake' | 'fill-forms' | 'scan-forms' | 'save-profile' | 'preview-fill' | 'compose-email' | 'smart-reply' | 'summarize-thread' | 'send-message' | 'run-qa-review' | 'quick-test' | 'take-screenshot' | 'schedule-review' | 'test-element';

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
  const hasForms = Boolean(document.querySelector('form')) || (window as any).FormScanner?.hasFormsOnPage?.();
  let formCount = 0
  let fillableFields = 0
  let formType = 'none'
  let isSignInPage = false
  let isSearchPage = false
  let shouldAppear = false
  
  // Check for Google RSVP forms specifically
  const url = window.location.href.toLowerCase()
  const isGoogleRSVP = /rsvp\.withgoogle\.com|google.*events.*registration/.test(url)
  
  // If formfiller is available, get more accurate counts and analysis
  if ((window as any).FormScanner) {
    try {
      const scanResult = (window as any).FormScanner.scan();
      formCount = scanResult.fields.length
      fillableFields = (window as any).FormScanner.getFillableFieldCount(scanResult)
      formType = (window as any).FormScanner.detectFormType(scanResult)
      isSignInPage = (window as any).FormScanner.isSignInPage()
      isSearchPage = (window as any).FormScanner.isSearchPage()
      
      // Special handling for Google RSVP forms
      if (isGoogleRSVP && scanResult.eventForms?.length > 0) {
        formType = 'application'
        shouldAppear = true
      } else {
        // Determine if bot should appear based on form type and user preferences
        shouldAppear = determineShouldAppear(formType, isSignInPage, isSearchPage, fillableFields)
      }
      
    } catch (e) {
      // Fallback to basic detection
      formCount = document.querySelectorAll('form').length
      fillableFields = document.querySelectorAll('input:not([type="hidden"]), textarea, select').length
      formType = isGoogleRSVP ? 'application' : 'unknown'
      shouldAppear = isGoogleRSVP || fillableFields > 0
    }
  } else {
    formCount = document.querySelectorAll('form').length
    fillableFields = document.querySelectorAll('input:not([type="hidden"]), textarea, select').length
    formType = isGoogleRSVP ? 'application' : 'unknown'
    shouldAppear = isGoogleRSVP || fillableFields > 0
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
    fillableFields,
    formType,
    isSignInPage,
    isSearchPage,
    shouldAppear
  }
}

// Determine if the bot should appear based on form analysis and preferences
function determineShouldAppear(formType: string, isSignInPage: boolean, isSearchPage: boolean, fillableFields: number): boolean {
  // Don't appear on search-dominant pages
  if (isSearchPage || formType === 'search') {
    return false
  }
  
  // Don't appear on sign-in pages unless user has enabled auto-sign-in
  if (isSignInPage || formType === 'signin') {
    // TODO: Check user preferences for auto-sign-in
    // For now, don't appear on sign-in pages
    return false
  }
  
  // Appear on application, registration, contact, and mixed forms
  if (['application', 'contact', 'mixed', 'payment'].includes(formType)) {
    return true
  }
  
  // Appear on wizard forms
  if (formType === 'wizard') {
    return true
  }
  
  // Appear on conditional forms (they have dynamic content)
  if (formType === 'conditional') {
    return true
  }
  
  // For dynamic-potential, appear conservatively
  if (formType === 'dynamic-potential') {
    return true // Show that we're monitoring for potential forms
  }
  
  // Appear if there are fillable fields but it's not a search page
  if (fillableFields > 0 && !isSearchPage) {
    return true
  }
  
  return false
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
  // If bot shouldn't appear, return empty string
  if (!context.shouldAppear) {
    return ''
  }

  // Provide contextual messages based on form type
  switch (context.formType) {
    case 'application':
      return `I found an application form with ${context.fillableFields || 'several'} fields to fill. I can help you complete it!`
    
    case 'contact':
      return `This looks like a contact form. I can help you fill it with your information.`
    
    case 'payment':
      return `I found a payment form with ${context.fillableFields || 'several'} fields. I can help you fill the non-sensitive information.`
    
    case 'wizard':
      return `This is a multi-step form! I can help you fill each step as you progress.`
    
    case 'conditional':
      return `This form has dynamic sections. I'll monitor for new fields that appear.`
    
    case 'dynamic-potential':
      return `I detect potential form content that might appear. I'll keep watching!`
    
    case 'mixed':
      return `I found a form with ${context.fillableFields || 'several'} fillable fields. I can help you complete it!`
    
    default:
      // Generic message for other form types
      const summaryParts = [
        `${context.title || 'This page'} looks like a ${context.type}.`,
        context.hasForms ? `I found ${context.formCount || 'some'} form${(context.formCount || 0) !== 1 ? 's' : ''} with ${context.fillableFields || 'some'} fillable fields.` : '',
        context.hasButtons ? 'There are actionable controls on the page.' : '',
        context.primaryText ? `Preview: ${context.primaryText}` : ''
      ].filter(Boolean)

      return summaryParts.join(' ')
  }
}

const CharacterRuntime: React.FC = () => {
  console.log('[Suya] CharacterRuntime component rendering');
  
  const [mode, setMode] = React.useState<SuyaMode>('idle')
  const [message, setMessage] = React.useState('Suya is here when you need help deciding what to do on this page.')
  const [isBusy, setIsBusy] = React.useState(false)
  const [isThinkingHard, setIsThinkingHard] = React.useState(false)
  const [isShocked, setIsShocked] = React.useState(false)
  const [highlightTarget, setHighlightTarget] = React.useState<HTMLElement | null>(null)
  const [lastContext, setLastContext] = React.useState<PageContext>(() => buildPageContext())
  const [formFillerLoaded, setFormFillerLoaded] = React.useState(false)

  // Update initial message based on context analysis
  React.useEffect(() => {
    const context = lastContext
    if (context.shouldAppear && context.formType && context.formType !== 'none') {
      const contextualMessage = summarizeContext(context)
      if (contextualMessage) {
        setMessage(contextualMessage)
      }
    } else if (!context.shouldAppear) {
      setMessage('I\'m monitoring this page. Wake me if you need help with anything!')
    }
  }, [lastContext.shouldAppear, lastContext.formType])

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

    // QA Testing commands
    if (command === 'run-qa-review') {
      await handleRunQAReview()
      return
    }

    if (command === 'quick-test') {
      await handleQuickTest()
      return
    }

    if (command === 'take-screenshot') {
      await handleTakeScreenshot()
      return
    }

    if (command === 'schedule-review') {
      await handleScheduleReview()
      return
    }

    if (command === 'test-element') {
      await handleTestElement()
      return
    }

    // Mail and Chat command handlers
    if (command === 'compose-email') {
      await handleComposeEmail()
      return
    }

    if (command === 'smart-reply') {
      await handleSmartReply()
      return
    }

    if (command === 'summarize-thread') {
      await handleSummarizeThread()
      return
    }

    if (command === 'send-message') {
      await handleSendMessage()
      return
    }
  }, [pulseMode, refreshContext])

  // Mail and Chat handlers
  const handleComposeEmail = React.useCallback(async () => {
    const pageType = detectPageType()
    
    if (!['gmail', 'outlook'].includes(pageType)) {
      setMessage('Email composition is only available on Gmail and Outlook.')
      setIsShocked(true)
      window.setTimeout(() => setIsShocked(false), 2000)
      return
    }

    setIsBusy(true)
    setIsThinkingHard(true)
    setMessage('Opening email composer...')

    try {
      const response = await chrome.runtime.sendMessage({
        type: 'skill-action',
        skill: 'mail-skills',
        action: 'composeEmail',
        data: { send: false } // Create as draft by default
      })

      if (response && response.success) {
        setMode('awake')
        setMessage(response.message || 'Email composer opened!')
        pulseMode('awake', 3000)
      } else {
        setIsShocked(true)
        setMessage(response?.error || 'Failed to open email composer.')
        window.setTimeout(() => setIsShocked(false), 2000)
      }
    } catch (error) {
      setIsShocked(true)
      setMessage('Failed to communicate with mail skill.')
      window.setTimeout(() => setIsShocked(false), 2000)
    } finally {
      setIsBusy(false)
      setIsThinkingHard(false)
    }
  }, [pulseMode])

  const handleSmartReply = React.useCallback(async () => {
    const pageType = detectPageType()
    
    if (!['web.whatsapp.com', 'web.telegram.org'].includes(window.location.hostname)) {
      setMessage('Smart reply is only available on WhatsApp Web and Telegram Web.')
      setIsShocked(true)
      window.setTimeout(() => setIsShocked(false), 2000)
      return
    }

    setIsBusy(true)
    setIsThinkingHard(true)
    setMessage('Generating smart reply...')

    try {
      // Get selected text or last message
      const selectedText = window.getSelection()?.toString().trim()
      const messageToReply = selectedText || 'Last message in chat'

      const response = await chrome.runtime.sendMessage({
        type: 'skill-action',
        skill: 'chat-skills',
        action: 'getSmartReply',
        data: { message: messageToReply }
      })

      if (response && response.success && response.suggestions) {
        setMode('awake')
        setMessage(`Smart replies: ${response.suggestions.slice(0, 3).join(', ')}`)
        pulseMode('awake', 4000)
      } else {
        setIsShocked(true)
        setMessage('Could not generate smart replies.')
        window.setTimeout(() => setIsShocked(false), 2000)
      }
    } catch (error) {
      setIsShocked(true)
      setMessage('Failed to generate smart reply.')
      window.setTimeout(() => setIsShocked(false), 2000)
    } finally {
      setIsBusy(false)
      setIsThinkingHard(false)
    }
  }, [pulseMode])

  const handleSummarizeThread = React.useCallback(async () => {
    const pageType = detectPageType()
    
    if (!['gmail', 'outlook', 'web.whatsapp.com', 'web.telegram.org'].includes(window.location.hostname) && pageType !== 'gmail' && pageType !== 'outlook') {
      setMessage('Summarization is available on Gmail, Outlook, WhatsApp Web, and Telegram Web.')
      setIsShocked(true)
      window.setTimeout(() => setIsShocked(false), 2000)
      return
    }

    setIsBusy(true)
    setIsThinkingHard(true)
    setMessage('Summarizing conversation...')

    try {
      const skill = ['gmail', 'outlook'].includes(pageType) ? 'mail-skills' : 'chat-skills'
      const action = ['gmail', 'outlook'].includes(pageType) ? 'summarizeThread' : 'summarizeChat'

      const response = await chrome.runtime.sendMessage({
        type: 'skill-action',
        skill: skill,
        action: action,
        data: {}
      })

      if (response && response.success) {
        setMode('awake')
        const summary = response.summary || 'Summary generated successfully'
        setMessage(summary.length > 200 ? summary.substring(0, 200) + '...' : summary)
        pulseMode('awake', 5000)
      } else {
        setIsShocked(true)
        setMessage(response?.error || 'Failed to summarize conversation.')
        window.setTimeout(() => setIsShocked(false), 2000)
      }
    } catch (error) {
      setIsShocked(true)
      setMessage('Failed to summarize conversation.')
      window.setTimeout(() => setIsShocked(false), 2000)
    } finally {
      setIsBusy(false)
      setIsThinkingHard(false)
    }
  }, [pulseMode])

  const handleSendMessage = React.useCallback(async () => {
    const pageType = detectPageType()
    
    if (!['web.whatsapp.com', 'web.telegram.org'].includes(window.location.hostname)) {
      setMessage('Message sending is only available on WhatsApp Web and Telegram Web.')
      setIsShocked(true)
      window.setTimeout(() => setIsShocked(false), 2000)
      return
    }

    // Get selected text as message or prompt for input
    const selectedText = window.getSelection()?.toString().trim()
    
    if (!selectedText) {
      setMessage('Please select the message text you want to send, then click Send Message.')
      setIsShocked(true)
      window.setTimeout(() => setIsShocked(false), 2000)
      return
    }

    setIsBusy(true)
    setIsThinkingHard(true)
    setMessage('Sending message...')

    try {
      const response = await chrome.runtime.sendMessage({
        type: 'skill-action',
        skill: 'chat-skills',
        action: 'sendMessage',
        data: { message: selectedText }
      })

      if (response && response.success) {
        setMode('awake')
        setMessage(response.message || 'Message sent successfully!')
        pulseMode('awake', 3000)
      } else {
        setIsShocked(true)
        setMessage(response?.error || 'Failed to send message.')
        window.setTimeout(() => setIsShocked(false), 2000)
      }
    } catch (error) {
      setIsShocked(true)
      setMessage('Failed to send message.')
      window.setTimeout(() => setIsShocked(false), 2000)
    } finally {
      setIsBusy(false)
      setIsThinkingHard(false)
    }
  }, [pulseMode])

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

  // QA Testing command handlers
  const handleRunQAReview = React.useCallback(async () => {
    setIsBusy(true)
    setIsThinkingHard(true)
    setMessage('Running comprehensive UX review...')

    try {
      const response = await chrome.runtime.sendMessage({
        type: 'skill-action',
        skill: 'ux-review',
        action: 'runReview',
        data: { trigger: 'manual' }
      })

      if (response && response.success) {
        setMessage('UX review completed! I found several insights about this page.')
        setMode('awake')
        window.setTimeout(() => setMode('idle'), 3000)
      } else {
        setMessage(response?.error || 'UX review failed. Please try again.')
        setIsShocked(true)
      }
    } catch (error) {
      setMessage('Failed to run UX review. Please try again.')
      setIsShocked(true)
    }

    window.setTimeout(() => {
      setIsBusy(false)
      setIsThinkingHard(false)
    }, 3000)
  }, [])

  const handleQuickTest = React.useCallback(async () => {
    setIsBusy(true)
    setIsThinkingHard(true)
    setMessage('Running quick QA tests...')

    try {
      const response = await chrome.runtime.sendMessage({
        type: 'skill-action',
        skill: 'qa-testing',
        action: 'runTests',
        data: {}
      })

      if (response && response.success) {
        setMessage('Quick tests completed! Everything looks good.')
        setMode('awake')
        window.setTimeout(() => setMode('idle'), 2000)
      } else {
        setMessage(response?.error || 'Quick tests failed. Please try again.')
        setIsShocked(true)
      }
    } catch (error) {
      setMessage('Failed to run quick tests. Please try again.')
      setIsShocked(true)
    }

    window.setTimeout(() => {
      setIsBusy(false)
      setIsThinkingHard(false)
    }, 2000)
  }, [])

  const handleTakeScreenshot = React.useCallback(async () => {
    setIsBusy(true)
    setMessage('Capturing screenshot...')

    try {
      const response = await chrome.runtime.sendMessage({
        type: 'skill-action',
        skill: 'ux-review',
        action: 'captureScreenshot',
        data: { label: 'manual' }
      })

      if (response && response.success) {
        setMessage('Screenshot captured successfully!')
        setMode('awake')
        window.setTimeout(() => setMode('idle'), 1500)
      } else {
        setMessage(response?.error || 'Screenshot failed. Please try again.')
        setIsShocked(true)
      }
    } catch (error) {
      setMessage('Failed to capture screenshot. Please try again.')
      setIsShocked(true)
    }

    window.setTimeout(() => {
      setIsBusy(false)
    }, 1500)
  }, [])

  const handleScheduleReview = React.useCallback(async () => {
    setMessage('Review scheduling feature coming soon!')
    setIsShocked(true)
    window.setTimeout(() => setIsShocked(false), 2000)
  }, [])

  const handleTestElement = React.useCallback(async () => {
    setIsBusy(true)
    setIsThinkingHard(true)
    setMessage('Testing selected element...')

    try {
      const selection = window.getSelection()
      const selectedElement = selection?.anchorNode?.parentElement
      
      if (selectedElement) {
        // Highlight the selected element
        setHighlightTarget(selectedElement)
        
        // Run element-specific analysis
        const response = await chrome.runtime.sendMessage({
          type: 'skill-action',
          skill: 'ux-review',
          action: 'runReview',
          data: { 
            trigger: 'element-test',
            element: {
              tagName: selectedElement.tagName,
              id: selectedElement.id,
              classes: selectedElement.className,
              text: selectedElement.textContent?.slice(0, 100)
            }
          }
        })

        if (response && response.success) {
          setMessage('Element analysis complete!')
          setMode('awake')
          window.setTimeout(() => setMode('idle'), 2000)
        } else {
          setMessage(response?.error || 'Element analysis failed')
          setIsShocked(true)
        }
      } else {
        setMessage('Please select an element first')
        setIsShocked(true)
      }
    } catch (error) {
      setMessage('Failed to test element')
      setIsShocked(true)
    }

    window.setTimeout(() => {
      setIsBusy(false)
      setIsThinkingHard(false)
    }, 2000)
  }, [])

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

    const handleCharacterMessage = (event: Event) => {
      const customEvent = event as CustomEvent
      const { message, mode, isThinkingHard, isShocked, isBusy } = customEvent.detail
      setMessage(message)
      if (mode) setMode(mode)
      setIsThinkingHard(isThinkingHard || false)
      setIsShocked(isShocked || false)
      setIsBusy(isBusy || false)
    }

    chrome.runtime.onMessage.addListener(handleRuntimeMessage)
    window.addEventListener('suya-character-message', handleCharacterMessage)
    
    return () => {
      chrome.runtime.onMessage.removeListener(handleRuntimeMessage)
      window.removeEventListener('suya-character-message', handleCharacterMessage)
    }
  }, [pulseMode, runCommand])

  React.useEffect(() => {
    const observer = new MutationObserver((mutations) => {
      // Check if mutations might affect form detection
      const significantFormChange = mutations.some(mutation => {
        // Check for new form elements
        const addedNodes = Array.from(mutation.addedNodes)
        return addedNodes.some(node => {
          if (node.nodeType === Node.ELEMENT_NODE) {
            const element = node as Element
            // Check for form-related elements
            return (
              element.tagName === 'FORM' ||
              element.tagName === 'INPUT' ||
              element.tagName === 'TEXTAREA' ||
              element.tagName === 'SELECT' ||
              element.tagName === 'BUTTON' ||
              element.querySelector?.('form, input, textarea, select, button') ||
              element.className?.includes('form') ||
              element.className?.includes('registration') ||
              element.className?.includes('application') ||
              element.getAttribute('data-form') !== null
            )
          }
          return false
        })
      })

      // Only update if there might be form changes
      if (significantFormChange) {
        window.clearTimeout((window as typeof window & { __suyaObserverTimer?: number }).__suyaObserverTimer)
        ;(window as typeof window & { __suyaObserverTimer?: number }).__suyaObserverTimer = window.setTimeout(() => {
          const next = buildPageContext()
          const previous = lastContext
          
          // Check if form detection results changed
          const formDetectionChanged = 
            next.formType !== previous.formType ||
            next.shouldAppear !== previous.shouldAppear ||
            next.fillableFields !== previous.fillableFields ||
            next.formCount !== previous.formCount
          
          setLastContext(next)
          
          // Update message if form detection changed
          if (formDetectionChanged) {
            if (next.shouldAppear && next.formType && next.formType !== 'none') {
              const contextualMessage = summarizeContext(next)
              if (contextualMessage) {
                setMessage(contextualMessage)
                // Briefly show thinking state to indicate re-analysis
                setIsThinkingHard(true)
                window.setTimeout(() => setIsThinkingHard(false), 800)
              }
            } else if (!next.shouldAppear) {
              setMessage('I\'m monitoring this page. Wake me if you need help with anything!')
            }
          }
        }, 900)
      }
    })

    observer.observe(document.body, { 
      childList: true, 
      subtree: true, 
      attributes: true, // Also watch for attribute changes
      attributeFilter: ['class', 'style', 'hidden', 'disabled'] // Watch for visibility changes
    })
    
    return () => observer.disconnect()
  }, [lastContext])

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
        if (!context.shouldAppear) {
          setMessage('This page doesn\'t seem to have forms I can help with. I\'m still monitoring if you need me!')
        } else if (context.hasForms && formFillerLoaded) {
          const contextualMessage = summarizeContext(context)
          setMessage(contextualMessage || `I found ${context.formCount || 'forms'} on this page. I can help you fill them!`)
        } else {
          setMessage(summarizeContext(context))
        }
        
        setMode('awake')
        window.setTimeout(() => setMode('idle'), 1800)
      }}
    />
  )
}

console.log('[Suya] Content script loaded, readyState:', document.readyState)

function mountCharacterUI() {
  if (document.getElementById(ROOT_ID)) {
    console.log('[Suya] Root element already exists, skipping mount')
    return
  }

  console.log('[Suya] Mounting character UI...')
  
  try {
    const rootElement = document.createElement('div')
    rootElement.id = ROOT_ID
    document.documentElement.appendChild(rootElement)
    
    console.log('[Suya] Root element created and appended:', rootElement)
    
    const root = ReactDOM.createRoot(rootElement)
    console.log('[Suya] React root created, rendering CharacterRuntime...')
    
    root.render(<CharacterRuntime />)
    console.log('[Suya] CharacterRuntime render initiated')
  } catch (error) {
    console.error('[Suya] Error mounting CharacterRuntime:', error)
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', mountCharacterUI, { once: true })
} else {
  mountCharacterUI()
}

// Fallback: ensure mount after a short delay in case of race conditions
setTimeout(() => {
  if (!document.getElementById(ROOT_ID)) {
    console.log('[Suya] Fallback mount triggered')
    mountCharacterUI()
  }
}, 800)
