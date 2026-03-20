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
}

type PopupCommand = 'analyze-page' | 'highlight-forms' | 'highlight-buttons' | 'sleep' | 'wake'

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

function getPrimaryText(): string {
  const main = document.querySelector('main, article, [role="main"]')
  const source = main?.textContent ?? document.body.textContent ?? ''
  return source.replace(/\s+/g, ' ').trim().slice(0, 240)
}

function buildPageContext(): PageContext {
  return {
    url: window.location.href,
    domain: window.location.hostname,
    path: window.location.pathname,
    title: document.title,
    type: detectPageType(),
    language: document.documentElement.lang || 'en',
    hasForms: Boolean(document.querySelector('form')),
    hasButtons: Boolean(document.querySelector('button, input[type="button"], input[type="submit"]')),
    hasInputs: Boolean(document.querySelector('input, textarea, select')),
    primaryText: getPrimaryText()
  }
}

function findHighlightTarget(command: PopupCommand): HTMLElement | null {
  if (command === 'highlight-forms') {
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
    context.hasForms ? 'I found forms you can act on.' : '',
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

  const runCommand = React.useCallback((command: PopupCommand) => {
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
      setMessage(target ? 'I highlighted the main form area for your decision.' : 'I could not find a form to highlight here.')
      setIsShocked(!target)
      window.setTimeout(() => setIsShocked(false), 1200)
      return
    }

    if (command === 'highlight-buttons') {
      setMessage(target ? 'I highlighted the main action controls on this page.' : 'I could not find obvious action controls here.')
      setIsShocked(!target)
      window.setTimeout(() => setIsShocked(false), 1200)
    }
  }, [pulseMode, refreshContext])

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

        setMessage(summarizeContext(lastContext))
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
