const test = require('node:test');
const assert = require('node:assert/strict');

const filter = require('../scripts/home-content-filter.js');

test('recognizes live destinations without matching unrelated URLs', () => {
  assert.equal(filter.isLiveHref('//live.bilibili.com/123'), true);
  assert.equal(filter.isLiveHref('https://live.bilibili.com/123?from=feed'), true);
  assert.equal(filter.isLiveHref('https://www.bilibili.com/video/BVlive'), false);
  assert.equal(filter.isLiveHref('https://example.com/live.bilibili.com/123'), false);
});

test('recognizes Bilibili ad destinations', () => {
  assert.equal(filter.isAdHref('//cm.bilibili.com/'), true);
  assert.equal(filter.isAdHref('https://ad.bilibili.com/campaign'), true);
  assert.equal(filter.isAdHref('https://www.bilibili.com/video/BV1'), false);
});

test('badge matching is exact and does not treat video titles as badges', () => {
  assert.equal(filter.isLiveBadgeText(' 直播中 '), true);
  assert.equal(filter.isLiveBadgeText('我的第一次直播录像'), false);
  assert.equal(filter.isAdBadgeText('创作推广'), true);
  assert.equal(filter.isAdBadgeText('如何制作广告片'), false);
});

test('classifies structural signals independently', () => {
  assert.deepEqual(
    filter.classifySignals({ hrefs: ['//live.bilibili.com/88'] }),
    { live: true, ad: false }
  );
  assert.deepEqual(
    filter.classifySignals({ badgeTexts: ['广告'] }),
    { live: false, ad: true }
  );
  assert.deepEqual(
    filter.classifySignals({ classNames: 'feed-card bili-live-card' }),
    { live: true, ad: false }
  );
  assert.deepEqual(
    filter.classifySignals({ hrefs: ['/video/BV1'], badgeTexts: ['知识'] }),
    { live: false, ad: false }
  );
});

test('promotes nested homepage cards to their direct grid item', () => {
  const grid = {};
  const wrapper = { parentElement: grid };
  const card = {
    parentElement: wrapper,
    closest(selector) {
      return selector.includes('.recommended-container_floor-aside')
        ? grid
        : null;
    },
  };

  assert.equal(filter.findLayoutCardRoot(card), wrapper);

  const sidebarCard = {
    parentElement: {},
    closest: () => null,
  };
  assert.equal(filter.findLayoutCardRoot(sidebarCard), sidebarCard);
});
