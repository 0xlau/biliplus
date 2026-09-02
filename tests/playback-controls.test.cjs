const test = require('node:test');
const assert = require('node:assert/strict');

const {
  PlaybackRateKeeper,
  formatRate,
  getRateShortcutAction,
  isSequentialPlaybackContext,
  isWidescreenEntered,
  normalizeAutoplayMode,
  normalizeRate,
  shouldCancelAutoplay
} = require('../scripts/stepless-video-rate.js');

class FakeVideo extends EventTarget {
  constructor(rate = 1) {
    super();
    this._playbackRate = rate;
    this.defaultPlaybackRate = 1;
  }

  get playbackRate() {
    return this._playbackRate;
  }

  set playbackRate(value) {
    this._playbackRate = Number(value);
    this.dispatchEvent(new Event('ratechange'));
  }

  emit(type) {
    this.dispatchEvent(new Event(type));
  }
}

function createFakeScheduler() {
  const jobs = [];
  return {
    schedule(callback, delay) {
      const job = { callback, delay, cancelled: false };
      jobs.push(job);
      return job;
    },
    cancel(job) {
      job.cancelled = true;
    },
    flush() {
      jobs.sort((left, right) => left.delay - right.delay);
      while (jobs.length) {
        const job = jobs.shift();
        if (!job.cancelled) job.callback();
      }
    }
  };
}

test('normalizes precise rates without leaking invalid browser values', () => {
  assert.equal(normalizeRate('1.25'), 1.25);
  assert.equal(normalizeRate('100'), 5);
  assert.equal(normalizeRate('-1'), 0.1);
  assert.equal(normalizeRate('nope', 2.2), 2.2);
  assert.equal(formatRate(1), '1.0');
  assert.equal(formatRate(1.25), '1.25');
});

test('safe shortcuts work outside editors and ignore browser modifiers', () => {
  const plainTarget = { tagName: 'DIV', closest: () => null };
  const inputTarget = { tagName: 'INPUT', closest: () => inputTarget };

  assert.deepEqual(
    getRateShortcutAction({ code: 'Minus', key: '-', target: plainTarget }, plainTarget),
    { type: 'adjust', delta: -0.1 }
  );
  assert.deepEqual(
    getRateShortcutAction({ code: 'Equal', key: '=', target: plainTarget }, plainTarget),
    { type: 'adjust', delta: 0.1 }
  );
  assert.deepEqual(
    getRateShortcutAction({ code: 'Digit0', key: '0', target: plainTarget }, plainTarget),
    { type: 'reset', value: 1 }
  );
  assert.equal(getRateShortcutAction({ code: 'Minus', key: '-', target: inputTarget }, inputTarget), null);
  assert.equal(getRateShortcutAction({ code: 'Equal', key: '=', ctrlKey: true, target: plainTarget }, plainTarget), null);
});

test('remembered rate survives player replacement and initialization resets', () => {
  let now = 100;
  let remember = true;
  const changes = [];
  const scheduler = createFakeScheduler();
  const keeper = new PlaybackRateKeeper({
    initialRate: 2.35,
    getRemember: () => remember,
    onRateChange: (rate, metadata) => changes.push({ rate, metadata }),
    now: () => now,
    schedule: scheduler.schedule,
    cancelSchedule: scheduler.cancel
  });

  const firstVideo = new FakeVideo();
  keeper.bind(firstVideo);
  assert.equal(firstVideo.playbackRate, 2.35);

  // 模拟播放器在 loadstart 后把倍速重置为 1.0。
  firstVideo.emit('loadstart');
  firstVideo.playbackRate = 1;
  scheduler.flush();
  assert.equal(firstVideo.playbackRate, 2.35);

  const replacementVideo = new FakeVideo();
  keeper.bind(replacementVideo);
  assert.equal(replacementVideo.playbackRate, 2.35);
  replacementVideo.emit('playing');
  scheduler.flush();
  assert.equal(replacementVideo.playbackRate, 2.35);

  // 初始化窗口结束后，原生倍速菜单的选择会成为新的记忆值。
  now = 5000;
  replacementVideo.playbackRate = 1.5;
  assert.equal(keeper.getDesiredRate(), 1.5);
  assert.equal(changes.at(-1).metadata.source, 'native');
  assert.equal(changes.at(-1).metadata.persist, true);

  remember = false;
  keeper.setRemember(false);
});

test('disabled rate memory adopts each replacement video instead of forcing an old value', () => {
  const scheduler = createFakeScheduler();
  const keeper = new PlaybackRateKeeper({
    initialRate: 3,
    getRemember: () => false,
    schedule: scheduler.schedule,
    cancelSchedule: scheduler.cancel
  });

  const firstVideo = new FakeVideo(1.25);
  keeper.bind(firstVideo);
  assert.equal(keeper.getDesiredRate(), 1.25);

  const replacementVideo = new FakeVideo(1);
  keeper.bind(replacementVideo);
  assert.equal(replacementVideo.playbackRate, 1);
  assert.equal(keeper.getDesiredRate(), 1);
});

test('pausing the master switch preserves the saved rate across video replacement', () => {
  const scheduler = createFakeScheduler();
  const keeper = new PlaybackRateKeeper({
    initialRate: 2.4,
    paused: true,
    getRemember: () => true,
    schedule: scheduler.schedule,
    cancelSchedule: scheduler.cancel
  });

  const firstVideo = new FakeVideo(1);
  keeper.bind(firstVideo);
  assert.equal(firstVideo.playbackRate, 1);
  assert.equal(keeper.getDesiredRate(), 2.4);

  firstVideo.playbackRate = 1.5;
  assert.equal(keeper.getDesiredRate(), 2.4);

  const replacementVideo = new FakeVideo(1);
  keeper.bind(replacementVideo);
  assert.equal(keeper.getDesiredRate(), 2.4);
  assert.equal(replacementVideo.playbackRate, 1);

  keeper.setPaused(false);
  assert.equal(replacementVideo.playbackRate, 2.4);
});

test('playlist-only autoplay blocks recommendations but keeps true sequences', () => {
  assert.equal(normalizeAutoplayMode('unknown'), 'keep');
  assert.equal(shouldCancelAutoplay('keep', false), false);
  assert.equal(shouldCancelAutoplay('off', true), true);
  assert.equal(shouldCancelAutoplay('playlist', false), true);
  assert.equal(shouldCancelAutoplay('playlist', true), false);

  assert.equal(isSequentialPlaybackContext('/video/BV1abc', '', false), false);
  assert.equal(isSequentialPlaybackContext('/video/BV1abc', '?p=2', false), true);
  assert.equal(isSequentialPlaybackContext('/list/ml123', '', false), true);
  assert.equal(isSequentialPlaybackContext('/bangumi/play/ep123', '', false), true);
  assert.equal(isSequentialPlaybackContext('/video/BV1abc', '', true), true);
});

test('widescreen state accepts both button and player container signals', () => {
  const classList = (classes) => ({ contains: (name) => classes.includes(name) });
  const emptyDocument = {
    documentElement: { classList: classList([]) },
    body: { classList: classList([]) }
  };

  assert.equal(isWidescreenEntered({ classList: classList(['bpx-state-entered']) }, null, emptyDocument), true);
  assert.equal(isWidescreenEntered(null, { getAttribute: () => 'wide' }, emptyDocument), true);
  assert.equal(isWidescreenEntered(null, { getAttribute: () => 'normal' }, emptyDocument), false);
});
