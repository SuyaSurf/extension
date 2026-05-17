const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

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
}

async function main() {
  assertNoTrackedHtmlBundles();
  assertManifestLeastPrivilege(readJson(path.join(extensionDir, 'manifest.json')));
  assertBuildManifestMatchesArtifacts();
  await assertSecurityManagerValidation();
  assertBackgroundMessageRouter();
  assertPopupResponseHardening();
  console.log('All extension production-readiness checks passed.');
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
