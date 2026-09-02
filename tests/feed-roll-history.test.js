const test = require('node:test');
const assert = require('node:assert/strict');

const feed = require('../scripts/feed-roll-history-btn.js');

const homeLocation = {
  hostname: 'www.bilibili.com',
  pathname: '/',
};

const plainTarget = {
  nodeType: 1,
  isContentEditable: false,
  closest: () => null,
};

const makeEvent = overrides => ({
  key: 'r',
  target: plainTarget,
  defaultPrevented: false,
  repeat: false,
  isComposing: false,
  altKey: false,
  ctrlKey: false,
  metaKey: false,
  shiftKey: false,
  ...overrides,
});

test('history supports back, next and branch replacement', () => {
  const history = feed.createFeedHistory();
  history.saveBeforeRoll(['page-a']);
  history.saveBeforeRoll(['page-b']);

  assert.deepEqual(history.back(['page-c']), ['page-b']);
  assert.deepEqual(history.back(['page-b']), ['page-a']);
  assert.deepEqual(history.next(), ['page-b']);

  history.saveBeforeRoll(['page-b-edited']);
  assert.deepEqual(history.back(['page-d']), ['page-b-edited']);
  assert.equal(history.getState().canGoNext, true);
});

test('back waits when the next recommendation page has not loaded yet', () => {
  const history = feed.createFeedHistory();
  history.saveBeforeRoll(['page-a']);

  assert.equal(history.back(['page-a']), null);
  assert.deepEqual(history.getState(), {
    index: 1,
    length: 1,
    canGoBack: true,
    canGoNext: false,
  });
});

test('history keeps only the newest entries and preserves navigation indexes', () => {
  const history = feed.createFeedHistory(3);
  history.saveBeforeRoll(['page-a']);
  history.saveBeforeRoll(['page-b']);
  history.saveBeforeRoll(['page-c']);
  history.saveBeforeRoll(['page-d']);

  assert.deepEqual(history.back(['page-e']), ['page-d']);
  assert.deepEqual(history.back(['page-d']), ['page-c']);
  assert.equal(history.back(['page-c']), null);
  assert.deepEqual(history.next(), ['page-d']);
  assert.deepEqual(history.next(), ['page-e']);
  assert.deepEqual(history.getState(), {
    index: 2,
    length: 3,
    canGoBack: true,
    canGoNext: false,
  });
});

test('history reset drops detached page snapshots when leaving the homepage', () => {
  const history = feed.createFeedHistory();
  history.saveBeforeRoll(['page-a']);
  history.back(['page-b']);
  history.reset();

  assert.deepEqual(history.getState(), {
    index: 0,
    length: 0,
    canGoBack: false,
    canGoNext: false,
  });
});

test('restored snapshots discard stale home-filter classes and metadata', () => {
  const makeMarkedElement = () => {
    const classes = new Set([
      'feed-card',
      'biliplus-filtered-live-content',
      'biliplus-filtered-ad-content',
    ]);
    const attributes = new Set(['data-biliplus-filter-reason']);
    return {
      classes,
      attributes,
      classList: {
        remove: (...names) => names.forEach(name => classes.delete(name)),
      },
      removeAttribute: name => attributes.delete(name),
    };
  };

  const child = makeMarkedElement();
  const root = makeMarkedElement();
  root.querySelectorAll = () => [child];

  feed.clearTransientFilterState(root);

  for (const element of [root, child]) {
    assert.equal(element.classes.has('feed-card'), true);
    assert.equal(element.classes.has('biliplus-filtered-live-content'), false);
    assert.equal(element.classes.has('biliplus-filtered-ad-content'), false);
    assert.equal(element.attributes.has('data-biliplus-filter-reason'), false);
  }
});

test('plain R is accepted only on the homepage', () => {
  assert.equal(
    feed.shouldHandleRollShortcut(
      makeEvent(),
      homeLocation,
      plainTarget,
      true
    ),
    true
  );
  assert.equal(
    feed.shouldHandleRollShortcut(
      makeEvent(),
      { hostname: 'www.bilibili.com', pathname: '/video/BV1' },
      plainTarget,
      true
    ),
    false
  );
});

test('R never hijacks editing, composition, repeat or modifier shortcuts', () => {
  const editableTarget = {
    nodeType: 1,
    isContentEditable: false,
    closest: () => ({ tagName: 'INPUT' }),
  };

  for (const event of [
    makeEvent({ target: editableTarget }),
    makeEvent({ ctrlKey: true }),
    makeEvent({ metaKey: true }),
    makeEvent({ altKey: true }),
    makeEvent({ shiftKey: true }),
    makeEvent({ repeat: true }),
    makeEvent({ isComposing: true }),
    makeEvent({ defaultPrevented: true }),
  ]) {
    assert.equal(
      feed.shouldHandleRollShortcut(event, homeLocation, plainTarget, true),
      false
    );
  }

  assert.equal(
    feed.shouldHandleRollShortcut(
      makeEvent(),
      homeLocation,
      editableTarget,
      true
    ),
    false
  );
});
