const { chromium } = require('playwright');
const http = require('http');
const fs = require('fs');
const os = require('os');
const path = require('path');

const extensionPath = path.resolve(__dirname, '../../build');
const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'suyasurf-e2e-profile-'));
const findings = [];
const consoleMessages = [];

function recordFinding(severity, area, message) {
  findings.push({ severity, area, message });
}

function attachPageDiagnostics(page, label) {
  page.on('console', (msg) => {
    const text = msg.text();
    consoleMessages.push({ label, type: msg.type(), text });
    if (msg.type() === 'error') {
      recordFinding('high', label, `Console error: ${text}`);
    }
  });
  page.on('pageerror', (error) => {
    recordFinding('critical', label, `Page error: ${error.message}`);
  });
}

function startTestServer() {
  const html = `<!doctype html>
    <html>
      <head><title>SuyaSurf E2E Test Form</title></head>
      <body>
        <main>
          <h1>Example Application</h1>
          <form id="application-form">
            <label>Full name <input name="fullName" autocomplete="name" /></label>
            <label>Email <input name="email" type="email" autocomplete="email" /></label>
            <label>Why do you want to attend? <textarea name="whyAttend"></textarea></label>
            <label>Password <input name="password" type="password" value="SuperSecret123!" /></label>
            <input type="hidden" name="csrfToken" value="hidden-token-123" />
            <button type="submit">Submit</button>
          </form>
        </main>
      </body>
    </html>`;

  const server = http.createServer((req, res) => {
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    res.end(html);
  });

  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      resolve({ server, url: `http://127.0.0.1:${port}/` });
    });
  });
}

async function main() {
  if (!fs.existsSync(path.join(extensionPath, 'manifest.json'))) {
    throw new Error(`Extension build not found at ${extensionPath}. Run npm run build:all first.`);
  }

  const { server, url: testUrl } = await startTestServer();
  const context = await chromium.launchPersistentContext(userDataDir, {
    headless: false,
    ignoreDefaultArgs: ['--disable-extensions'],
    args: [
      `--disable-extensions-except=${extensionPath}`,
      `--load-extension=${extensionPath}`,
      '--no-first-run',
      '--no-default-browser-check'
    ]
  });

  try {
    context.on('page', (page) => attachPageDiagnostics(page, page.url() || 'new-page'));

    let serviceWorker = context.serviceWorkers()[0];
    if (!serviceWorker) {
      serviceWorker = await context.waitForEvent('serviceworker', { timeout: 15000 });
    }

    const extensionId = serviceWorker.url().split('/')[2];
    const manifest = await serviceWorker.evaluate(() => chrome.runtime.getManifest());
    if (manifest.name !== 'SuyaSurf Chrome Assistant') {
      recordFinding('critical', 'manifest', `Unexpected extension name: ${manifest.name}`);
    }
    if (manifest.oauth2?.client_id?.includes('YOUR_')) {
      recordFinding('critical', 'manifest', 'Manifest still contains placeholder OAuth client ID');
    }
    if (manifest.content_scripts?.some(script => script.matches?.includes('<all_urls>'))) {
      recordFinding('critical', 'manifest', 'Manifest content scripts still match <all_urls>');
    }

    const extensionUrl = (relativePath) => `chrome-extension://${extensionId}/${relativePath}`;

    const onboardingPage = await context.newPage();
    attachPageDiagnostics(onboardingPage, 'onboarding');
    await onboardingPage.goto(extensionUrl('newtab/newtab.html'));
    await onboardingPage.waitForSelector('#root', { timeout: 10000 });
    await onboardingPage.waitForSelector('.onboarding-flow', { timeout: 10000 });
    await onboardingPage.getByRole('button', { name: /Meet Suya's Personality/i }).click();
    await onboardingPage.getByRole('button', { name: /Continue to Personalisation/i }).click();
    await onboardingPage.getByRole('button', { name: /Set Up Manually/i }).click();

    const dashboardPage = await context.newPage();
    attachPageDiagnostics(dashboardPage, 'newtab-dashboard');
    await dashboardPage.goto(extensionUrl('newtab/newtab.html'));
    await dashboardPage.evaluate(async () => {
      await chrome.storage.sync.set({ hasSeenOnboarding: true });
      await chrome.storage.local.set({ hasSeenOnboarding: true });
    });
    await dashboardPage.reload();
    await dashboardPage.waitForSelector('.newtab-container', { timeout: 10000 });

    let settingsPage;
    try {
      [settingsPage] = await Promise.all([
        context.waitForEvent('page', { timeout: 5000 }),
        dashboardPage.locator('.settings-btn').click()
      ]);
    } catch {
      recordFinding('high', 'newtab-dashboard', 'Settings button did not open settings tab');
      settingsPage = await context.newPage();
      await settingsPage.goto(extensionUrl('settings/settings.html'));
    }
    attachPageDiagnostics(settingsPage, 'settings');
    await settingsPage.waitForLoadState('domcontentloaded');
    await settingsPage.waitForSelector('.settings-page', { timeout: 10000 });
    for (const label of ['Skills', 'API Keys', 'Notifications', 'Memory']) {
      await settingsPage.getByRole('button', { name: new RegExp(label, 'i') }).click();
    }

    const popupPage = await context.newPage();
    attachPageDiagnostics(popupPage, 'popup');
    await popupPage.goto(extensionUrl('popup/popup.html'));
    await popupPage.waitForSelector('#root', { timeout: 10000 });
    await popupPage.getByRole('button', { name: /Analyze page/i }).waitFor({ timeout: 10000 });

    const contentPage = await context.newPage();
    attachPageDiagnostics(contentPage, 'content-script');
    await contentPage.goto(testUrl);
    await contentPage.waitForSelector('#suya-character-ui-root', { timeout: 15000, state: 'attached' });
    const rootExists = await contentPage.locator('#suya-character-ui-root').count();
    if (!rootExists) {
      recordFinding('critical', 'content-script', 'Character UI root did not mount on a normal web page');
    } else {
      const botVisible = await contentPage.locator('[data-suya-bot="true"]').isVisible();
      const rootText = await contentPage.locator('#suya-character-ui-root').textContent().catch(() => '');
      if (!botVisible || !rootText?.trim()) {
        recordFinding('high', 'content-script', 'Character UI root mounted without visible/interactable bot content');
      }
    }

    const sendResult = await dashboardPage.evaluate(async (targetUrl) => {
      const tabs = await chrome.tabs.query({ url: `${targetUrl}*` });
      if (!tabs[0]?.id) return { ok: false, error: 'test tab not found' };
      try {
        await chrome.tabs.sendMessage(tabs[0].id, { type: 'suya-popup-command', command: 'scan-forms' });
        return { ok: true };
      } catch (error) {
        return { ok: false, error: error.message };
      }
    }, testUrl);
    if (!sendResult.ok) {
      recordFinding('high', 'popup/content command', `Could not send scan-forms command to content script: ${sendResult.error}`);
    }

    const leakedSecret = consoleMessages.some((entry) =>
      entry.text.includes('SuperSecret123') || entry.text.includes('hidden-token-123')
    );
    if (leakedSecret) {
      recordFinding('critical', 'privacy', 'Sensitive form values appeared in console output');
    }

    const result = {
      extensionId,
      checkedFlows: [
        'extension service worker loaded',
        'new-tab onboarding intro and manual path',
        'new-tab dashboard after onboarding flag',
        'settings navigation',
        'popup command surface',
        'content-script mount on normal web page',
        'extension tab-to-content command messaging',
        'console privacy leak scan'
      ],
      consoleErrorCount: consoleMessages.filter((entry) => entry.type === 'error').length,
      findings
    };
    console.log(JSON.stringify(result, null, 2));

    if (findings.length > 0) {
      process.exitCode = 2;
    }
  } finally {
    await context.close().catch(() => {});
    server.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
