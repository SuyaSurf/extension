/**
 * service-worker.additions.js
 *
 * Paste these additions into your existing service-worker.js (or background.js).
 * Each section is clearly labelled.
 */

import notificationAggregator from './notification-aggregator.js';

/* ═══════════════════════════════════════════════════════════════════
   1. INSTALLATION HANDLER — open onboarding on first install
   ═══════════════════════════════════════════════════════════════════ */

/**
 * Replace or augment your existing chrome.runtime.onInstalled listener.
 * The key change: when reason === 'install', open a new tab pointing at
 * newtab.html so the React OnboardingFlow renders before the dashboard.
 */
chrome.runtime.onInstalled.addListener(async ({ reason }) => {
  if (reason === 'install') {
    await handleInstall();
  } else if (reason === 'update') {
    await handleUpdate();
  }
});

async function handleInstall() {
  // Clear any stale onboarding flag
  await chrome.storage.sync.remove('hasSeenOnboarding');

  // Open the new-tab page — React will show OnboardingFlow
  // because hasSeenOnboarding is not set yet
  chrome.tabs.create({ url: chrome.runtime.getURL('newtab/newtab.html') });

  // Initialise aggregator (polls will be no-ops until keys/perms are set)
  await notificationAggregator.init();

  console.log('[Suya] Fresh install — onboarding opened.');
}

async function handleUpdate() {
  // Re-init aggregator so new alarms are registered
  await notificationAggregator.init();

  // Optional: show a "what's new" badge on the extension icon
  chrome.action.setBadgeText({ text: '✨' });
  chrome.action.setBadgeBackgroundColor({ color: '#FF6B35' });
  setTimeout(() => chrome.action.setBadgeText({ text: '' }), 8000);
}

/* ═══════════════════════════════════════════════════════════════════
   2. SERVICE WORKER STARTUP — re-init aggregator after SW restart
   ═══════════════════════════════════════════════════════════════════ */

// Service workers are terminated and restarted — re-init on each startup
(async () => {
  await notificationAggregator.init();
})();

/* ═══════════════════════════════════════════════════════════════════
   3. MESSAGE ROUTING — forward quick-action commands from new-tab
   ═══════════════════════════════════════════════════════════════════ */

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  switch (msg.type) {

    /* ── Quick actions from new-tab ── */
    case 'START_DAILY_BRIEFING':
      handleDailyBriefing(sender).then(sendResponse);
      return true;

    case 'FILL_CURRENT_FORM':
      injectFormFiller(sender).then(sendResponse);
      return true;

    case 'ANALYZE_CURRENT_PAGE':
      injectPageAnalyzer(sender).then(sendResponse);
      return true;

    case 'START_VOICE':
      toggleVoiceOnActiveTab().then(sendResponse);
      return true;

    case 'SKILL_GAP_ANALYSIS':
      openSkillGapTab().then(sendResponse);
      return true;

    case 'SHOW_TRENDING':
      fetchTrending().then(sendResponse);
      return true;

    /* ── Meeting assistant ── */
    case 'MEETING_MEETING_STARTED':
      chrome.action.setBadgeText({ text: '🔴' });
      chrome.action.setBadgeBackgroundColor({ color: '#FF4444' });
      sendResponse({ ok: true });
      break;

    case 'MEETING_MEETING_SUMMARY_READY':
      chrome.action.setBadgeText({ text: '' });
      chrome.storage.local.set({ lastMeetingSummary: msg.summary });
      sendResponse({ ok: true });
      break;
  }
});

/* ── Handler implementations ── */

async function handleDailyBriefing(sender) {
  const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  if (!tab?.id) return { ok: false };
  await chrome.tabs.sendMessage(tab.id, { type: 'SUYA_DAILY_BRIEFING' }).catch(() => {});
  return { ok: true };
}

async function injectFormFiller(sender) {
  const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  if (!tab?.id) return { ok: false };
  await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    files:  ['content-scripts/form-filler-trigger.js'],
  }).catch(() => {});
  return { ok: true };
}

async function injectPageAnalyzer(sender) {
  const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  if (!tab?.id) return { ok: false };
  await chrome.tabs.sendMessage(tab.id, { type: 'SUYA_ANALYZE_PAGE' }).catch(() => {});
  return { ok: true };
}

async function toggleVoiceOnActiveTab() {
  const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  if (!tab?.id) return { ok: false };
  await chrome.tabs.sendMessage(tab.id, { type: 'SUYA_TOGGLE_VOICE' }).catch(() => {});
  return { ok: true };
}

async function openSkillGapTab() {
  chrome.tabs.create({ url: chrome.runtime.getURL('settings/settings.html#skill-gap') });
  return { ok: true };
}

async function fetchTrending() {
  // Delegate to news aggregator skill
  const [tab] = await chrome.tabs.query({ url: chrome.runtime.getURL('newtab/newtab.html') });
  if (tab?.id) {
    chrome.tabs.sendMessage(tab.id, { type: 'SHOW_TRENDING_FEED' }).catch(() => {});
  }
  return { ok: true };
}
