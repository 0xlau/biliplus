const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'manifest.json'), 'utf8'));

function referencedManifestFiles() {
  const files = [
    manifest.action?.default_popup,
    manifest.options_ui?.page,
    manifest.background?.service_worker,
    ...Object.values(manifest.icons || {}),
  ];

  for (const contentScript of manifest.content_scripts || []) {
    files.push(...(contentScript.js || []), ...(contentScript.css || []));
  }
  return files.filter(Boolean);
}

test('manifest references files that exist in the packaged extension', () => {
  for (const relativePath of referencedManifestFiles()) {
    assert.equal(
      fs.existsSync(path.join(root, relativePath)),
      true,
      `Missing manifest asset: ${relativePath}`,
    );
  }
});

test('compact popup and full-page options are separate surfaces', () => {
  assert.equal(manifest.action.default_popup, 'settings/popup.html');
  assert.deepEqual(manifest.options_ui, {
    page: 'settings/settings.html',
    open_in_tab: true,
  });
});

test('full settings page exposes every new preference once', () => {
  const html = fs.readFileSync(path.join(root, 'settings/settings.html'), 'utf8');
  const requiredKeys = [
    'hide-live-content',
    'hide-ad-content',
    'feed-roll-history-btn',
    'reject-information-cocoon',
    'stepless-video-rate',
    'video-rate-remember',
    'auto-widescreen',
    'autoplay-mode',
    'hide-hot-search-list',
    'search-history-limit',
    'invalid-video-info',
  ];

  for (const key of requiredKeys) {
    const matches = html.match(new RegExp(`data-setting="${key}"`, 'g')) || [];
    assert.equal(matches.length, 1, `${key} should have exactly one settings control`);
  }
});

test('shared content-script dependencies are declared once before their consumers', () => {
  const shared = [
    'scripts/common/md5.min.js',
    'scripts/common/utils.js',
    'scripts/common/bilibili-api.js',
  ];
  for (const file of shared) {
    const owners = manifest.content_scripts.filter(entry => entry.js?.includes(file));
    assert.equal(owners.length, 1, `${file} should have one manifest owner`);
    assert.deepEqual(owners[0].matches, ['https://*.bilibili.com/*']);
  }

  const commonIndex = manifest.content_scripts.findIndex(entry => entry.js?.includes(shared[0]));
  const invalidIndex = manifest.content_scripts.findIndex(entry => entry.js?.includes('scripts/invalid-video-info.js'));
  assert.ok(commonIndex >= 0 && commonIndex < invalidIndex);
});

test('invalid-video archives use runtime host permissions and the isolated proxy module', () => {
  const archiveOrigins = [
    'https://www.biliplus.com/*',
    'https://www.jijidown.com/*',
  ];
  for (const origin of archiveOrigins) {
    assert.ok(manifest.optional_host_permissions.includes(origin));
    assert.equal(manifest.host_permissions.includes(origin), false);
  }

  const worker = fs.readFileSync(path.join(root, manifest.background.service_worker), 'utf8');
  assert.match(worker, /importScripts\(chrome\.runtime\.getURL\('scripts\/background\/archive-proxy\.js'\)\)/);
  assert.equal(fs.existsSync(path.join(root, 'scripts/background/archive-proxy.js')), true);
});

test('information-cocoon mode has the narrow network permissions it needs', () => {
  assert.ok(
    manifest.permissions.includes('declarativeNetRequestWithHostAccess')
  );
  assert.ok(manifest.host_permissions.includes('*://api.bilibili.com/*'));

  const worker = fs.readFileSync(
    path.join(root, manifest.background.service_worker),
    'utf8',
  );
  assert.match(
    worker,
    /importScripts\(chrome\.runtime\.getURL\('scripts\/background\/information-cocoon\.js'\)\)/,
  );
  assert.ok(
    manifest.content_scripts.some(contentScript =>
      contentScript.js?.includes('scripts/information-cocoon-status.js') &&
      contentScript.run_at === 'document_start'
    ),
  );
});

test('extension pages keep executable JavaScript outside HTML for MV3 CSP', () => {
  for (const relativePath of [
    'settings/popup.html',
    'settings/settings.html',
    'settings/settings-hide-user-comment.html',
  ]) {
    const html = fs.readFileSync(path.join(root, relativePath), 'utf8');
    assert.doesNotMatch(html, /<script(?![^>]*\bsrc=)[^>]*>/i, `${relativePath} contains inline script`);
  }
});

test('hidden-user manager has explicit form, status and removal semantics', () => {
  const html = fs.readFileSync(
    path.join(root, 'settings/settings-hide-user-comment.html'),
    'utf8',
  );
  const script = fs.readFileSync(
    path.join(root, 'settings/js/settings-hide-user-comment.js'),
    'utf8',
  );

  assert.match(html, /<form[^>]+id="user-form"/);
  assert.match(html, /role="status"[^>]+aria-live="polite"/);
  assert.match(html, /<label for="user-id-box">/);
  assert.match(html, /id="user-id-box"[^>]+disabled/);
  assert.match(html, /id="add-user"[^>]+disabled/);
  assert.match(html, /id="hidden-users-title"[^>]+tabindex="-1"/);
  assert.match(script, /setAttribute\('aria-label', `移除 \$\{user\.uname\}`\)/);
  assert.match(script, /focusAfterRemoval/);
  assert.match(script, /document\.body\.setAttribute\('aria-busy', 'false'\)/);
  assert.doesNotMatch(html, /jquery|tailwind|daisyUI/i);
});

test('settings saves keep controls focusable and always finish loading state', () => {
  const settingsScript = fs.readFileSync(path.join(root, 'settings/js/settings.js'), 'utf8');
  const popupScript = fs.readFileSync(path.join(root, 'settings/js/popup.js'), 'utf8');

  assert.doesNotMatch(settingsScript, /element\.disabled\s*=\s*true/);
  assert.match(settingsScript, /pendingSaves/);
  assert.match(settingsScript, /document\.body\.setAttribute\('aria-busy', 'false'\)/);
  assert.doesNotMatch(popupScript, /masterToggle\.disabled\s*=\s*true/);
  assert.match(popupScript, /masterSavePending/);
});
