const test = require('node:test');
const assert = require('node:assert/strict');

const sorter = require('../scripts/home-feed-time-sort.js');

const NOW = new Date(2026, 8, 12, 20, 0, 0).getTime(); // 2026-09-12 20:00

test('parsePublishTime handles relative labels', () => {
  assert.equal(sorter.parsePublishTime('刚刚', NOW), NOW);
  assert.equal(sorter.parsePublishTime('30秒前', NOW), NOW - 30 * 1000);
  assert.equal(sorter.parsePublishTime('5分钟前', NOW), NOW - 5 * 60 * 1000);
  assert.equal(sorter.parsePublishTime('3小时前', NOW), NOW - 3 * 60 * 60 * 1000);
  assert.equal(sorter.parsePublishTime('2天前', NOW), NOW - 2 * 24 * 60 * 60 * 1000);
  assert.equal(
    sorter.parsePublishTime('1周前', NOW),
    NOW - 7 * 24 * 60 * 60 * 1000
  );
  assert.equal(
    sorter.parsePublishTime('2个月前', NOW),
    NOW - 60 * 24 * 60 * 60 * 1000
  );
  assert.equal(
    sorter.parsePublishTime('1年前', NOW),
    NOW - 365 * 24 * 60 * 60 * 1000
  );
});

test('parsePublishTime strips Bilibili separator prefixes', () => {
  // B 站日期节点文本是"· 昨天"这种形式。
  assert.equal(sorter.parsePublishTime('· 3小时前', NOW), NOW - 3 * 60 * 60 * 1000);
  assert.equal(sorter.parsePublishTime('· 昨天', NOW), new Date(2026, 8, 11).getTime());
  assert.equal(sorter.parsePublishTime('· 09-10', NOW), new Date(2026, 8, 10).getTime());
  assert.equal(
    sorter.parsePublishTime('· 2025-08-30', NOW),
    new Date(2025, 7, 30).getTime()
  );
});

test('parsePublishTime handles 昨天/前天', () => {
  const startOfToday = new Date(2026, 8, 12).getTime();
  const day = 24 * 60 * 60 * 1000;
  assert.equal(sorter.parsePublishTime('昨天', NOW), startOfToday - day);
  assert.equal(sorter.parsePublishTime('前天', NOW), startOfToday - 2 * day);
});

test('parsePublishTime handles dates with and without year', () => {
  assert.equal(
    sorter.parsePublishTime('2026-09-10', NOW),
    new Date(2026, 8, 10).getTime()
  );
  assert.equal(
    sorter.parsePublishTime('09-10', NOW),
    new Date(2026, 8, 10).getTime()
  );
  assert.equal(
    sorter.parsePublishTime('9月10日', NOW),
    new Date(2026, 8, 10).getTime()
  );
  // 无年份的未来日期回退一年（跨年旧视频）。
  assert.equal(
    sorter.parsePublishTime('12-30', NOW),
    new Date(2025, 11, 30).getTime()
  );
  // 完整年份的未来日期不做回退。
  assert.equal(
    sorter.parsePublishTime('2026-12-30', NOW),
    new Date(2026, 11, 30).getTime()
  );
});

test('parsePublishTime returns null for unknown text', () => {
  assert.equal(sorter.parsePublishTime('', NOW), null);
  assert.equal(sorter.parsePublishTime('哆啦A梦', NOW), null);
  assert.equal(sorter.parsePublishTime('12:30', NOW), null);
  assert.equal(sorter.parsePublishTime('13-40', NOW), null);
});

test('compareByTimeDesc sorts newest first and puts unknown last', () => {
  const entries = [
    { time: NOW - 3 * 60 * 60 * 1000, order: 0 }, // 3小时前
    { time: null, order: 1 },
    { time: NOW - 5 * 60 * 1000, order: 2 }, // 5分钟前（最新）
    { time: NOW - 2 * 24 * 60 * 60 * 1000, order: 3 }, // 2天前
    { time: null, order: 4 },
  ];
  const sorted = [...entries].sort(sorter.compareByTimeDesc);
  assert.deepEqual(
    sorted.map(entry => entry.order),
    [2, 0, 3, 1, 4]
  );
});

test('compareByTimeDesc keeps original order for identical times and unknowns', () => {
  const same = NOW - 60 * 1000;
  const entries = [
    { time: null, order: 0 },
    { time: same, order: 1 },
    { time: same, order: 2 },
    { time: null, order: 3 },
  ];
  const sorted = [...entries].sort(sorter.compareByTimeDesc);
  assert.deepEqual(
    sorted.map(entry => entry.order),
    [1, 2, 0, 3]
  );
});

const createCard = timeText => ({
  nodeType: 1,
  style: {},
  matches: selector => selector === sorter.CARD_SELECTOR,
  querySelectorAll: selector =>
    selector === '.bili-video-card__info--date'
      ? [{ textContent: timeText }]
      : [],
  textContent: timeText,
});

test('applySortedOrder assigns CSS order without moving nodes', () => {
  const oldCard = createCard('· 3天前');
  const newCard = createCard('· 1小时前');
  const midCard = createCard('· 昨天');
  const unknownCard = createCard('');
  const anchor = { nodeType: 1, style: {}, matches: () => false };
  const grid = { children: [oldCard, unknownCard, newCard, midCard, anchor] };

  const changed = sorter.applySortedOrder(grid, NOW);
  assert.equal(changed, true);
  // 卡片节点仍在 children 的原位置（未被移动）。
  assert.deepEqual(grid.children, [oldCard, unknownCard, newCard, midCard, anchor]);
  // 已知时间按新→旧得到 0..n-1。
  assert.equal(newCard.style.order, '0');
  assert.equal(midCard.style.order, '1');
  assert.equal(oldCard.style.order, '2');
  // 未知时间卡片与锚点排在后面，保持原相对顺序。
  assert.equal(unknownCard.style.order, String(100000 + 1));
  assert.equal(anchor.style.order, String(100000 + 4));
});

test('applySortedOrder is a no-op when orders are already correct', () => {
  const newCard = createCard('· 1小时前');
  const oldCard = createCard('· 3天前');
  const grid = { children: [newCard, oldCard] };
  sorter.applySortedOrder(grid, NOW);
  const firstOrder = newCard.style.order;
  const secondOrder = oldCard.style.order;
  assert.equal(sorter.applySortedOrder(grid, NOW), false);
  assert.equal(newCard.style.order, firstOrder);
  assert.equal(oldCard.style.order, secondOrder);
});

test('applySortedOrder returns false for grids without enough cards', () => {
  assert.equal(sorter.applySortedOrder(null, NOW), false);
  assert.equal(sorter.applySortedOrder({ children: [] }, NOW), false);
});

test('clearSortedOrder removes inline order values', () => {
  const card = createCard('· 1小时前');
  card.style.order = '0';
  const grid = { children: [card] };
  sorter.clearSortedOrder(grid);
  assert.equal('order' in card.style, false);
});

test('isHomePageLocation matches only the homepage route', () => {
  assert.equal(
    sorter.isHomePageLocation({ hostname: 'www.bilibili.com', pathname: '/' }),
    true
  );
  assert.equal(
    sorter.isHomePageLocation({
      hostname: 'www.bilibili.com',
      pathname: '/video/BV1xx',
    }),
    false
  );
  assert.equal(
    sorter.isHomePageLocation({ hostname: 'search.bilibili.com', pathname: '/' }),
    false
  );
});
