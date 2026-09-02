const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const playwrightModule = process.env.BILIPLUS_PLAYWRIGHT_MODULE || 'playwright';
const { chromium } = require(playwrightModule);

const extensionPath = path.resolve(__dirname, '..');
const executablePath = process.env.BILIPLUS_CHROMIUM_EXECUTABLE;
const cycleCount = Number.parseInt(process.env.BILIPLUS_E2E_CYCLES || '1', 10);

if (!executablePath || !fs.existsSync(executablePath)) {
  throw new Error('Set BILIPLUS_CHROMIUM_EXECUTABLE to a Chromium binary that supports unpacked extensions.');
}

const featureSettings = Object.freeze({
  'biliplus-enable': true,
  'clean-home-page': true,
  'hide-live-content': true,
  'hide-ad-content': true,
  'feed-roll-history-btn': true,
  'reject-information-cocoon': true,
  'stepless-video-rate': true,
  'video-rate-remember': true,
  'auto-widescreen': true,
  'autoplay-mode': 'off',
  'hide-hot-search-list': true,
  'search-history-limit': 20,
  'ai-conclusion': false,
  'invalid-video-info': false,
  'cover-viewer': false,
  'auto-subtitle': false,
});

async function isVisible(locator) {
  return (await locator.count()) > 0 && locator.first().isVisible();
}

async function runCycle(cycle) {
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), `biliplus-live-e2e-${cycle}-`));
  const result = { cycle, assertions: [], extensionErrors: [] };
  let context;

  try {
    context = await chromium.launchPersistentContext(profile, {
      headless: true,
      executablePath,
      viewport: { width: 1440, height: 1000 },
      args: [
        `--disable-extensions-except=${extensionPath}`,
        `--load-extension=${extensionPath}`,
      ],
    });

    let workers = context
      .serviceWorkers()
      .filter(worker => worker.url().endsWith('/scripts/background/service-worker.js'));
    if (!workers.length) {
      workers = [
        await context.waitForEvent('serviceworker', {
          predicate: worker =>
            worker.url().endsWith('/scripts/background/service-worker.js'),
          timeout: 15000,
        }),
      ];
    }
    const worker = workers[0];
    const extensionId = new URL(worker.url()).host;
    await worker.evaluate(async settings => {
      await chrome.storage.sync.clear();
      await chrome.storage.local.clear();
      await chrome.storage.sync.set(settings);
      await chrome.storage.local.set({
        'search-history': ['BiliPlus 自动化', '本地历史验证'],
      });
    }, featureSettings);

    const page = context.pages()[0];
    let recommendationRequestCount = 0;
    page.on('request', request => {
      if (request.url().includes('/x/web-interface/wbi/index/top/feed/rcmd')) {
        recommendationRequestCount += 1;
      }
    });
    const extensionOrigin = `chrome-extension://${extensionId}/`;
    page.on('pageerror', error => {
      const diagnostic = error.stack || String(error);
      if (diagnostic.includes(extensionOrigin) || /BiliPlus|stepless|biliplus/i.test(diagnostic)) {
        result.extensionErrors.push(diagnostic);
      }
    });
    page.on('console', message => {
      const sourceUrl = message.location().url || '';
      if (
        message.type() === 'error' &&
        (sourceUrl.startsWith(extensionOrigin) || /BiliPlus|stepless|biliplus/i.test(message.text()))
      ) {
        result.extensionErrors.push(`${sourceUrl} ${message.text()}`.trim());
      }
    });
    worker.on('console', message => {
      if (message.type() === 'error') result.extensionErrors.push(`service worker: ${message.text()}`);
    });

    await page.goto(`chrome-extension://${extensionId}/settings/popup.html`);
    await page.waitForFunction(() => document.body.getAttribute('aria-busy') === 'false');
    assert.match(await page.locator('#module-summary').textContent(), /10 项增强.*总开关已开启/);
    assert.equal(await page.locator('#home-summary').textContent(), '5 项已配置');
    assert.equal(await page.locator('#playback-summary').textContent(), '4 项已配置');
    assert.equal(await page.locator('#search-summary').textContent(), '1 项已配置');
    await page.locator('.popup-master .switch').click();
    await page.waitForFunction(() => document.querySelector('#module-summary')?.textContent.includes('总开关已关闭'));
    assert.equal(
      await page.locator('#master-toggle').evaluate(element => element === document.activeElement),
      true,
    );
    await page.locator('.popup-master .switch').click();
    await page.waitForFunction(() => document.querySelector('#module-summary')?.textContent.includes('总开关已开启'));
    await page.locator('#master-toggle').evaluate(element => {
      element.focus();
      element.checked = false;
      element.dispatchEvent(new Event('change', { bubbles: true }));
      element.checked = true;
      element.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await page.waitForFunction(() => document.querySelector('.popup-master')?.getAttribute('aria-busy') === 'false');
    await page.waitForFunction(async () => (
      await chrome.storage.sync.get('biliplus-enable')
    )['biliplus-enable'] === true);
    assert.equal(await page.locator('#master-toggle').isChecked(), true);
    result.assertions.push('compact popup reports configured modules without duplicating all switches');

    await page.goto(`chrome-extension://${extensionId}/settings/settings.html`);
    assert.equal(await page.title(), 'BiliPlus 设置');
    await page.waitForFunction(() => document.body.getAttribute('aria-busy') === 'false');
    assert.equal(await page.locator('[data-setting="hide-ad-content"]').isChecked(), true);
    assert.equal(
      await page.locator('[data-setting="reject-information-cocoon"]').isChecked(),
      true,
    );
    assert.equal(await page.locator('[data-setting="invalid-video-info"]').isChecked(), false);
    assert.equal(await page.locator('[data-setting="autoplay-mode"]').inputValue(), 'off');
    const adSetting = page.locator('label:has(input[data-setting="hide-ad-content"])');
    await adSetting.click();
    await page.waitForFunction(() => document.querySelector('#save-state')?.textContent.includes('已保存'));
    assert.equal(
      await page.locator('[data-setting="hide-ad-content"]').evaluate(element => element === document.activeElement),
      true,
    );
    assert.equal(
      (await worker.evaluate(() => chrome.storage.sync.get('hide-ad-content')))['hide-ad-content'],
      false,
    );
    await adSetting.click();
    await page.waitForTimeout(150);
    await page.locator('[data-setting="hide-ad-content"]').evaluate(element => {
      element.focus();
      element.checked = false;
      element.dispatchEvent(new Event('change', { bubbles: true }));
      element.checked = true;
      element.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await page.waitForFunction(() => (
      document.querySelector('[data-setting="hide-ad-content"]')
        ?.closest('.setting-row')
        ?.getAttribute('aria-busy') === 'false'
    ));
    await page.waitForFunction(async () => (
      await chrome.storage.sync.get('hide-ad-content')
    )['hide-ad-content'] === true);
    assert.equal(await page.locator('[data-setting="hide-ad-content"]').isChecked(), true);
    result.assertions.push('full-page settings restore and persist values');

    await worker.evaluate(() => chrome.storage.sync.set({
      'hide-user-comment': [
        { mid: '393341686', uname: '测试用户', upic: '' },
        { mid: '2', uname: '第二位用户', upic: '' },
      ],
    }));
    await page.goto(`chrome-extension://${extensionId}/settings/settings-hide-user-comment.html`);
    await page.waitForFunction(() => document.body.getAttribute('aria-busy') === 'false');
    assert.equal(await page.locator('.user-card').count(), 2);
    assert.equal(await page.locator('.user-card__avatar').first().getAttribute('alt'), '');
    await page.getByRole('button', { name: '移除 测试用户' }).click();
    await page.waitForFunction(() => document.querySelectorAll('.user-card').length === 1);
    assert.equal(
      await page.getByRole('button', { name: '移除 第二位用户' }).evaluate(element => element === document.activeElement),
      true,
    );
    await page.getByRole('button', { name: '移除 第二位用户' }).click();
    await page.waitForFunction(() => !document.querySelector('.user-card'));
    assert.equal(
      await page.locator('#hidden-users-title').evaluate(element => element === document.activeElement),
      true,
    );
    assert.equal(await page.locator('#empty-state').isVisible(), true);
    assert.deepEqual(
      (await worker.evaluate(() => chrome.storage.sync.get('hide-user-comment')))['hide-user-comment'],
      [],
    );
    result.assertions.push('hidden-user manager exposes accessible removal and empty feedback');

    await page.waitForFunction(async expectedRuleCount => {
      const rules = await chrome.declarativeNetRequest.getDynamicRules();
      return rules.length === expectedRuleCount;
    }, 9);
    await context.addCookies([
      {
        name: 'biliplus_e2e_session',
        value: 'present',
        domain: '.bilibili.com',
        path: '/',
        secure: true,
        sameSite: 'Lax',
      },
    ]);
    let aiConclusionRequestHeaders = null;
    await page.route(
      'https://api.bilibili.com/x/web-interface/view/conclusion/get**',
      async route => {
        aiConclusionRequestHeaders = await route.request().allHeaders();
        await route.fulfill({
          contentType: 'application/json',
          body: JSON.stringify({
            code: 0,
            message: '0',
            data: {
              model_result: {
                summary: 'BiliPlus AI 总结联调成功',
                outline: [
                  {
                    title: '验证章节',
                    part_outline: [
                      { timestamp: 12, content: '登录态与响应结构均已兼容' },
                    ],
                  },
                ],
              },
            },
          }),
        });
      },
    );
    await worker.evaluate(() => chrome.storage.sync.set({ 'ai-conclusion': true }));

    await page.goto('https://www.bilibili.com/', {
      waitUntil: 'domcontentloaded',
      timeout: 60000,
    });
    await page.waitForFunction(
      () => document.querySelectorAll('.feed-card,.bili-video-card').length >= 8,
      null,
      { timeout: 30000 },
    );
    await page.waitForFunction(
      () =>
        (document.querySelector('.recommended-container_floor-aside .container')
          ?.children.length || 0) >= 50,
      null,
      { timeout: 20000 },
    );
    assert.equal(await page.locator('body[biliplus-clean-mode]').count(), 1);
    assert.equal(await page.locator('html[biliplus-information-cocoon]').count(), 1);
    assert.equal(await page.locator('html[biliplus-hide-live-content]').count(), 1);
    assert.equal(await page.locator('html[biliplus-hide-ad-content]').count(), 1);
    assert.equal(await page.locator('#feed-roll-back-btn').count(), 1);
    assert.equal(await page.locator('#feed-roll-next-btn').count(), 1);
    assert.ok(
      recommendationRequestCount >= 2,
      `clean mode should trigger recommendation backfill, got ${recommendationRequestCount} requests`,
    );
    const cleanGridState = await page.evaluate(() => ({
      scrollY: window.scrollY,
      childCount:
        document.querySelector('.recommended-container_floor-aside .container')
          ?.children.length || 0,
      anchorBridged: Boolean(
        document.querySelector('.load-more-anchor.biliplus-load-more-anchor')
      ),
      gridAutoFlow: getComputedStyle(
        document.querySelector('.recommended-container_floor-aside .container')
      ).gridAutoFlow,
    }));
    assert.equal(cleanGridState.scrollY, 0);
    assert.ok(cleanGridState.childCount >= 50, JSON.stringify(cleanGridState));
    assert.equal(cleanGridState.anchorBridged, false);
    assert.equal(cleanGridState.gridAutoFlow, 'dense');
    result.assertions.push('all home modules mount together');
    result.assertions.push('clean mode backfills the grid without scrolling the page');

    const aiImage = page.locator('.bili-video-card:visible img').first();
    await aiImage.hover();
    await page.waitForSelector('.biliplus-ai-conclusion-button', {
      state: 'visible',
      timeout: 30000,
    });
    await page.locator('.biliplus-ai-conclusion-button').first().click();
    await page.waitForFunction(() =>
      document
        .querySelector('.biliplus-ai-conclusion-card')
        ?.textContent.includes('BiliPlus AI 总结联调成功')
    );
    assert.match(
      aiConclusionRequestHeaders?.cookie || '',
      /biliplus_e2e_session=present/,
    );
    result.assertions.push('AI summary keeps login credentials and renders the current response shape');

    const liveRoomCandidates = await page.locator('a[href*="live.bilibili.com/"]').evaluateAll(links => {
      const urls = links
        .map(link => link.href)
        .filter((href) => {
          try {
            return /^\/\d+\/?$/.test(new URL(href).pathname);
          } catch (_error) {
            return false;
          }
        });
      return [...new Set(urls)].slice(0, 6);
    });
    assert.ok(liveRoomCandidates.length > 0, 'homepage should expose a current live room URL');

    const filterResult = await page.evaluate(async () => {
      const host = document.querySelector('.recommended-container_floor-aside .container') || document.body;
      const createCard = (id, href, nested = false) => {
        const card = document.createElement('div');
        card.id = id;
        card.className = 'feed-card';
        const link = document.createElement('a');
        link.href = href;
        link.textContent = id;
        card.append(link);
        if (!nested) {
          host.append(card);
          return { card, slot: card };
        }
        const slot = document.createElement('div');
        slot.id = `${id}-slot`;
        slot.append(card);
        host.append(slot);
        return { card, slot };
      };
      const ad = createCard(
        'biliplus-e2e-ad',
        'https://cm.bilibili.com/test',
        true
      );
      const live = createCard('biliplus-e2e-live', 'https://live.bilibili.com/1');
      await new Promise(resolve => setTimeout(resolve, 100));
      const output = {
        adDisplay: getComputedStyle(ad.slot).display,
        adReason: ad.slot.dataset.biliplusFilterReason,
        adInnerMarked: ad.card.classList.contains('biliplus-filtered-ad-content'),
        liveDisplay: getComputedStyle(live.slot).display,
        liveReason: live.slot.dataset.biliplusFilterReason,
      };
      ad.slot.remove();
      live.slot.remove();
      return output;
    });
    assert.deepEqual(filterResult, {
      adDisplay: 'none',
      adReason: 'ad',
      adInnerMarked: false,
      liveDisplay: 'none',
      liveReason: 'live',
    });
    result.assertions.push('dynamic live/ad cards are filtered at the outer grid item');

    const historyIconStyle = await page.evaluate(() => {
      const back = document.querySelector('#feed-roll-back-btn svg');
      const next = document.querySelector('#feed-roll-next-btn svg');
      return {
        width: getComputedStyle(back).width,
        height: getComputedStyle(back).height,
        pathCount: back.querySelectorAll('path').length,
        nextTransform: getComputedStyle(next).transform,
      };
    });
    assert.deepEqual(historyIconStyle, {
      width: '16px',
      height: '16px',
      pathCount: 2,
      nextTransform: 'matrix(-1, 0, 0, 1, 0, 0)',
    });
    result.assertions.push('history controls use Bilibili-sized native glyphs');

    const cdp = await context.newCDPSession(page);
    await cdp.send('Network.enable');
    await cdp.send('Network.setCacheDisabled', { cacheDisabled: true });
    const requestUrls = new Map();
    const extraHeaders = new Map();
    cdp.on('Network.requestWillBeSent', event => {
      requestUrls.set(event.requestId, event.request.url);
    });
    cdp.on('Network.requestWillBeSentExtraInfo', event => {
      extraHeaders.set(event.requestId, event.headers);
    });
    const captureRequestHeaders = async baseUrl => {
      const separator = baseUrl.includes('?') ? '&' : '?';
      const probeUrl = `${baseUrl}${separator}biliplus_dnr_probe=${Date.now()}-${Math.random()}`;
      await page.evaluate(async url => {
        try {
          await fetch(url, { credentials: 'include', cache: 'no-store' });
        } catch (_error) {
          // The final request headers are observable even if CORS rejects a response.
        }
      }, probeUrl);
      for (let attempt = 0; attempt < 30; attempt += 1) {
        const entry = [...requestUrls.entries()].find(([, url]) => url === probeUrl);
        if (entry && extraHeaders.has(entry[0])) return extraHeaders.get(entry[0]);
        await page.waitForTimeout(100);
      }
      throw new Error(`Timed out capturing final headers for ${baseUrl}`);
    };
    const anonymousDiscoveryHeaders = await captureRequestHeaders(
      'https://api.bilibili.com/x/web-interface/archive/related?bvid=BV1FXt864EDe',
    );
    const anonymousRecommendationHeaders = await captureRequestHeaders(
      'https://api.bilibili.com/x/web-interface/wbi/index/top/feed/rcmd?fresh_type=3',
    );
    const anonymousOgvRecommendationHeaders = await captureRequestHeaders(
      'https://api.bilibili.com/x/web-interface/index/ogv/rcmd?fresh_type=3',
    );
    const anonymousCourseRecommendationHeaders = await captureRequestHeaders(
      'https://api.bilibili.com/pugv/app/web/floor/switch?load_type=0',
    );
    const authenticatedAccountHeaders = await captureRequestHeaders(
      'https://api.bilibili.com/x/web-interface/nav',
    );
    const readCookie = headers =>
      Object.entries(headers)
        .find(([name]) => name.toLowerCase() === 'cookie')?.[1] || '';
    assert.doesNotMatch(readCookie(anonymousDiscoveryHeaders), /biliplus_e2e_session/);
    assert.doesNotMatch(readCookie(anonymousRecommendationHeaders), /biliplus_e2e_session/);
    assert.doesNotMatch(readCookie(anonymousOgvRecommendationHeaders), /biliplus_e2e_session/);
    assert.doesNotMatch(readCookie(anonymousCourseRecommendationHeaders), /biliplus_e2e_session/);
    assert.match(readCookie(authenticatedAccountHeaders), /biliplus_e2e_session=present/);
    result.assertions.push('cocoon mode strips Cookie only from discovery requests');

    const searchInput = page.locator('.nav-search-input').first();
    await searchInput.click();
    await page.waitForTimeout(500);
    assert.equal(await searchInput.getAttribute('placeholder'), '');
    const trending = page.locator('.search-panel .trending').first();
    if (await trending.count()) {
      assert.equal(await trending.evaluate(element => getComputedStyle(element).display), 'none');
    }
    assert.equal(await isVisible(page.locator('.biliplus-search-history__item')), true);
    await searchInput.fill('猫');
    await page.waitForFunction(() => {
      const suggestions = document.querySelector('.search-panel .suggestions');
      return suggestions && getComputedStyle(suggestions).display !== 'none' && suggestions.textContent.trim();
    }, null, { timeout: 15000 });
    result.assertions.push('search hides hot content but preserves history and suggestions');

    await searchInput.fill('');
    await page.locator('body').click({ position: { x: 700, y: 700 } });
    const candidateVideos = await page.locator('a[href*="/video/"]').evaluateAll(links => {
      const urls = links
        .filter(link => getComputedStyle(link.closest('.feed-card,.bili-video-card') || link).display !== 'none')
        .map(link => link.href)
        .filter((href) => {
          try {
            return new URL(href).pathname.startsWith('/video/');
          } catch (_error) {
            return false;
          }
        });
      return [...new Set(urls)].slice(0, 2);
    });
    assert.ok(candidateVideos.length >= 2, 'homepage should expose at least two playable video URLs');
    await page.evaluate(() => {
      window.__biliplusRollClicks = 0;
      document.querySelector('.roll-btn').addEventListener('click', () => {
        window.__biliplusRollClicks += 1;
      });
      window.__biliplusRestoredNodeClicks = 0;
      const probe = document.createElement('button');
      probe.id = 'biliplus-history-node-probe';
      probe.type = 'button';
      probe.addEventListener('click', () => {
        window.__biliplusRestoredNodeClicks += 1;
      });
      const visibleCard = [...document.querySelectorAll('.feed-card')]
        .find(card => getComputedStyle(card).display !== 'none');
      const liveSignal = document.createElement('a');
      liveSignal.id = 'biliplus-history-live-signal';
      liveSignal.href = 'https://live.bilibili.com/1';
      liveSignal.hidden = true;
      visibleCard.append(probe, liveSignal);
    });
    await page.waitForFunction(() => {
      return document.querySelector('#biliplus-history-node-probe')?.closest('.feed-card')
        ?.classList.contains('biliplus-filtered-live-content');
    });
    await page.keyboard.press('r');
    await page.waitForFunction(() => window.__biliplusRollClicks === 1);
    await page.waitForFunction(() => !document.querySelector('#feed-roll-back-btn').disabled);
    await page.locator('#feed-roll-back-btn').click();
    await page.waitForSelector('#biliplus-history-node-probe', { state: 'attached' });
    await page.waitForFunction(() => {
      const card = document.querySelector('#biliplus-history-node-probe')?.closest('.feed-card');
      return card?.classList.contains('biliplus-filtered-live-content') &&
        card.dataset.biliplusFilterReason?.includes('live');
    });
    await page.locator('#biliplus-history-node-probe').dispatchEvent('click');
    assert.equal(await page.evaluate(() => window.__biliplusRestoredNodeClicks), 1);
    await page.keyboard.press('r');
    await page.waitForFunction(() => window.__biliplusRollClicks === 2);
    await page.waitForFunction(() => !document.querySelector('#biliplus-history-node-probe'));
    await page.waitForFunction(() => !document.querySelector('#feed-roll-back-btn').disabled);
    assert.equal(await page.locator('.feed-card').count() >= 8, true);
    result.assertions.push('R and history preserve card DOM listeners and safely branch to a new page');

    await worker.evaluate(() => chrome.storage.sync.set({
      'hide-live-content': false,
      'hide-ad-content': false,
    }));
    await page.waitForFunction(() => {
      return !document.documentElement.hasAttribute('biliplus-hide-live-content') &&
        !document.documentElement.hasAttribute('biliplus-hide-ad-content');
    });
    await page.locator('#feed-roll-back-btn').click();
    await page.waitForSelector('#biliplus-history-node-probe', { state: 'attached' });
    const restoredFilterState = await page.locator('#biliplus-history-node-probe').evaluate(probe => {
      const card = probe.closest('.feed-card');
      return {
        hiddenClass: card.classList.contains('biliplus-filtered-live-content') ||
          card.classList.contains('biliplus-filtered-ad-content'),
        reason: card.getAttribute('data-biliplus-filter-reason'),
        display: getComputedStyle(card).display,
      };
    });
    assert.equal(restoredFilterState.hiddenClass, false);
    assert.equal(restoredFilterState.reason, null);
    assert.notEqual(restoredFilterState.display, 'none');
    await worker.evaluate(() => chrome.storage.sync.set({
      'hide-live-content': true,
      'hide-ad-content': true,
    }));
    await page.waitForFunction(() => {
      const card = document.querySelector('#biliplus-history-node-probe')?.closest('.feed-card');
      return card?.classList.contains('biliplus-filtered-live-content');
    });
    result.assertions.push('history snapshots follow current live/ad filter settings after restoration');

    await worker.evaluate(() => chrome.storage.sync.set({ 'feed-roll-history-btn': false }));
    await page.waitForFunction(() => {
      return !document.querySelector('#feed-roll-back-btn') &&
        !document.querySelector('#biliplus-history-node-probe');
    });
    await worker.evaluate(() => chrome.storage.sync.set({ 'feed-roll-history-btn': true }));
    await page.waitForSelector('#feed-roll-back-btn');
    result.assertions.push('disabling history restores the native feed before releasing snapshots');

    await page.evaluate(() => history.pushState({}, '', '/video/BV1biliplusroute'));
    await page.waitForFunction(() => {
      return !document.body.hasAttribute('biliplus-clean-mode') &&
        !document.querySelector('#feed-roll-back-btn');
    }, null, { timeout: 5000 });
    await page.evaluate(() => history.pushState({}, '', '/'));
    await page.waitForFunction(() => {
      return document.body.hasAttribute('biliplus-clean-mode') &&
        document.querySelector('#feed-roll-back-btn');
    }, null, { timeout: 5000 });
    result.assertions.push('home modules enter and leave cleanly across same-document routes');

    await page.goto(candidateVideos[0], { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForSelector('video', { timeout: 30000 });
    await page.waitForSelector('.stepless-video-rate-btn', { timeout: 30000 });
    await page.waitForFunction(() => {
      const button = document.querySelector('.bpx-player-ctrl-wide');
      const container = document.querySelector('.bpx-player-container');
      const screen = container?.getAttribute('data-screen');
      return button?.classList.contains('bpx-state-entered') || screen === 'wide' || screen === 'web';
    }, null, { timeout: 10000 });
    assert.equal(await page.locator('body.biliplus-autoplay-blocking').count(), 1);
    await page.locator('.stepless-video-rate-btn-result').click();
    const rateSkin = await page.evaluate(() => {
      const root = document.querySelector('.stepless-video-rate-btn');
      const trigger = document.querySelector('.stepless-video-rate-btn-result');
      const panel = document.querySelector('.stepless-video-rate-box');
      const reset = document.querySelector('.stepless-video-rate-reset-btn');
      const rootStyle = getComputedStyle(root);
      const triggerStyle = getComputedStyle(trigger);
      const panelStyle = getComputedStyle(panel);
      const resetStyle = getComputedStyle(reset);
      return {
        nativeRootClass:
          root.classList.contains('bpx-player-ctrl-btn') &&
          root.classList.contains('bpx-player-ctrl-playbackrate'),
        nativeResultClass: trigger.classList.contains(
          'bpx-player-ctrl-playbackrate-result'
        ),
        rootWidth: rootStyle.width,
        triggerFontWeight: triggerStyle.fontWeight,
        panelBackground: panelStyle.backgroundColor,
        panelRadius: panelStyle.borderRadius,
        panelBorder: panelStyle.border,
        panelShadow: panelStyle.boxShadow,
        panelWidth: panelStyle.width,
        resetRadius: resetStyle.borderRadius,
      };
    });
    assert.deepEqual(rateSkin, {
      nativeRootClass: true,
      nativeResultClass: true,
      rootWidth: '50px',
      triggerFontWeight: '600',
      panelBackground: 'rgba(20, 20, 20, 0.9)',
      panelRadius: '2px',
      panelBorder: '0px none rgb(255, 255, 255)',
      panelShadow: 'none',
      panelWidth: '200px',
      resetRadius: '0px',
    });
    await page.locator('.stepless-video-rate-input').fill('1.75');
    await page.locator('.stepless-video-rate-input').press('Enter');
    await page.waitForFunction(() => Math.abs(document.querySelector('video').playbackRate - 1.75) < 0.001);
    await page.locator('.stepless-video-rate-btn').dispatchEvent('wheel', { deltaY: -100 });
    await page.waitForFunction(() => Math.abs(document.querySelector('video').playbackRate - 1.85) < 0.001);
    assert.equal(
      (await worker.evaluate(() => chrome.storage.sync.get('playback-rate-value')))['playback-rate-value'],
      1.85,
    );
    result.assertions.push('stepless controls use Bilibili player classes and exact visual tokens');
    result.assertions.push('widescreen, autoplay blocking, precise input and wheel coexist');

    await page.goto(candidateVideos[1], { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForSelector('video', { timeout: 30000 });
    await page.waitForSelector('.stepless-video-rate-btn', { timeout: 30000 });
    await page.waitForFunction(
      () => Math.abs(document.querySelector('video').playbackRate - 1.85) < 0.001,
      null,
      { timeout: 30000 },
    );
    result.assertions.push('remembered precise rate is restored on a second real video page');

    await page.evaluate(() => {
      window.__biliplusAutoplayCancelClicks = 0;
      const ending = document.createElement('div');
      ending.id = 'biliplus-live-e2e-ending';
      ending.className = 'bpx-player-ending-related';
      ending.style.cssText = 'position:fixed;inset:20px auto auto 20px;width:240px;height:80px;z-index:2147483647';
      ending.innerHTML = '<button class="bpx-player-ending-related-item-cancel" type="button">取消连播</button>';
      const cancelButton = ending.querySelector('button');
      ending.style.setProperty('display', 'block', 'important');
      cancelButton.style.setProperty('display', 'block', 'important');
      cancelButton.style.width = '120px';
      cancelButton.style.height = '40px';
      cancelButton.addEventListener('click', () => {
        window.__biliplusAutoplayCancelClicks += 1;
        ending.style.removeProperty('display');
      });
      document.body.append(ending);
      document.querySelectorAll('video').forEach(video => video.dispatchEvent(new Event('ended')));
    });
    await page.waitForFunction(() => window.__biliplusAutoplayCancelClicks === 1);
    assert.equal(
      await page.locator('#biliplus-live-e2e-ending').evaluate(element => getComputedStyle(element).display),
      'none',
    );
    result.assertions.push('video ending cancels the real player autoplay countdown path');

    await worker.evaluate(() => chrome.storage.sync.set({ 'biliplus-enable': false }));
    await page.waitForFunction(() => !document.querySelector('.stepless-video-rate-btn'));
    assert.equal(await page.locator('body.biliplus-autoplay-blocking').count(), 0);
    assert.equal(
      (await worker.evaluate(() => chrome.storage.sync.get('playback-rate-value')))['playback-rate-value'],
      1.85,
    );
    result.assertions.push('master pause removes runtime UI without erasing saved rate');

    await worker.evaluate(() => chrome.storage.sync.set({ 'biliplus-enable': true }));
    let liveRoomLayout = null;
    for (const roomUrl of [...liveRoomCandidates].reverse()) {
      await page.goto(roomUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
      await page.waitForFunction(
        () => document.documentElement.hasAttribute('biliplus-hide-live-content'),
        null,
        { timeout: 15000 },
      );
      try {
        await page.waitForSelector('#aside-area-vm', { state: 'attached', timeout: 12000 });
      } catch (_error) {
        continue;
      }
      liveRoomLayout = await page.evaluate(() => {
        const aside = document.querySelector('#aside-area-vm');
        const player = document.querySelector('#player-ctnr');
        const area = document.querySelector('.player-and-aside-area');
        return {
          url: location.href,
          asideDisplay: getComputedStyle(aside).display,
          playerWidth: player?.getBoundingClientRect().width || 0,
          areaWidth: area?.getBoundingClientRect().width || 0,
        };
      });
      break;
    }
    assert.ok(liveRoomLayout, 'a current standard live room should expose the side rail');
    assert.equal(liveRoomLayout.asideDisplay, 'none');
    assert.ok(
      liveRoomLayout.playerWidth >= liveRoomLayout.areaWidth - 2,
      `player should reclaim live-room width: ${JSON.stringify(liveRoomLayout)}`,
    );
    result.assertions.push('live-room side rail is hidden and the player reclaims its width');

    assert.deepEqual([...new Set(result.extensionErrors)], []);
    return result;
  } finally {
    if (context) await context.close();
    fs.rmSync(profile, { recursive: true, force: true });
  }
}

(async () => {
  const results = [];
  for (let cycle = 1; cycle <= cycleCount; cycle += 1) {
    results.push(await runCycle(cycle));
  }
  console.log(JSON.stringify({ cycles: cycleCount, results }, null, 2));
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
