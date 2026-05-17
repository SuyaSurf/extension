const { chromium } = require('playwright');
const fs = require('fs');
const http = require('http');
const os = require('os');
const path = require('path');

const repoRoot = path.resolve(__dirname, '..');
const extensionPath = path.join(repoRoot, 'build');
const outputRoot = path.join(repoRoot, 'e2e-flow-report');
const screenshotsDir = path.join(outputRoot, 'screenshots');
const reportHtmlPath = path.join(outputRoot, 'suyasurf-e2e-flow-report.html');
const contactSheetPath = path.join(outputRoot, 'suyasurf-e2e-flow-contact-sheet.png');
const reportPdfPath = path.join(outputRoot, 'suyasurf-e2e-flow-report.pdf');
const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'suyasurf-e2e-flow-profile-'));

const screenshots = [];
const findings = [];
const consoleMessages = [];

function cleanDir(dir) {
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function slug(value) {
  return String(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 72);
}

function noteFinding(severity, area, message) {
  findings.push({ severity, area, message });
}

function attachDiagnostics(page, label) {
  page.on('console', (message) => {
    const text = message.text();
    consoleMessages.push({ label, type: message.type(), text });

    if (message.type() === 'error') {
      noteFinding('high', label, `Console error: ${text}`);
    }
  });

  page.on('pageerror', (error) => {
    noteFinding('critical', label, `Page error: ${error.message}`);
  });
}

async function capture(page, flow, title, notes = []) {
  await page.waitForTimeout(350);
  const index = String(screenshots.length + 1).padStart(3, '0');
  const filename = `${index}-${slug(flow)}-${slug(title)}.png`;
  const filePath = path.join(screenshotsDir, filename);

  await page.screenshot({ path: filePath, fullPage: true });
  screenshots.push({
    index,
    flow,
    title,
    notes,
    filename,
    filePath,
    url: page.url(),
  });

  console.log(`[capture] ${index} ${flow} - ${title}`);
}

function startTestServer() {
  const appHtml = `<!doctype html>
    <html lang="en">
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>SuyaSurf E2E Application Form</title>
        <style>
          body { margin: 0; font-family: Inter, system-ui, -apple-system, sans-serif; background: #f7efe6; color: #28170f; }
          header { background: #2f1c12; color: #fff7ef; padding: 34px 48px; }
          main { max-width: 980px; margin: 0 auto; padding: 34px 28px 80px; }
          .hero { display: grid; grid-template-columns: 1.2fr .8fr; gap: 28px; align-items: center; }
          .panel, form { background: #fffaf4; border: 1px solid #e7cdb5; border-radius: 14px; padding: 24px; box-shadow: 0 12px 34px rgba(82, 49, 25, .12); }
          .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
          label { display: grid; gap: 7px; font-size: 13px; font-weight: 700; color: #5b3522; }
          input, select, textarea { font: inherit; border: 1px solid #d9b99c; border-radius: 10px; padding: 11px 12px; background: white; }
          textarea { min-height: 110px; resize: vertical; }
          .full { grid-column: 1 / -1; }
          button { border: 0; border-radius: 10px; padding: 12px 18px; background: #d4632f; color: white; font-weight: 800; cursor: pointer; }
          .secondary { background: #f0ded0; color: #5b3522; }
          .actions { display: flex; gap: 12px; margin-top: 20px; }
          .badge { display: inline-block; padding: 6px 10px; background: #ffe2c7; color: #8b3d18; border-radius: 999px; font-weight: 800; font-size: 12px; }
        </style>
      </head>
      <body>
        <header>
          <span class="badge">Local E2E fixture</span>
          <h1>Product Fellowship Application</h1>
          <p>Representative page with forms, fields, action buttons, and article content for SuyaSurf in-page automation.</p>
        </header>
        <main>
          <section class="hero">
            <div class="panel">
              <h2>Program Details</h2>
              <p>This page intentionally includes mixed fields so the extension can inspect the page, highlight forms, and respond to command messages.</p>
              <button class="secondary">Read program guide</button>
            </div>
            <form id="application-form">
              <div class="grid">
                <label>Full name <input name="fullName" autocomplete="name" /></label>
                <label>Email <input name="email" type="email" autocomplete="email" /></label>
                <label>Company <input name="company" autocomplete="organization" /></label>
                <label>Role <input name="role" autocomplete="organization-title" /></label>
                <label class="full">Why do you want to attend? <textarea name="whyAttend"></textarea></label>
                <label>Track
                  <select name="track">
                    <option>Product Strategy</option>
                    <option>AI Operations</option>
                    <option>Design Systems</option>
                  </select>
                </label>
                <label>Private note <input name="password" type="password" value="SuperSecret123!" /></label>
                <input type="hidden" name="csrfToken" value="hidden-token-123" />
              </div>
              <div class="actions">
                <button type="submit">Submit Application</button>
                <button type="button" class="secondary">Save draft</button>
              </div>
            </form>
          </section>
        </main>
      </body>
    </html>`;

  const articleHtml = `<!doctype html>
    <html lang="en">
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>SuyaSurf E2E Article Page</title>
        <style>
          body { margin: 0; font-family: Georgia, serif; background: #fbfbf7; color: #1f2933; }
          main { max-width: 820px; margin: 0 auto; padding: 56px 28px; }
          article { font-size: 20px; line-height: 1.65; }
          button, a.cta { display: inline-block; border: 0; border-radius: 8px; padding: 11px 16px; background: #0f766e; color: white; text-decoration: none; font-family: system-ui; font-weight: 700; }
        </style>
      </head>
      <body>
        <main>
          <article>
            <h1>Designing reliable browser assistants</h1>
            <p>Browser assistants need clear boundaries, resilient message passing, and visual feedback that tells users what is happening on the page.</p>
            <p>Useful assistants make small, reversible moves and keep the user in control while reducing repetitive work.</p>
            <a class="cta" href="#next">Save article</a>
            <button>Summarize this article</button>
          </article>
        </main>
      </body>
    </html>`;

  const server = http.createServer((request, response) => {
    const url = request.url || '/';
    response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    response.end(url.startsWith('/article') ? articleHtml : appHtml);
  });

  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      resolve({
        server,
        baseUrl: `http://127.0.0.1:${port}`,
        appUrl: `http://127.0.0.1:${port}/application`,
        articleUrl: `http://127.0.0.1:${port}/article`,
      });
    });
  });
}

async function getExtensionId(context) {
  let worker = context.serviceWorkers()[0];
  if (!worker) {
    worker = await context.waitForEvent('serviceworker', { timeout: 15000 });
  }

  const extensionId = worker.url().split('/')[2];
  const manifest = await worker.evaluate(() => chrome.runtime.getManifest());

  if (manifest.name !== 'SuyaSurf Chrome Assistant') {
    noteFinding('critical', 'manifest', `Unexpected extension name: ${manifest.name}`);
  }

  return extensionId;
}

async function seedInstalledUser(page) {
  await page.evaluate(async () => {
    const now = Date.now();
    const settings = {
      newsSources: ['hn', 'techcrunch', 'mit', 'uxc', 'frc'],
      newsUpdateFrequencyMinutes: 30,
      notificationsEnabled: true,
      quietHoursStart: '22:00',
      quietHoursEnd: '08:00',
      apiKeys: { openai: 'configured', anthropic: '', deepseek: '', groq: '' },
      botMode: 'awake',
      expressionSensitivity: 50,
      shrinkOnDrag: true,
      dragRecoveryMinutes: 60,
      positionPreference: 'bottom-right',
      skills: {
        'form-filler': true,
        'page-analyzer': true,
        voice: false,
        mail: false,
        meeting: false,
        news: true,
        'skill-gap': false,
      },
      formProfiles: [
        {
          id: 'demo-profile',
          name: 'Demo Professional Profile',
          type: 'professional',
          fields: { fullName: 'Savvy Way', email: 'savvy@example.test', company: 'SuyaSurf' },
        },
      ],
    };

    await chrome.storage.sync.set({
      hasSeenOnboarding: true,
      settings,
      suyaSettings: settings,
      userProfile: {
        careerFocus: 'technology',
        growthGoal: 'expand',
        learningStyle: 'practical,quick',
        updateFrequency: 'daily',
        recommendedSources: [
          { id: 'hn', name: 'Hacker News', primaryDomain: 'technology', category: 'tech' },
          { id: 'techcrunch', name: 'TechCrunch', primaryDomain: 'technology', category: 'tech' },
          { id: 'mit', name: 'MIT Tech Review', primaryDomain: 'technology', category: 'ai' },
        ],
      },
    });

    await chrome.storage.local.set({
      hasSeenOnboarding: true,
      userProfile: {
        careerFocus: 'technology',
        growthGoal: 'expand',
        learningStyle: 'practical,quick',
        updateFrequency: 'daily',
      },
      notifications: [
        {
          id: 'notif-1',
          type: 'gmail',
          title: 'Follow up with fellowship team',
          message: 'Draft reply is ready for review before 4 PM.',
          timestamp: now - 1000 * 60 * 10,
          priority: 'high',
          actionUrl: 'https://mail.google.com',
          read: false,
        },
        {
          id: 'notif-2',
          type: 'calendar',
          title: 'Product review starts soon',
          message: 'Prepare the launch checklist and regression notes.',
          timestamp: now - 1000 * 60 * 60,
          priority: 'normal',
          read: false,
        },
      ],
      profiles: [
        { id: 'demo-profile', name: 'Demo Professional Profile', email: 'savvy@example.test', isActive: true },
      ],
    });
  });
}

async function clickButton(page, name, timeout = 10000) {
  const button = page.getByRole('button', { name });

  try {
    await button.click({ timeout });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (!/intercepts pointer events|element click intercepted/i.test(message)) {
      throw error;
    }

    noteFinding(
      'high',
      'interaction',
      `Button ${String(name)} was visible and enabled but another element intercepted the click. The harness forced the click to continue coverage.`
    );
    await button.evaluate((element) => element.click());
  }
}

async function sendContentCommand(controllerPage, targetUrl, command) {
  const result = await controllerPage.evaluate(async ({ targetUrl, command }) => {
    const tabs = await chrome.tabs.query({ url: `${targetUrl}*` });
    if (!tabs[0]?.id) {
      return { ok: false, error: 'target tab not found' };
    }

    try {
      await chrome.tabs.sendMessage(tabs[0].id, { type: 'suya-popup-command', command });
      return { ok: true };
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : String(error) };
    }
  }, { targetUrl, command });

  if (!result.ok) {
    noteFinding('high', 'content command', `${command}: ${result.error}`);
  }

  await controllerPage.waitForTimeout(1000);
  return result;
}

async function runOnboardingFlow(context, extensionUrl) {
  const page = await context.newPage();
  attachDiagnostics(page, 'onboarding');
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(extensionUrl('newtab/newtab.html'));
  await page.waitForSelector('.onboarding-flow', { timeout: 15000 });

  await capture(page, 'Onboarding', 'Welcome intro', ['Cold-start user sees the onboarding entry point.']);

  await clickButton(page, /Meet Suya's Personality/i);
  await capture(page, 'Onboarding', 'Expression and mode demo', ['Expression cards and bot communication modes are visible.']);

  await clickButton(page, /Continue to Personalisation/i);
  await page.waitForSelector('.ha-root', { timeout: 10000 });
  await capture(page, 'Onboarding', 'Interest discovery choice', ['User can choose browsing-history analysis or manual setup.']);

  await clickButton(page, /Set Up Manually/i);
  await page.getByRole('button', { name: /technology/i }).click();
  await page.getByRole('button', { name: /business/i }).click();
  await capture(page, 'Onboarding', 'Manual interests selected', ['Manual path works without history permission.']);

  await clickButton(page, /Continue \(2 selected\)/i);
  await page.waitForSelector('.sq-root', { timeout: 10000 });
  await capture(page, 'Onboarding', 'Growth questionnaire starts', ['Questionnaire captures career focus, goals, learning style, time, and frequency.']);

  await page.getByRole('button', { name: /Software Development/i }).click();
  await page.waitForTimeout(800);
  await page.getByRole('button', { name: /New Skills/i }).click();
  await page.waitForTimeout(800);
  await page.getByRole('button', { name: /Practical tutorials/i }).click();
  await page.getByRole('button', { name: /Quick summaries/i }).click();
  await capture(page, 'Onboarding', 'Learning style multi-select', ['Multi-select question supports multiple learning preferences.']);

  await clickButton(page, /Confirm/i);
  await page.waitForTimeout(800);
  await page.getByRole('button', { name: /3–5 hrs/i }).click();
  await page.waitForTimeout(800);
  await page.getByRole('button', { name: /Daily/i }).click();
  await page.waitForSelector('.ak-root', { timeout: 10000 });
  await capture(page, 'Onboarding', 'API provider setup', ['API key setup is shown before personalized sources.']);

  const fakeOpenAIKey = `sk-proj-${'A'.repeat(64)}`;
  await page.locator('.ak-card', { hasText: 'OpenAI' }).locator('input.ak-key-input').fill(fakeOpenAIKey);
  await page.locator('.ak-card', { hasText: 'OpenAI' }).getByRole('button', { name: /Secure Key/i }).click();
  await page.waitForSelector('.ak-card--connected', { timeout: 10000 });
  await capture(page, 'Onboarding', 'API key connected state', ['A syntactically valid local test key marks the provider connected in the isolated profile.']);

  await clickButton(page, /Next Step/i);
  await page.waitForSelector('.ns-root', { timeout: 10000 });
  await capture(page, 'Onboarding', 'Personalized source list', ['News sources are generated from the questionnaire profile.']);

  await page.getByRole('button', { name: /^None$/i }).click();
  await page.locator('.ns-controls .ob-btn--ghost', { hasText: /^All$/i }).click();
  await capture(page, 'Onboarding', 'Source selection controls', ['Bulk source controls keep the user in control of the feed.']);

  const continueWithSources = page.getByRole('button', { name: /Continue with/i });
  if (await continueWithSources.isEnabled()) {
    await clickButton(page, /Continue with/i);
  } else {
    noteFinding(
      'high',
      'onboarding',
      'Manual onboarding reached news setup with zero generated sources, leaving the continue button disabled. The harness advanced via the step navigation to continue visual coverage.'
    );
    await page.locator('.step-navigation .nav-btn.primary').evaluate((button) => {
      button.removeAttribute('disabled');
      button.disabled = false;
      button.click();
    });
  }
  await page.waitForSelector('.gn-root', { timeout: 10000 });
  await capture(page, 'Onboarding', 'Personalized news demo', ['Curated article cards render with relevance and growth insight metadata.']);

  const articleTitle = page.locator('.gn-article__title').first();
  await articleTitle.click();
  await capture(page, 'Onboarding', 'Expanded article insight', ['Article cards expand to show skills gained and action items.']);

  await clickButton(page, /Continue to Quick Actions/i);
  await page.waitForSelector('.qa-root', { timeout: 10000 });
  await capture(page, 'Onboarding', 'Growth dashboard quick actions', ['Recommended actions are grouped by daily, analysis, learning, and automation categories.']);

  await page.locator('.qa-card').first().click();
  await capture(page, 'Onboarding', 'Quick action activation feedback', ['Selecting an onboarding quick action updates the bot guidance state.']);

  await clickButton(page, /Start Your Growth Journey/i);
  await page.waitForTimeout(500);
  if (await page.locator('.onboarding-flow').isVisible().catch(() => false)) {
    await clickButton(page, /Complete Setup/i);
  }
  await page.waitForSelector('.newtab-container', { timeout: 10000 });
  await capture(page, 'Onboarding', 'Completed setup lands on dashboard', ['Completion persists onboarding and transitions to the dashboard.']);

  return page;
}

async function runDashboardFlow(context, extensionUrl) {
  const page = await context.newPage();
  attachDiagnostics(page, 'dashboard');
  await page.setViewportSize({ width: 1440, height: 1100 });
  await page.goto(extensionUrl('newtab/newtab.html'));
  await seedInstalledUser(page);
  await page.reload();
  await page.waitForSelector('.newtab-container', { timeout: 10000 });

  await capture(page, 'Dashboard', 'Existing user dashboard', ['New-tab dashboard loads with seeded feed, notifications, and quick actions.']);

  await page.getByRole('button', { name: /Tech/i }).click();
  await page.getByLabel('Save').first().click();
  await page.getByLabel('Mark as read').first().click();
  await capture(page, 'Dashboard', 'News filter save and read', ['News filtering, save, and read-state controls respond.']);

  await page.getByRole('button', { name: /Unread/i }).click();
  await capture(page, 'Dashboard', 'Unread notification filter', ['Notification filter narrows to unread items.']);

  await page.getByRole('button', { name: /Mark all read/i }).click();
  await capture(page, 'Dashboard', 'Notifications marked read', ['Mark-all-read updates notification state.']);

  await page.getByRole('button', { name: /Daily Briefing/i }).click();
  await capture(page, 'Dashboard', 'Quick action feedback', ['Quick actions show immediate toast feedback after dispatch.']);

  return page;
}

async function runSettingsFlow(context, extensionUrl) {
  const page = await context.newPage();
  attachDiagnostics(page, 'settings');
  await page.setViewportSize({ width: 1360, height: 980 });
  await page.goto(extensionUrl('settings/settings.html'));
  await page.waitForSelector('.settings-page', { timeout: 10000 });

  await capture(page, 'Settings', 'Bot behavior defaults', ['Bot mode, expression sensitivity, drag behavior, and position controls.']);

  await page.locator('select').first().selectOption('sleeping');
  await page.locator('input[type="range"]').fill('72');
  await capture(page, 'Settings', 'Bot behavior edited', ['Changing settings writes through the save flow.']);

  for (const section of ['Skills', 'Form Profiles', 'News', 'Notifications', 'API Keys']) {
    await page.getByRole('button', { name: new RegExp(section, 'i') }).click();
    await capture(page, 'Settings', `${section} section`, [`${section} settings section is navigable from the sidebar.`]);
  }

  const openAIInput = page.getByPlaceholder(/Enter your openai API key/i);
  await openAIInput.fill('configured-for-visual-test');
  await capture(page, 'Settings', 'API key field edit state', ['API key fields are editable and remain masked.']);

  return page;
}

async function runPopupFlow(context, extensionUrl) {
  const page = await context.newPage();
  attachDiagnostics(page, 'popup');
  await page.setViewportSize({ width: 420, height: 900 });
  await page.goto(extensionUrl('popup/popup.html'));
  await page.waitForSelector('#root', { timeout: 10000 });

  await capture(page, 'Popup', 'Command surface', ['Popup renders the decision and command surface.']);

  await page.getByRole('button', { name: /Switch Profile/i }).click();
  await capture(page, 'Popup', 'Command error state outside active tab context', ['Opening the popup URL as a standalone tab cannot target a page, so this documents the fallback error state.']);

  return page;
}

async function runContentScriptFlow(context, extensionUrl, appUrl, articleUrl) {
  const controller = await context.newPage();
  attachDiagnostics(controller, 'content-controller');
  await controller.goto(extensionUrl('newtab/newtab.html'));
  await seedInstalledUser(controller);

  const page = await context.newPage();
  attachDiagnostics(page, 'content-script');
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(appUrl);
  await page.waitForSelector('#suya-character-ui-root', { timeout: 15000 });

  await capture(page, 'In-page Assistant', 'Form page mount', ['Content script mounts Suya on a representative application form.']);

  await sendContentCommand(controller, appUrl, 'analyze-page');
  await capture(page, 'In-page Assistant', 'Analyze page command', ['Analyze command updates the in-page assistant message.']);

  await sendContentCommand(controller, appUrl, 'highlight-forms');
  await capture(page, 'In-page Assistant', 'Highlight forms command', ['Form highlighting targets the first fillable field/form area.']);

  await sendContentCommand(controller, appUrl, 'highlight-buttons');
  await capture(page, 'In-page Assistant', 'Highlight actions command', ['Action highlighting targets primary buttons and links.']);

  await sendContentCommand(controller, appUrl, 'scan-forms');
  await capture(page, 'In-page Assistant', 'Scan forms command', ['Advanced form scanning command completes or surfaces actionable status in-page.']);

  await sendContentCommand(controller, appUrl, 'sleep');
  await capture(page, 'In-page Assistant', 'Sleep command', ['Sleep command quiets the assistant until explicitly woken.']);

  await sendContentCommand(controller, appUrl, 'wake');
  await capture(page, 'In-page Assistant', 'Wake command', ['Wake command restores the assistant to active mode.']);

  const articlePage = await context.newPage();
  attachDiagnostics(articlePage, 'article-content-script');
  await articlePage.setViewportSize({ width: 1440, height: 1000 });
  await articlePage.goto(articleUrl);
  await articlePage.waitForSelector('#suya-character-ui-root', { timeout: 15000 });
  await capture(articlePage, 'In-page Assistant', 'Article page mount', ['General article page receives the assistant without form-specific assumptions.']);

  await sendContentCommand(controller, articleUrl, 'analyze-page');
  await capture(articlePage, 'In-page Assistant', 'Article analyze command', ['Analyze command works on a non-form content page.']);

  return { controller, page, articlePage };
}

async function runReviewSchedulerFlow(context, extensionUrl) {
  const page = await context.newPage();
  attachDiagnostics(page, 'review-scheduler');
  await page.setViewportSize({ width: 1200, height: 1000 });
  await page.goto(extensionUrl('ui/review-scheduler.html'));
  await page.waitForSelector('.container', { timeout: 10000 });

  await capture(page, 'Review Scheduler', 'Empty scheduler', ['Scheduler starts with URL, name, cadence, time, notes, and empty state.']);

  await page.locator('#site-url').fill('https://example.com');
  await page.locator('#review-name').fill('Weekly homepage QA');
  await page.locator('[data-frequency="weekly"]').click();
  await page.locator('#review-notes').fill('Check hero layout, primary CTA, forms, and console errors.');
  await capture(page, 'Review Scheduler', 'Filled schedule form', ['User can configure a scheduled QA review.']);

  await page.getByRole('button', { name: /Schedule Review/i }).click();
  await page.waitForSelector('.review-item', { timeout: 10000 });
  await capture(page, 'Review Scheduler', 'Scheduled review list', ['Scheduled review is persisted into Chrome local storage and displayed in the list.']);

  page.on('dialog', dialog => dialog.accept());
  await page.getByRole('button', { name: /Delete/i }).click();
  await page.waitForSelector('.empty-state', { timeout: 10000 });
  await capture(page, 'Review Scheduler', 'Deleted review state', ['Delete flow removes the scheduled review after confirmation.']);

  return page;
}

function buildReportHtml(extensionId) {
  const generatedAt = new Date().toLocaleString();
  const rows = screenshots.map((shot) => {
    const image = fs.readFileSync(shot.filePath).toString('base64');
    const notes = shot.notes.length
      ? `<ul>${shot.notes.map(note => `<li>${escapeHtml(note)}</li>`).join('')}</ul>`
      : '';

    return `<section class="shot">
      <div class="shot-header">
        <span class="index">${shot.index}</span>
        <div>
          <p class="flow">${escapeHtml(shot.flow)}</p>
          <h2>${escapeHtml(shot.title)}</h2>
        </div>
      </div>
      ${notes}
      <p class="url">${escapeHtml(shot.url)}</p>
      <img src="data:image/png;base64,${image}" alt="${escapeHtml(`${shot.flow} - ${shot.title}`)}" />
    </section>`;
  }).join('\n');

  const findingRows = findings.length
    ? findings.map(f => `<li><strong>${escapeHtml(f.severity)}</strong> ${escapeHtml(f.area)}: ${escapeHtml(f.message)}</li>`).join('')
    : '<li>No blocking findings recorded by the visual E2E capture harness.</li>';

  return `<!doctype html>
    <html>
      <head>
        <meta charset="utf-8" />
        <title>SuyaSurf E2E Flow Screenshot Report</title>
        <style>
          @page { size: A4; margin: 14mm; }
          body { margin: 0; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; color: #1f2933; background: white; }
          .cover { min-height: 920px; display: flex; flex-direction: column; justify-content: center; gap: 18px; page-break-after: always; }
          .cover h1 { font-size: 42px; margin: 0; color: #7a3217; }
          .cover p { font-size: 16px; line-height: 1.55; max-width: 720px; }
          .meta { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; max-width: 720px; }
          .meta div { background: #fff5ec; border: 1px solid #f0d4bd; border-radius: 10px; padding: 12px; }
          .meta strong { display: block; color: #7a3217; font-size: 12px; text-transform: uppercase; letter-spacing: .04em; }
          .summary { page-break-after: always; }
          .summary h2 { font-size: 26px; color: #7a3217; }
          .summary li { margin: 8px 0; }
          .shot { page-break-after: always; }
          .shot-header { display: flex; align-items: center; gap: 14px; border-bottom: 1px solid #ead7c6; padding-bottom: 10px; margin-bottom: 10px; }
          .index { width: 42px; height: 42px; border-radius: 50%; background: #d4632f; color: white; display: grid; place-items: center; font-weight: 800; }
          .flow { margin: 0 0 2px; color: #9a4b23; font-size: 12px; text-transform: uppercase; letter-spacing: .08em; font-weight: 800; }
          h2 { margin: 0; font-size: 22px; }
          ul { margin: 8px 0 10px 20px; padding: 0; }
          li { line-height: 1.45; }
          .url { color: #6b7280; font-size: 10px; overflow-wrap: anywhere; }
          img { width: 100%; max-height: 920px; object-fit: contain; border: 1px solid #e5e7eb; border-radius: 8px; box-shadow: 0 6px 20px rgba(0,0,0,.08); }
        </style>
      </head>
      <body>
        <section class="cover">
          <h1>SuyaSurf E2E Flow Screenshot Report</h1>
          <p>This report captures the user-facing flows exercised through a real Chromium session with the unpacked SuyaSurf extension loaded.</p>
          <div class="meta">
            <div><strong>Generated</strong>${escapeHtml(generatedAt)}</div>
            <div><strong>Extension ID</strong>${escapeHtml(extensionId)}</div>
            <div><strong>Screenshots</strong>${screenshots.length}</div>
            <div><strong>Findings</strong>${findings.length}</div>
          </div>
        </section>
        <section class="summary">
          <h2>Coverage</h2>
          <ul>
            <li>Cold-start onboarding, manual personalization, API provider setup, source selection, news demo, quick actions, and completion.</li>
            <li>Existing-user dashboard news, notifications, and quick action feedback.</li>
            <li>Settings sections for bot behavior, skills, form profiles, news, notifications, and API keys.</li>
            <li>Popup command surface and standalone fallback state.</li>
            <li>In-page assistant mount and command messaging on form and article fixtures.</li>
            <li>Review scheduler create and delete flows.</li>
          </ul>
          <h2>Findings</h2>
          <ul>${findingRows}</ul>
          <p>Authenticated third-party surfaces such as live Gmail, Outlook, WhatsApp, and Telegram were not logged into during this local run. The command affordances and unsupported-page fallback were covered locally.</p>
        </section>
        ${rows}
      </body>
    </html>`;
}

function buildContactSheetHtml() {
  const cards = screenshots.map((shot) => {
    const rel = `screenshots/${shot.filename}`;
    return `<article>
      <img src="${rel}" />
      <div><strong>${shot.index}. ${escapeHtml(shot.flow)}</strong><span>${escapeHtml(shot.title)}</span></div>
    </article>`;
  }).join('\n');

  return `<!doctype html>
    <html>
      <head>
        <meta charset="utf-8" />
        <style>
          body { margin: 0; padding: 24px; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; background: #fff7ef; color: #321b10; }
          h1 { margin: 0 0 18px; font-size: 28px; }
          .grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 14px; }
          article { background: white; border: 1px solid #efd4bd; border-radius: 10px; overflow: hidden; box-shadow: 0 8px 20px rgba(83,48,31,.09); }
          img { width: 100%; height: 160px; object-fit: cover; object-position: top left; display: block; }
          div { padding: 10px; display: grid; gap: 3px; }
          strong { font-size: 12px; color: #92400e; }
          span { font-size: 12px; color: #4b5563; }
        </style>
      </head>
      <body>
        <h1>SuyaSurf E2E Flow Contact Sheet</h1>
        <section class="grid">${cards}</section>
      </body>
    </html>`;
}

async function writeReport(extensionId) {
  const html = buildReportHtml(extensionId);
  fs.writeFileSync(reportHtmlPath, html);
  fs.writeFileSync(path.join(outputRoot, 'contact-sheet.html'), buildContactSheetHtml());

  const browser = await chromium.launch({ headless: true });
  try {
    const pdfPage = await browser.newPage({ viewport: { width: 1200, height: 1600 } });
    await pdfPage.goto(`file://${reportHtmlPath}`, { waitUntil: 'load' });
    await pdfPage.pdf({
      path: reportPdfPath,
      format: 'A4',
      printBackground: true,
      margin: { top: '12mm', right: '12mm', bottom: '12mm', left: '12mm' },
    });

    const sheetPage = await browser.newPage({ viewport: { width: 1440, height: 1800 } });
    await sheetPage.goto(`file://${path.join(outputRoot, 'contact-sheet.html')}`, { waitUntil: 'load' });
    await sheetPage.screenshot({ path: contactSheetPath, fullPage: true });
  } finally {
    await browser.close();
  }
}

async function main() {
  if (!fs.existsSync(path.join(extensionPath, 'manifest.json'))) {
    throw new Error(`Extension build not found at ${extensionPath}. Run npm run build:all first.`);
  }

  cleanDir(outputRoot);
  cleanDir(screenshotsDir);

  const { server, appUrl, articleUrl } = await startTestServer();
  const context = await chromium.launchPersistentContext(userDataDir, {
    headless: false,
    viewport: { width: 1440, height: 1000 },
    ignoreDefaultArgs: ['--disable-extensions'],
    args: [
      `--disable-extensions-except=${extensionPath}`,
      `--load-extension=${extensionPath}`,
      '--no-first-run',
      '--no-default-browser-check',
    ],
  });

  try {
    context.on('page', (page) => attachDiagnostics(page, page.url() || 'new-page'));

    const extensionId = await getExtensionId(context);
    const extensionUrl = (relativePath) => `chrome-extension://${extensionId}/${relativePath}`;

    await runOnboardingFlow(context, extensionUrl);
    await runDashboardFlow(context, extensionUrl);
    await runSettingsFlow(context, extensionUrl);
    await runPopupFlow(context, extensionUrl);
    await runContentScriptFlow(context, extensionUrl, appUrl, articleUrl);
    await runReviewSchedulerFlow(context, extensionUrl);

    const leakedSecret = consoleMessages.some(entry =>
      entry.text.includes('SuperSecret123') || entry.text.includes('hidden-token-123')
    );

    if (leakedSecret) {
      noteFinding('critical', 'privacy', 'Sensitive fixture values appeared in console output');
    }

    await writeReport(extensionId);

    console.log(JSON.stringify({
      extensionId,
      screenshots: screenshots.length,
      reportPdfPath,
      contactSheetPath,
      findings,
      consoleErrorCount: consoleMessages.filter(entry => entry.type === 'error').length,
    }, null, 2));

    if (findings.some(f => ['critical'].includes(f.severity))) {
      process.exitCode = 2;
    }
  } finally {
    await context.close().catch(() => {});
    server.close();
    fs.rmSync(userDataDir, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
