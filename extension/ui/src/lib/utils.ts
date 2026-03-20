import { type ClassValue, clsx } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatDate(date: Date | string | number): string {
  const d = new Date(date)
  return d.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  })
}

export function formatBytes(bytes: number, decimals = 2): string {
  if (bytes === 0) return '0 Bytes'

  const k = 1024
  const dm = decimals < 0 ? 0 : decimals
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB']

  const i = Math.floor(Math.log(bytes) / Math.log(k))

  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i]
}

export function debounce<T extends (...args: any[]) => any>(
  func: T,
  wait: number
): (...args: Parameters<T>) => void {
  let timeout: NodeJS.Timeout
  return (...args: Parameters<T>) => {
    clearTimeout(timeout)
    timeout = setTimeout(() => func(...args), wait)
  }
}

export function throttle<T extends (...args: any[]) => any>(
  func: T,
  limit: number
): (...args: Parameters<T>) => void {
  let inThrottle: boolean
  return (...args: Parameters<T>) => {
    if (!inThrottle) {
      func(...args)
      inThrottle = true
      setTimeout(() => (inThrottle = false), limit)
    }
  }
}

export function generateId(): string {
  return crypto.randomUUID()
}

export function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

export function isValidUrl(string: string): boolean {
  try {
    new URL(string)
    return true
  } catch (_) {
    return false
  }
}

export function extractDomain(url: string): string {
  try {
    const domain = new URL(url).hostname
    return domain.startsWith('www.') ? domain.substring(4) : domain
  } catch (_) {
    return url
  }
}

export function truncateText(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text
  return text.substring(0, maxLength - 3) + '...'
}

export function capitalizeFirstLetter(string: string): string {
  return string.charAt(0).toUpperCase() + string.slice(1)
}

export function camelCaseToTitleCase(str: string): string {
  return str
    .replace(/([A-Z])/g, ' $1')
    .replace(/^./, str => str.toUpperCase())
    .trim()
}

export function getExtensionIconPath(size: 16 | 32 | 48 | 128 = 48): string {
  return chrome.runtime.getURL(`assets/icons/icon-${size}.png`)
}

export async function sendMessageToBackground<T = any>(
  action: string,
  skill: string,
  data?: any
): Promise<T> {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(
      { action, skill, data, messageId: generateId() },
      (response) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message))
        } else if (response?.success) {
          resolve(response.data)
        } else {
          reject(new Error(response?.error || 'Unknown error'))
        }
      }
    )
  })
}

export function createNotification(
  title: string,
  message: string,
  type: 'basic' | 'image' | 'list' = 'basic'
): void {
  chrome.notifications.create({
    type,
    iconUrl: getExtensionIconPath(),
    title,
    message
  })
}

export function openOptionsPage(): void {
  chrome.runtime.openOptionsPage()
}

export function getCurrentTab(): Promise<chrome.tabs.Tab> {
  return new Promise((resolve) => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      resolve(tabs[0])
    })
  })
}

export async function injectContentScript(
  tabId: number,
  file: string
): Promise<void> {
  try {
    await chrome.scripting.executeScript({
      target: { tabId },
      files: [file]
    })
  } catch (error) {
    console.error('Failed to inject content script:', error)
    throw error
  }
}

export function downloadFile(url: string, filename?: string): void {
  chrome.downloads.download({
    url,
    filename: filename || url.split('/').pop() || 'download',
    saveAs: true
  })
}

export function copyToClipboard(text: string): Promise<void> {
  return navigator.clipboard.writeText(text)
}

export async function readClipboard(): Promise<string> {
  return navigator.clipboard.readText()
}

export function isDarkMode(): boolean {
  return window.matchMedia('(prefers-color-scheme: dark)').matches
}

export function watchDarkMode(callback: (isDark: boolean) => void): () => void {
  const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)')
  mediaQuery.addEventListener('change', (e) => callback(e.matches))
  callback(mediaQuery.matches)
  
  return () => {
    mediaQuery.removeEventListener('change', (e) => callback(e.matches))
  }
}
