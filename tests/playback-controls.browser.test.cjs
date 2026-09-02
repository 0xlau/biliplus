const test = require('node:test');
const assert = require('node:assert/strict');
const { existsSync } = require('node:fs');
const path = require('node:path');

let chromium = null;
try {
  ({ chromium } = require('playwright'));
} catch (_error) {
  // Playwright 是可选的工作区测试依赖；普通贡献者仍可运行纯逻辑测试。
}

const chromeExecutable = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const projectRoot = path.resolve(__dirname, '..');

test('playback controls survive realistic DOM replacement', {
  skip: !chromium || !existsSync(chromeExecutable)
}, async (t) => {
  const browser = await chromium.launch({
    executablePath: chromeExecutable,
    headless: true
  });
  t.after(() => browser.close());

  const page = await browser.newPage();
  await page.addInitScript(() => {
    const values = {
      'biliplus-enable': true,
      'stepless-video-rate': true,
      'video-rate-remember': true,
      'auto-widescreen': true,
      'autoplay-mode': 'keep',
      'playback-rate-value': 2.25
    };
    const listeners = [];

    window.chrome = {
      storage: {
        sync: {
          get(keys, callback) {
            const result = {};
            for (const key of keys) result[key] = values[key];
            callback(result);
          },
          set(nextValues) {
            const changes = {};
            for (const [key, value] of Object.entries(nextValues)) {
              changes[key] = { oldValue: values[key], newValue: value };
              values[key] = value;
            }
            for (const listener of listeners) listener(changes, 'sync');
          }
        },
        onChanged: {
          addListener(listener) {
            listeners.push(listener);
          }
        }
      }
    };

    window.__playbackStorage = values;
    window.__setPlaybackStorage = (key, value) => window.chrome.storage.sync.set({ [key]: value });
  });

  await page.route('https://www.bilibili.com/**', (route) => route.fulfill({
    contentType: 'text/html',
    body: `<!doctype html>
      <html><body>
        <div id="bilibili-player">
          <div class="bpx-player-container" data-screen="normal">
            <div class="bpx-player-video-wrap"><video></video></div>
            <div class="bpx-player-control-bottom-right">
              <div class="bpx-player-ctrl-btn bpx-player-ctrl-playbackrate">倍速</div>
              <button class="bpx-player-ctrl-wide" type="button">宽屏</button>
            </div>
          </div>
        </div>
      </body></html>`
  }));

  await page.goto('https://www.bilibili.com/video/BV1fixture');
  await page.evaluate(() => {
    const button = document.querySelector('.bpx-player-ctrl-wide');
    button.addEventListener('click', () => {
      button.classList.toggle('bpx-state-entered');
      document.querySelector('.bpx-player-container').dataset.screen =
        button.classList.contains('bpx-state-entered') ? 'wide' : 'normal';
    });
  });

  await page.addStyleTag({ path: path.join(projectRoot, 'css/stepless-video-rate-btn.css') });
  await page.addStyleTag({ path: path.join(projectRoot, 'css/global.css') });
  await page.addScriptTag({ path: path.join(projectRoot, 'scripts/stepless-video-rate.js') });

  await page.waitForSelector('.stepless-video-rate-btn');
  await page.waitForFunction(() => document.querySelector('video').playbackRate === 2.25);

  assert.equal(await page.locator('.stepless-video-rate-btn-value').textContent(), '2.25x');
  assert.equal(
    await page
      .locator('.bpx-player-ctrl-playbackrate:not([data-biliplus-control])')
      .evaluate((element) => getComputedStyle(element).display),
    'none',
  );
  assert.equal(await page.locator('.bpx-player-ctrl-wide').evaluate((element) => element.classList.contains('bpx-state-entered')), true);

  await page.locator('.stepless-video-rate-btn-result').click();
  await page.locator('.stepless-video-rate-input').fill('1.75');
  await page.locator('.stepless-video-rate-input').press('Enter');
  assert.equal(await page.locator('video').evaluate((video) => video.playbackRate), 1.75);
  assert.equal(await page.evaluate(() => window.__playbackStorage['playback-rate-value']), 1.75);

  await page.locator('body').click({ position: { x: 1, y: 1 } });
  await page.keyboard.press('Minus');
  assert.equal(await page.locator('video').evaluate((video) => video.playbackRate), 1.65);
  await page.keyboard.press('Digit0');
  assert.equal(await page.locator('video').evaluate((video) => video.playbackRate), 1);

  await page.locator('.stepless-video-rate-btn').dispatchEvent('wheel', { deltaY: -100 });
  assert.equal(await page.locator('video').evaluate((video) => video.playbackRate), 1.1);
  await page.locator('.stepless-video-rate-btn-result').dispatchEvent('dblclick');
  assert.equal(await page.locator('video').evaluate((video) => video.playbackRate), 1);
  await page.locator('.stepless-video-rate-btn').dispatchEvent('wheel', { deltaY: -100 });
  assert.equal(await page.locator('video').evaluate((video) => video.playbackRate), 1.1);

  await page.evaluate(() => {
    const oldVideo = document.querySelector('video');
    const replacement = document.createElement('video');
    oldVideo.replaceWith(replacement);
  });
  await page.waitForFunction(() => document.querySelector('video').playbackRate === 1.1);

  await page.evaluate(() => {
    const video = document.querySelector('video');
    video.dispatchEvent(new Event('loadstart'));
    video.playbackRate = 1;
  });
  await page.waitForFunction(() => document.querySelector('video').playbackRate === 1.1);

  await page.evaluate(() => {
    window.__cancelCount = 0;
    window.__setPlaybackStorage('autoplay-mode', 'off');
    const staleEnding = document.createElement('div');
    staleEnding.style.display = 'none';
    staleEnding.innerHTML = '<button class="bpx-player-ending-related-item-cancel">旧取消按钮</button>';
    document.body.append(staleEnding);
    const ending = document.createElement('div');
    ending.className = 'bpx-player-ending-related';
    ending.innerHTML = '<button class="bpx-player-ending-related-item-cancel">取消连播</button>';
    ending.querySelector('button').addEventListener('click', () => window.__cancelCount += 1);
    document.body.append(ending);
  });
  await page.waitForFunction(() => window.__cancelCount === 1);
  assert.equal(await page.locator('.bpx-player-ending-related').evaluate((element) => getComputedStyle(element).display), 'none');

  await page.evaluate(() => window.__setPlaybackStorage('biliplus-enable', false));
  await page.waitForFunction(() => !document.querySelector('.stepless-video-rate-btn'));
});
