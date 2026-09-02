const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const playwrightModule = process.env.BILIPLUS_PLAYWRIGHT_MODULE || 'playwright';
const { chromium } = require(playwrightModule);

const projectRoot = path.resolve(__dirname, '..');
const executablePath = process.env.BILIPLUS_CHROMIUM_EXECUTABLE;
const cycleCount = Number.parseInt(process.env.BILIPLUS_INVALID_E2E_CYCLES || '2', 10);
const archiveOrigins = [
  'https://www.biliplus.com/*',
  'https://www.jijidown.com/*',
];

if (!executablePath || !fs.existsSync(executablePath)) {
  throw new Error('Set BILIPLUS_CHROMIUM_EXECUTABLE to Chrome for Testing or Chromium.');
}

async function launchExtension(extensionPath, profilePrefix) {
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), profilePrefix));
  const context = await chromium.launchPersistentContext(profile, {
    headless: true,
    executablePath,
    viewport: { width: 1440, height: 1000 },
    args: [
      `--disable-extensions-except=${extensionPath}`,
      `--load-extension=${extensionPath}`,
    ],
  });
  let workers = context.serviceWorkers().filter(worker =>
    worker.url().endsWith('/scripts/background/service-worker.js')
  );
  if (!workers.length) {
    workers = [await context.waitForEvent('serviceworker', {
      predicate: worker => worker.url().endsWith('/scripts/background/service-worker.js'),
      timeout: 15000,
    })];
  }
  return { context, profile, worker: workers[0] };
}

async function closeExtension(instance) {
  await instance.context.close();
  fs.rmSync(instance.profile, { recursive: true, force: true });
}

async function verifyProductionPermissionSurface() {
  const instance = await launchExtension(projectRoot, 'biliplus-permission-surface-');
  try {
    const { context, worker } = instance;
    const extensionId = new URL(worker.url()).host;
    await worker.evaluate(async () => {
      await chrome.storage.sync.clear();
      await chrome.storage.sync.set({
        'biliplus-enable': true,
        'invalid-video-info': false,
      });
    });
    const page = context.pages()[0];
    await page.goto(`chrome-extension://${extensionId}/settings/settings.html#tools`);
    await page.waitForFunction(() => document.body.getAttribute('aria-busy') === 'false');
    assert.equal(await page.locator('[data-setting="invalid-video-info"]').isChecked(), false);
    assert.match(
      await page.locator('label:has(input[data-setting="invalid-video-info"])').textContent(),
      /首次开启会请求访问这两个站点/
    );
    assert.equal(await page.evaluate(origins => chrome.permissions.contains({ origins }), archiveOrigins), false);
  } finally {
    await closeExtension(instance);
  }
}

function createRuntimeExtension() {
  const runtimeRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'biliplus-invalid-runtime-'));
  for (const relativePath of ['css', 'scripts', 'settings']) {
    fs.cpSync(path.join(projectRoot, relativePath), path.join(runtimeRoot, relativePath), { recursive: true });
  }
  for (const relativePath of ['manifest.json', 'logo.png']) {
    fs.copyFileSync(path.join(projectRoot, relativePath), path.join(runtimeRoot, relativePath));
  }
  const manifestPath = path.join(runtimeRoot, 'manifest.json');
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  manifest.host_permissions = [...new Set([
    ...(manifest.host_permissions || []),
    ...(manifest.optional_host_permissions || []),
  ])];
  delete manifest.optional_host_permissions;
  fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  return runtimeRoot;
}

async function verifyInvalidVideoRuntime(cycle) {
  // Browser UI permission prompts are outside Playwright's page automation.
  // Promote the same declared optional origins only in this disposable copy so
  // the real Bilibili + archive runtime can be exercised without weakening the
  // production manifest.
  const runtimeRoot = createRuntimeExtension();
  const instance = await launchExtension(runtimeRoot, `biliplus-invalid-cycle-${cycle}-`);
  const extensionErrors = [];
  try {
    const { context, worker } = instance;
    const extensionId = new URL(worker.url()).host;
    await worker.evaluate(async () => {
      await chrome.storage.sync.clear();
      await chrome.storage.local.clear();
      await chrome.storage.sync.set({
        'biliplus-enable': true,
        'invalid-video-info': true,
      });
    });

    const page = context.pages()[0];
    const extensionOrigin = `chrome-extension://${extensionId}/`;
    page.on('pageerror', error => {
      const diagnostic = error.stack || String(error);
      if (diagnostic.includes(extensionOrigin) || /BiliPlus|biliplus-invalid/i.test(diagnostic)) {
        extensionErrors.push(diagnostic);
      }
    });
    page.on('console', message => {
      const sourceUrl = message.location().url || '';
      if (message.type() === 'error' && sourceUrl.startsWith(extensionOrigin)) {
        extensionErrors.push(`${sourceUrl} ${message.text()}`.trim());
      }
    });
    worker.on('console', message => {
      if (message.type() === 'error') extensionErrors.push(`service worker: ${message.text()}`);
    });

    await page.goto('https://www.bilibili.com/video/av3/', {
      waitUntil: 'domcontentloaded',
      timeout: 60000,
    });
    await page.waitForSelector('.biliplus-invalid-panel', { state: 'visible', timeout: 30000 });
    await page.waitForFunction(() =>
      document.querySelector('.biliplus-invalid-panel')?.textContent.includes('【电影】后会无期')
    );
    await page.waitForFunction(() => {
      const image = document.querySelector('.biliplus-invalid-panel__cover');
      return image?.complete && image.naturalWidth > 0;
    });

    const panel = page.locator('.biliplus-invalid-panel');
    assert.match(await panel.textContent(), /【电影】后会无期/);
    assert.match(await panel.textContent(), /来源: biliplus/);
    assert.match(
      await panel.locator('.biliplus-invalid-panel__cover').getAttribute('src'),
      /^https:\/\/i0\.hdslb\.com\/bfs\/archive\/9b53b363/
    );
    assert.match(page.url(), /bilibili\.com\/video\/av3/);
    assert.equal(await page.locator('.go-home-from-404').textContent().then(text => /前往首页/.test(text || '')), true);
    assert.deepEqual(extensionErrors, []);

    return { cycle, extensionId, restoredAid: 3 };
  } finally {
    await closeExtension(instance);
    fs.rmSync(runtimeRoot, { recursive: true, force: true });
  }
}

async function main() {
  await verifyProductionPermissionSurface();
  const cycles = [];
  for (let cycle = 1; cycle <= cycleCount; cycle++) {
    cycles.push(await verifyInvalidVideoRuntime(cycle));
  }
  console.log(JSON.stringify({
    ok: true,
    permissionSurface: 'production optional permissions verified',
    cycles,
    title: '【电影】后会无期',
    coverHost: 'i0.hdslb.com',
  }, null, 2));
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
