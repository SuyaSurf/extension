const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { pathToFileURL } = require('url');

const extensionDir = path.resolve(__dirname, '..');
const buildDir = path.join(extensionDir, 'build');

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function assertNoTrackedHtmlBundles() {
  const sourceHtml = [
    'popup/popup.html',
    'newtab/newtab.html',
    'settings/settings.html',
    'offscreen/offscreen.html'
  ];

  for (const file of sourceHtml) {
    const content = fs.readFileSync(path.join(extensionDir, file), 'utf8');
    assert(!content.includes('bundle.js'), `${file} must stay a source template without generated bundle scripts`);
    assert(!content.includes('\u0000'), `${file} must not contain NUL bytes`);
  }
}

function assertManifestLeastPrivilege(manifest) {
  const contentScripts = manifest.content_scripts || [];
  assert(contentScripts.length > 0, 'manifest must declare content scripts');

  for (const script of contentScripts) {
    assert(!script.matches.includes('<all_urls>'), 'content scripts must not passively match <all_urls>');
  }

  const removedPermissions = ['background', 'cookies', 'webNavigation', 'desktopCapture', 'clipboardRead'];
  for (const permission of removedPermissions) {
    assert(!manifest.permissions.includes(permission), `manifest must not request unused permission: ${permission}`);
  }

  assert((manifest.optional_permissions || []).includes('history'), 'manifest must request history only as an optional permission');
  assert(!JSON.stringify(manifest).includes('698/'), 'manifest must not reference stale webpack chunk 698');
  assert(!manifest.oauth2?.client_id?.includes('YOUR_'), 'manifest must not ship placeholder OAuth client IDs');
}

function assertBuildManifestMatchesArtifacts() {
  const manifestPath = path.join(buildDir, 'manifest.json');
  assert(fs.existsSync(manifestPath), 'build/manifest.json missing; run npm run build:all first');

  const manifest = readJson(manifestPath);
  assertManifestLeastPrivilege(manifest);

  const buildFiles = new Set();
  const walk = (dir, prefix = '') => {
    for (const file of fs.readdirSync(dir)) {
      const fullPath = path.join(dir, file);
      const relativePath = path.join(prefix, file).replace(/\\/g, '/');
      if (fs.statSync(fullPath).isDirectory()) {
        walk(fullPath, relativePath);
      } else {
        buildFiles.add(relativePath);
      }
    }
  };
  walk(buildDir);

  for (const script of manifest.content_scripts || []) {
    for (const js of script.js || []) {
      assert(buildFiles.has(js), `content script artifact is missing: ${js}`);
    }
  }

  for (const html of ['popup/popup.html', 'newtab/newtab.html', 'settings/settings.html', 'offscreen/offscreen.html', 'ui/review-scheduler.html']) {
    assert(buildFiles.has(html), `build artifact is missing ${html}`);
  }
}

async function assertSecurityManagerValidation() {
  const securityPath = path.join(extensionDir, 'shared/security/security-manager.js');
  const source = fs.readFileSync(securityPath, 'utf8')
    .replace(/export\s+\{\s*SecurityManager\s*\};?\s*$/, 'module.exports = { SecurityManager };');
  const sandbox = {
    module: { exports: {} },
    exports: {},
    console,
    crypto: globalThis.crypto,
    TextEncoder,
    TextDecoder,
    chrome: {
      storage: { local: { get: async () => ({}), set: async () => {} } },
      permissions: {
        onAdded: { addListener: () => {} },
        onRemoved: { addListener: () => {} },
        getAll: async () => ({ permissions: [] })
      }
    },
    fetch: async () => ({ ok: true })
  };

  vm.runInNewContext(source, sandbox, { filename: securityPath });
  const { SecurityManager } = sandbox.module.exports;
  const manager = new SecurityManager();
  manager.auditLogger = { log: async () => {} };
  manager.threatDetector = {
    analyzeRequest: async request => request.action === 'danger'
      ? [{ type: 'dangerous_action', severity: 'high' }]
      : [],
    isRateLimited: async senderId => senderId === 'rate-limited'
  };

  const valid = await manager.validateRequest(
    { skill: 'application-writing', action: 'getStatus' },
    { id: 'extension-id', url: 'chrome-extension://extension-id/popup/popup.html' }
  );
  assert.strictEqual(valid.isValid, true, 'valid extension sender should pass request validation');

  const invalid = await manager.validateRequest(
    { skill: 'application-writing', action: 'danger' },
    { id: 'extension-id', url: 'https://evil.example' }
  );
  assert.strictEqual(invalid.isValid, false, 'invalid sender or high severity request should fail validation');
}

function assertBackgroundMessageRouter() {
  const source = fs.readFileSync(path.join(extensionDir, 'background/service-worker.js'), 'utf8');
  const listenerCount = (source.match(/chrome\.runtime\.onMessage\.addListener/g) || []).length;
  assert.strictEqual(listenerCount, 1, 'service worker must have one runtime.onMessage listener');
  assert(source.includes('handleRuntimeMessage'), 'service worker must route messages through handleRuntimeMessage');
  assert(source.includes('createSkillResponse'), 'service worker must normalize skill responses');
}

function assertPopupResponseHardening() {
  const source = fs.readFileSync(path.join(extensionDir, 'ui/src/popup/simple.tsx'), 'utf8');
  assert(source.includes('getSkillPayload'), 'popup must normalize skill responses');
  assert(source.includes('ensureContentScriptAccess'), 'popup must request optional host access before injecting on demand');
  assert(source.includes('isReceivingEndError'), 'popup must recover from missing content-script receivers');
  assert(source.includes('personal-memory'), 'popup must expose the personal memory query flow');
}

function assertNewTabDreamsSurface() {
  const pageSource = fs.readFileSync(path.join(extensionDir, 'ui/src/newtab/NewTabPage.tsx'), 'utf8');
  const dreamsSource = fs.readFileSync(path.join(extensionDir, 'ui/src/newtab/sections/DreamsSection.tsx'), 'utf8');

  assert(pageSource.includes('DreamsSection'), 'newtab dashboard must render the dreams workspace');
  assert(dreamsSource.includes('list-dreams'), 'dreams workspace must list saved dreams');
  assert(dreamsSource.includes('extract-dreams'), 'dreams workspace must extract dream candidates from memory');
  assert(dreamsSource.includes('create-dream-iteration'), 'dreams workspace must create dream iterations');
  assert(dreamsSource.includes('delete-dream-iteration'), 'dreams workspace must delete stale iterations');
}

async function assertPersonalMemorySkill() {
  const storage = {
    suya_ah_projects: {
      proj_1: {
        id: 'proj_1',
        name: 'Startup Accelerator Applications',
        type: 'event_registration',
        domainGroup: 'accelerator.example',
        tags: ['accelerator'],
        recordIds: ['rec_1'],
        pinnedFields: {},
        createdAt: Date.now() - 10_000,
        updatedAt: Date.now() - 5_000
      }
    },
    suya_ah_records: {
      rec_1: {
        id: 'rec_1',
        projectId: 'proj_1',
        url: 'https://accelerator.example/apply',
        urlKey: 'https://accelerator.example/apply',
        formType: 'event_registration',
        metadata: { title: 'Accelerator application' },
        filledAt: Date.now() - 4_000,
        editedFields: [],
        fields: [
          { semanticType: 'company', label: 'Company', value: 'Suya Labs', source: 'profile', confidence: 0.9 },
          { semanticType: 'pitch', label: 'Pitch', value: 'AI assistant for remembered research', source: 'ai', confidence: 0.8 },
          { semanticType: 'password', label: 'Password', value: 'secret-password', source: 'profile', confidence: 0.9 }
        ]
      }
    },
    suya_ah_url_index: {}
  };
  let historyAllowed = false;
  const previousChrome = global.chrome;

  global.chrome = {
    storage: {
      local: {
        get: async keys => {
          if (Array.isArray(keys)) {
            return keys.reduce((acc, key) => {
              acc[key] = storage[key];
              return acc;
            }, {});
          }
          if (typeof keys === 'string') return { [keys]: storage[keys] };
          return { ...storage };
        },
        set: async values => Object.assign(storage, values),
        remove: async keys => {
          for (const key of Array.isArray(keys) ? keys : [keys]) delete storage[key];
        }
      }
    },
    permissions: {
      contains: async request => historyAllowed && request.permissions.includes('history')
    },
    history: {
      search: async () => [
        {
          url: 'https://research.example/startup-accelerator',
          title: 'Startup accelerator research list',
          visitCount: 4,
          lastVisitTime: Date.now() - 2_000
        }
      ]
    }
  };

  try {
    const skillPath = pathToFileURL(path.join(extensionDir, 'skills/personal-memory/skill.js')).href;
    const { PersonalMemorySkill } = await import(`${skillPath}?test=${Date.now()}`);
    const skill = new PersonalMemorySkill({ config: { historyMaxResults: 10 } });

    await skill.initialize();
    await skill.activate();

    const denied = await skill.handleAction('index-history');
    assert.strictEqual(denied.permissionRequired, true, 'history indexing must be gated by optional permission');

    historyAllowed = true;
    const historyResult = await skill.handleAction('index-history');
    assert.strictEqual(historyResult.success, true, 'history indexing should succeed once permission exists');
    assert.strictEqual(historyResult.indexed, 1, 'history index should ingest mocked browser history');

    const formResult = await skill.handleAction('index-form-history');
    assert.strictEqual(formResult.success, true, 'form history indexing should succeed');
    assert.strictEqual(formResult.indexed, 1, 'form history index should ingest saved application history');

    const answer = await skill.handleAction('answer-memory-question', { query: 'accelerator remembered research' });
    assert.strictEqual(answer.success, true, 'memory question should return a successful answer');
    assert(answer.sources.length > 0, 'memory answer must include cited sources');
    assert(!JSON.stringify(answer).includes('secret-password'), 'sensitive form fields must not enter memory answers');

    const related = await skill.handleAction('find-more-like-this', { text: 'startup accelerator research' });
    assert.strictEqual(related.success, true, 'related memory lookup should work from text');

    const dream = await skill.handleAction('create-dream', {
      title: 'Accelerator Dream',
      query: 'accelerator'
    });
    assert.strictEqual(dream.success, true, 'dream creation should succeed from memory search');

    const iteration = await skill.handleAction('create-dream-iteration', {
      dreamId: dream.dream.id,
      variantType: 'application draft',
      prompt: 'Create a sharper accelerator application direction'
    });
    assert.strictEqual(iteration.success, true, 'dream iteration should be created');
    assert(iteration.iteration.body.includes('Source evidence'), 'dream iteration should retain source grounding');

    const listedDreams = await skill.handleAction('list-dreams', { includeSources: true });
    assert.strictEqual(listedDreams.success, true, 'dreams should be listable for dashboard display');
    assert.strictEqual(listedDreams.dreams.length, 1, 'saved dream should appear in list-dreams');
    assert(listedDreams.dreams[0].sources.length > 0, 'listed dreams should expose grounded source summaries');

    const fetchedDream = await skill.handleAction('get-dream', { dreamId: dream.dream.id });
    assert.strictEqual(fetchedDream.success, true, 'dream details should be fetchable');
    assert.strictEqual(fetchedDream.dream.iterations.length, 1, 'dream details should include iterations');

    const deletedIteration = await skill.handleAction('delete-dream-iteration', {
      dreamId: dream.dream.id,
      iterationId: iteration.iteration.id
    });
    assert.strictEqual(deletedIteration.deleted, 1, 'dream iterations should be deletable');
  } finally {
    global.chrome = previousChrome;
  }
}

async function main() {
  assertNoTrackedHtmlBundles();
  assertManifestLeastPrivilege(readJson(path.join(extensionDir, 'manifest.json')));
  assertBuildManifestMatchesArtifacts();
  await assertSecurityManagerValidation();
  assertBackgroundMessageRouter();
  assertPopupResponseHardening();
  assertNewTabDreamsSurface();
  await assertPersonalMemorySkill();
  console.log('All extension production-readiness checks passed.');
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
