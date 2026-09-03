/**
 * BiliPlus 播放控制
 *
 * 这个 content script 集中处理无级倍速、倍速记忆、自动宽屏和自动连播。
 * Bilibili 是 SPA，播放器和 video 元素都可能被替换，所以不能在首次找到
 * 控件后停止观察。
 */

(function () {
  'use strict';

  const RATE_MIN = 0.1;
  const RATE_MAX = 5;
  const RATE_STEP = 0.1;
  const RATE_TRANSITION_GUARD_MS = 3200;
  const RATE_REAPPLY_DELAYS = [0, 80, 260, 800, 1800, 3000];
  const AUTOPLAY_MODES = new Set(['keep', 'off', 'playlist']);
  const RATE_CONTROL_SELECTOR = '[data-biliplus-control="stepless-video-rate"]';
  const NATIVE_RATE_BUTTON_SELECTOR =
    `.bpx-player-ctrl-btn.bpx-player-ctrl-playbackrate:not(${RATE_CONTROL_SELECTOR})`;

  const STORAGE_KEYS = {
    master: 'biliplus-enable',
    steplessRate: 'stepless-video-rate',
    rememberRate: 'video-rate-remember',
    autoWidescreen: 'auto-widescreen',
    autoplayMode: 'autoplay-mode',
    rateValue: 'playback-rate-value',
    legacyRememberRate: 'stepless-video-rate-persist',
    legacyRateValue: 'stepless-video-rate-value'
  };

  const STORAGE_KEY_LIST = Object.values(STORAGE_KEYS);

  const SEQUENTIAL_PAGE_SELECTORS = [
    '.video-pod .video-pod__list',
    '.video-pod__body .video-pod__item',
    '.multi-page-v1 .cur-list',
    '.multi-page .list-box',
    '.video-sections-content-list',
    '.base-video-sections-v1',
    '.video-sections-v1',
    '#playlist-video-action-list',
    '.playlist-container',
    '.player-auxiliary-playlist-list',
    '#eplist_module'
  ];

  const CANCEL_AUTOPLAY_SELECTOR = '.bpx-player-ending-related-item-cancel';

  function clamp(value, minimum, maximum) {
    return Math.min(maximum, Math.max(minimum, value));
  }

  function normalizeRate(value, fallback = 1) {
    const parsed = Number.parseFloat(value);
    const safeFallback = Number.isFinite(Number.parseFloat(fallback))
      ? Number.parseFloat(fallback)
      : 1;

    if (!Number.isFinite(parsed)) return clamp(safeFallback, RATE_MIN, RATE_MAX);
    return Math.round(clamp(parsed, RATE_MIN, RATE_MAX) * 100) / 100;
  }

  function formatRate(value) {
    const rate = normalizeRate(value);
    if (Number.isInteger(rate)) return rate.toFixed(1);
    return rate.toFixed(2).replace(/0$/, '');
  }

  function normalizeAutoplayMode(value) {
    return AUTOPLAY_MODES.has(value) ? value : 'keep';
  }

  function isEditableTarget(target) {
    if (!target || typeof target !== 'object') return false;
    if (target.isContentEditable) return true;

    const tagName = String(target.tagName || '').toLowerCase();
    if (['input', 'textarea', 'select', 'button'].includes(tagName)) return true;

    if (typeof target.closest !== 'function') return false;
    return Boolean(target.closest('input, textarea, select, button, [contenteditable="true"], [role="textbox"]'));
  }

  function getRateShortcutAction(event, activeElement) {
    if (!event || event.defaultPrevented || event.isComposing) return null;
    if (event.ctrlKey || event.metaKey || event.altKey) return null;
    if (isEditableTarget(event.target) || isEditableTarget(activeElement)) return null;

    const code = event.code || '';
    const key = event.key || '';

    if (code === 'NumpadSubtract' || code === 'Minus' || key === '-') {
      return { type: 'adjust', delta: -RATE_STEP };
    }

    if (code === 'NumpadAdd' || code === 'Equal' || key === '=' || key === '+') {
      return { type: 'adjust', delta: RATE_STEP };
    }

    if ((!event.shiftKey && code === 'Digit0') || code === 'Numpad0' || key === '0') {
      return { type: 'reset', value: 1 };
    }

    return null;
  }

  function hasSequentialPath(pathname) {
    return /^\/list\//.test(pathname || '') || /^\/bangumi\/play\//.test(pathname || '');
  }

  function isSequentialPlaybackContext(pathname, search, hasSequentialDom) {
    if (hasSequentialPath(pathname)) return true;
    if (hasSequentialDom) return true;

    const params = new URLSearchParams(search || '');
    const page = Number.parseInt(params.get('p') || '', 10);
    return Number.isInteger(page) && page > 1;
  }

  function shouldCancelAutoplay(mode, sequentialContext) {
    const normalizedMode = normalizeAutoplayMode(mode);
    if (normalizedMode === 'off') return true;
    if (normalizedMode === 'playlist') return !sequentialContext;
    return false;
  }

  function isWidescreenEntered(wideButton, playerContainer, documentObject) {
    if (wideButton && wideButton.classList && wideButton.classList.contains('bpx-state-entered')) {
      return true;
    }

    const screen = playerContainer && typeof playerContainer.getAttribute === 'function'
      ? playerContainer.getAttribute('data-screen')
      : null;
    if (screen === 'wide') return true;

    const root = documentObject && documentObject.documentElement;
    const body = documentObject && documentObject.body;
    return Boolean(
      (root && root.classList && root.classList.contains('player-mode-widescreen')) ||
      (body && body.classList && body.classList.contains('player-mode-widescreen'))
    );
  }

  function isExpandedBeyondWidescreen(playerContainer, documentObject) {
    if (documentObject && documentObject.fullscreenElement) return true;

    const screen = playerContainer && typeof playerContainer.getAttribute === 'function'
      ? playerContainer.getAttribute('data-screen')
      : null;
    if (screen === 'full' || screen === 'web') return true;

    if (!documentObject || typeof documentObject.querySelector !== 'function') return false;
    return Boolean(documentObject.querySelector(
      '.bpx-player-ctrl-full.bpx-state-entered, .bpx-player-ctrl-web.bpx-state-entered'
    ));
  }

  /**
   * 只在视频加载/切换的短窗口内强制恢复保存的倍速。窗口以外的
   * ratechange 被视为用户通过 Bilibili 原生菜单作出的选择。
   */
  class PlaybackRateKeeper {
    constructor(options = {}) {
      this.getRemember = options.getRemember || (() => false);
      this.onRateChange = options.onRateChange || (() => {});
      this.schedule = options.schedule || ((callback, delay) => setTimeout(callback, delay));
      this.cancelSchedule = options.cancelSchedule || ((timer) => clearTimeout(timer));
      this.now = options.now || (() => Date.now());
      this.transitionGuardMs = options.transitionGuardMs || RATE_TRANSITION_GUARD_MS;
      this.reapplyDelays = options.reapplyDelays || RATE_REAPPLY_DELAYS;
      this.desiredRate = normalizeRate(options.initialRate);
      this.paused = Boolean(options.paused);
      this.video = null;
      this.guardUntil = 0;
      this.ignoreRateChangeUntil = 0;
      this.generation = 0;
      this.timers = [];
      this.listeners = [];
    }

    getDesiredRate() {
      return this.desiredRate;
    }

    setDesiredRate(value, options = {}) {
      this.desiredRate = normalizeRate(value, this.desiredRate);
      const persist = options.persist === undefined ? this.getRemember() : Boolean(options.persist);
      this.onRateChange(this.desiredRate, {
        persist,
        source: options.source || 'user'
      });

      if (options.apply !== false) this.applyRate();
      return this.desiredRate;
    }

    bind(video) {
      if (!video || typeof video.addEventListener !== 'function') return false;
      if (video === this.video) return false;

      this.unbind();
      this.video = video;

      this.listen(video, 'loadstart', () => this.beginTransition('loadstart'));
      this.listen(video, 'emptied', () => this.beginTransition('emptied'));
      this.listen(video, 'loadedmetadata', () => this.handleMediaReady('loadedmetadata'));
      this.listen(video, 'canplay', () => this.handleMediaReady('canplay'));
      this.listen(video, 'playing', () => this.handleMediaReady('playing'));
      this.listen(video, 'ratechange', () => this.handleNativeRateChange());

      if (this.paused) {
        return true;
      }

      if (this.getRemember()) {
        this.beginTransition('video-replaced');
      } else {
        this.adoptCurrentRate('video-replaced');
      }

      return true;
    }

    listen(target, type, listener) {
      target.addEventListener(type, listener);
      this.listeners.push([target, type, listener]);
    }

    unbind() {
      this.generation += 1;
      this.clearTimers();
      for (const [target, type, listener] of this.listeners) {
        target.removeEventListener(type, listener);
      }
      this.listeners = [];
      this.video = null;
    }

    destroy() {
      this.unbind();
    }

    setRemember(enabled, options = {}) {
      if (this.paused) return;

      if (!enabled) {
        this.guardUntil = 0;
        this.clearTimers();
        this.adoptCurrentRate('remember-disabled');
        return;
      }

      if (options.preferCurrent && this.video) {
        this.desiredRate = normalizeRate(this.video.playbackRate, this.desiredRate);
        this.onRateChange(this.desiredRate, {
          persist: true,
          source: 'remember-enabled'
        });
      }
      this.beginTransition('remember-enabled');
    }

    setPaused(paused) {
      this.paused = Boolean(paused);
      if (this.paused) {
        this.guardUntil = 0;
        this.clearTimers();
        return;
      }

      if (this.getRemember()) {
        this.beginTransition('resumed');
      } else {
        this.adoptCurrentRate('resumed');
      }
    }

    handleNavigation() {
      if (this.getRemember()) this.beginTransition('navigation');
    }

    handleMediaReady(source) {
      if (this.paused) return;
      if (this.getRemember()) {
        this.applyRate();
        this.scheduleApplyBurst(source);
      } else {
        this.adoptCurrentRate(source);
      }
    }

    beginTransition(source) {
      if (this.paused || !this.video || !this.getRemember()) return;
      this.guardUntil = this.now() + this.transitionGuardMs;
      this.applyRate();
      this.scheduleApplyBurst(source);
    }

    scheduleApplyBurst() {
      const generation = ++this.generation;
      this.clearTimers();

      for (const delay of this.reapplyDelays) {
        const timer = this.schedule(() => {
          if (generation !== this.generation || !this.video || !this.getRemember()) return;
          this.applyRate();
        }, delay);
        this.timers.push(timer);
      }
    }

    clearTimers() {
      for (const timer of this.timers) this.cancelSchedule(timer);
      this.timers = [];
    }

    applyRate() {
      if (!this.video) return;
      const rate = normalizeRate(this.desiredRate);
      this.ignoreRateChangeUntil = this.now() + 180;

      if (Math.abs(Number(this.video.playbackRate) - rate) > 0.001) {
        this.video.playbackRate = rate;
      }
      if ('defaultPlaybackRate' in this.video && Math.abs(Number(this.video.defaultPlaybackRate) - rate) > 0.001) {
        this.video.defaultPlaybackRate = rate;
      }
    }

    handleNativeRateChange() {
      if (this.paused || !this.video) return;
      const actualRate = normalizeRate(this.video.playbackRate, this.desiredRate);
      const mismatch = Math.abs(actualRate - this.desiredRate) > 0.001;

      if (
        mismatch &&
        this.getRemember() &&
        (this.now() <= this.guardUntil || this.now() <= this.ignoreRateChangeUntil)
      ) {
        this.schedule(() => this.applyRate(), 0);
        return;
      }

      this.desiredRate = actualRate;
      this.onRateChange(actualRate, {
        persist: this.getRemember(),
        source: 'native'
      });
    }

    adoptCurrentRate(source) {
      if (!this.video) return;
      const actualRate = normalizeRate(this.video.playbackRate, this.desiredRate);
      this.desiredRate = actualRate;
      this.onRateChange(actualRate, { persist: false, source });
    }
  }

  const testApi = {
    RATE_MIN,
    RATE_MAX,
    RATE_STEP,
    PlaybackRateKeeper,
    formatRate,
    getRateShortcutAction,
    hasSequentialPath,
    isEditableTarget,
    isSequentialPlaybackContext,
    isWidescreenEntered,
    normalizeAutoplayMode,
    normalizeRate,
    shouldCancelAutoplay
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = testApi;
  }

  if (
    typeof window === 'undefined' ||
    typeof document === 'undefined' ||
    typeof chrome === 'undefined' ||
    !chrome.storage ||
    !chrome.storage.sync
  ) {
    return;
  }

  const config = {
    master: false,
    steplessRate: false,
    rememberRate: false,
    autoWidescreen: false,
    autoplayMode: 'keep'
  };

  const state = {
    initialized: false,
    scanQueued: false,
    lastRouteKey: '',
    rateUi: null,
    hideRatePanelTimer: null,
    autoplayTimers: [],
    wideButtonIds: new WeakMap(),
    nextWideButtonId: 1,
    boundWideButtons: new WeakSet(),
    widescreen: {
      key: '',
      attempts: 0,
      lastAttemptAt: 0,
      completed: false,
      userOverrideKey: ''
    },
    boundAutoplayVideo: null,
    autoplayListeners: []
  };

  let rateKeeper = null;
  let documentObserver = null;
  let fallbackScanTimer = null;

  function storageSet(values) {
    try {
      chrome.storage.sync.set(values);
    } catch (error) {
      console.warn('[BiliPlus] 保存播放设置失败', error);
    }
  }

  function getInitialRate(storage) {
    const value = storage[STORAGE_KEYS.rateValue] ?? storage[STORAGE_KEYS.legacyRateValue] ?? 1;
    return normalizeRate(value);
  }

  function readConfig(storage) {
    config.master = Boolean(storage[STORAGE_KEYS.master]);
    config.steplessRate = Boolean(storage[STORAGE_KEYS.steplessRate]);
    config.rememberRate = storage[STORAGE_KEYS.rememberRate] === undefined
      ? Boolean(storage[STORAGE_KEYS.legacyRememberRate])
      : Boolean(storage[STORAGE_KEYS.rememberRate]);
    config.autoWidescreen = Boolean(storage[STORAGE_KEYS.autoWidescreen]);
    config.autoplayMode = normalizeAutoplayMode(storage[STORAGE_KEYS.autoplayMode]);
  }

  function featureEnabled(name) {
    return config.master && Boolean(config[name]);
  }

  function playbackRuntimeNeeded() {
    return Boolean(
      config.master &&
      (
        config.steplessRate ||
        config.rememberRate ||
        config.autoWidescreen ||
        config.autoplayMode !== 'keep'
      )
    );
  }

  function routeKey() {
    return `${window.location.pathname}${window.location.search}`;
  }

  function findPlayerVideo() {
    const selectors = [
      '#bilibili-player .bpx-player-video-wrap video',
      '#bilibili-player video',
      '.bpx-player-container video',
      'video'
    ];

    for (const selector of selectors) {
      const video = document.querySelector(selector);
      if (video) return video;
    }
    return null;
  }

  function updateRateUi(rate) {
    if (!state.rateUi || !state.rateUi.root.isConnected) return;

    const formatted = formatRate(rate);
    const buttonText = `${formatted}x`;
    if (state.rateUi.value.textContent !== buttonText) {
      state.rateUi.value.textContent = buttonText;
    }
    state.rateUi.trigger.setAttribute('aria-label', `当前 ${formatted} 倍速，打开无级倍速面板`);
    state.rateUi.range.value = String(rate);

    if (document.activeElement !== state.rateUi.input) {
      state.rateUi.input.value = formatted;
    }
  }

  function persistRate(rate) {
    storageSet({ [STORAGE_KEYS.rateValue]: normalizeRate(rate) });
  }

  function setRateFromUser(value, source) {
    if (!rateKeeper) return;
    rateKeeper.setDesiredRate(value, {
      persist: featureEnabled('rememberRate'),
      source
    });
  }

  function showRatePanel() {
    if (!state.rateUi) return;
    clearTimeout(state.hideRatePanelTimer);
    state.hideRatePanelTimer = null;
    state.rateUi.root.classList.add('is-open');
    state.rateUi.panel.setAttribute('aria-hidden', 'false');
    state.rateUi.trigger.setAttribute('aria-expanded', 'true');
  }

  function hideRatePanel(immediate = false) {
    if (!state.rateUi) return;

    const hide = () => {
      if (!state.rateUi) return;
      if (state.rateUi.root.contains(document.activeElement)) return;
      state.rateUi.root.classList.remove('is-open');
      state.rateUi.panel.setAttribute('aria-hidden', 'true');
      state.rateUi.trigger.setAttribute('aria-expanded', 'false');
    };

    clearTimeout(state.hideRatePanelTimer);
    if (immediate) {
      hide();
    } else {
      state.hideRatePanelTimer = setTimeout(hide, 260);
    }
  }

  function removeRateUi() {
    clearTimeout(state.hideRatePanelTimer);
    state.hideRatePanelTimer = null;
    document.querySelectorAll(RATE_CONTROL_SELECTOR).forEach(root => root.remove());
    state.rateUi = null;
    document.body && document.body.classList.remove('biliplus-stepless-video-rate');
  }

  function removeDuplicateRateUis(keepRoot = null) {
    document.querySelectorAll(RATE_CONTROL_SELECTOR).forEach(root => {
      if (root !== keepRoot) root.remove();
    });
  }

  function createRateUi(controlBar, nativeRateButton) {
    const root = document.createElement('div');
    root.className =
      'bpx-player-ctrl-btn bpx-player-ctrl-playbackrate stepless-video-rate-btn';
    root.dataset.biliplusControl = 'stepless-video-rate';
    root.innerHTML = `
      <button
        type="button"
        class="bpx-player-ctrl-playbackrate-result stepless-video-rate-btn-result"
        aria-haspopup="dialog"
        aria-expanded="false"
        aria-label="无级倍速"
      >
        <span class="stepless-video-rate-btn-value">1.0x</span>
      </button>
      <div class="bpx-player-ctrl-playbackrate-menu stepless-video-rate-box" role="dialog" aria-label="无级倍速" aria-hidden="true">
        <div class="stepless-video-rate-editor">
          <label class="stepless-video-rate-input-label">
            <span class="stepless-video-rate-sr-only">精确倍速</span>
            <input
              type="number"
              class="stepless-video-rate-input"
              min="${RATE_MIN}"
              max="${RATE_MAX}"
              step="0.05"
              inputmode="decimal"
            >
            <span aria-hidden="true">x</span>
          </label>
          <button type="button" class="stepless-video-rate-reset-btn">重置</button>
        </div>
        <input
          type="range"
          class="stepless-video-rate-range"
          min="${RATE_MIN}"
          max="${RATE_MAX}"
          step="0.05"
          aria-label="拖动调节倍速"
        >
        <div class="stepless-video-rate-help">滚轮或 − / + 微调，0 重置</div>
      </div>
    `;

    controlBar.insertBefore(root, nativeRateButton);

    const ui = {
      root,
      trigger: root.querySelector('.stepless-video-rate-btn-result'),
      value: root.querySelector('.stepless-video-rate-btn-value'),
      panel: root.querySelector('.stepless-video-rate-box'),
      input: root.querySelector('.stepless-video-rate-input'),
      range: root.querySelector('.stepless-video-rate-range'),
      reset: root.querySelector('.stepless-video-rate-reset-btn')
    };

    state.rateUi = ui;
    updateRateUi(rateKeeper.getDesiredRate());

    root.addEventListener('mouseenter', showRatePanel);
    root.addEventListener('mouseleave', () => hideRatePanel(false));
    root.addEventListener('focusin', showRatePanel);
    root.addEventListener('focusout', () => hideRatePanel(false));

    ui.trigger.addEventListener('click', showRatePanel);
    ui.trigger.addEventListener('dblclick', event => {
      event.preventDefault();
      setRateFromUser(1, 'double-click');
    });

    ui.range.addEventListener('input', () => {
      setRateFromUser(ui.range.value, 'slider');
    });

    const commitInput = () => {
      const nextRate = normalizeRate(ui.input.value, rateKeeper.getDesiredRate());
      setRateFromUser(nextRate, 'input');
      ui.input.value = formatRate(nextRate);
    };

    ui.input.addEventListener('change', commitInput);
    ui.input.addEventListener('keydown', (event) => {
      event.stopPropagation();
      if (event.key === 'Enter') {
        event.preventDefault();
        commitInput();
        ui.input.blur();
        hideRatePanel(true);
      } else if (event.key === 'Escape') {
        event.preventDefault();
        ui.input.value = formatRate(rateKeeper.getDesiredRate());
        ui.input.blur();
        hideRatePanel(true);
      }
    });

    ui.reset.addEventListener('click', () => setRateFromUser(1, 'reset-button'));

    root.addEventListener('wheel', (event) => {
      if (event.ctrlKey || event.metaKey || event.deltaY === 0) return;
      event.preventDefault();
      const direction = event.deltaY < 0 ? 1 : -1;
      setRateFromUser(rateKeeper.getDesiredRate() + direction * RATE_STEP, 'wheel');
      showRatePanel();
    }, { passive: false });

    return ui;
  }

  function ensureRateUi() {
    if (!featureEnabled('steplessRate')) {
      removeRateUi();
      return;
    }

    document.body && document.body.classList.add('biliplus-stepless-video-rate');

    const nativeRateButton = document.querySelector(NATIVE_RATE_BUTTON_SELECTOR);
    const controlBar = nativeRateButton && nativeRateButton.parentElement;
    if (!nativeRateButton || !controlBar) return;

    if (
      state.rateUi &&
      state.rateUi.root.isConnected &&
      state.rateUi.root.parentElement === controlBar
    ) {
      removeDuplicateRateUis(state.rateUi.root);
      updateRateUi(rateKeeper.getDesiredRate());
      return;
    }

    clearTimeout(state.hideRatePanelTimer);
    state.hideRatePanelTimer = null;
    removeDuplicateRateUis();
    state.rateUi = null;
    createRateUi(controlBar, nativeRateButton);
  }

  function handleRateShortcut(event) {
    if (!featureEnabled('steplessRate') || !findPlayerVideo()) return;
    const action = getRateShortcutAction(event, document.activeElement);
    if (!action) return;

    event.preventDefault();
    event.stopImmediatePropagation();

    if (action.type === 'reset') {
      setRateFromUser(action.value, 'keyboard');
    } else {
      setRateFromUser(rateKeeper.getDesiredRate() + action.delta, 'keyboard');
    }
  }

  function getWideButtonId(button) {
    if (!state.wideButtonIds.has(button)) {
      state.wideButtonIds.set(button, state.nextWideButtonId++);
    }
    return state.wideButtonIds.get(button);
  }

  function resetWidescreenState(key) {
    state.widescreen.key = key;
    state.widescreen.attempts = 0;
    state.widescreen.lastAttemptAt = 0;
    state.widescreen.completed = false;
  }

  function ensureAutoWidescreen() {
    if (!featureEnabled('autoWidescreen')) return;

    const wideButton = document.querySelector('.bpx-player-ctrl-wide');
    if (!wideButton) return;

    const playerContainer = wideButton.closest('.bpx-player-container') || document.querySelector('.bpx-player-container');
    const key = `${routeKey()}::${getWideButtonId(wideButton)}`;
    if (state.widescreen.key !== key) resetWidescreenState(key);

    if (!state.boundWideButtons.has(wideButton)) {
      state.boundWideButtons.add(wideButton);
      wideButton.addEventListener('click', (event) => {
        if (event.isTrusted) state.widescreen.userOverrideKey = state.widescreen.key;
      });
    }

    if (
      state.widescreen.completed ||
      state.widescreen.userOverrideKey === key ||
      isExpandedBeyondWidescreen(playerContainer, document)
    ) {
      return;
    }

    if (isWidescreenEntered(wideButton, playerContainer, document)) {
      state.widescreen.completed = true;
      return;
    }

    const now = Date.now();
    if (state.widescreen.attempts >= 3 || now - state.widescreen.lastAttemptAt < 900) return;

    state.widescreen.attempts += 1;
    state.widescreen.lastAttemptAt = now;
    wideButton.click();

    setTimeout(() => {
      if (isWidescreenEntered(wideButton, playerContainer, document)) {
        state.widescreen.completed = true;
      } else {
        queueScan();
      }
    }, 700);
  }

  function hasSequentialDom() {
    return SEQUENTIAL_PAGE_SELECTORS.some((selector) => document.querySelector(selector));
  }

  function currentSequentialContext() {
    return isSequentialPlaybackContext(
      window.location.pathname,
      window.location.search,
      hasSequentialDom()
    );
  }

  function autoplayShouldBeCancelled() {
    if (!config.master) return false;
    return shouldCancelAutoplay(config.autoplayMode, currentSequentialContext());
  }

  function cancelAutoplayTimers() {
    for (const timer of state.autoplayTimers) clearTimeout(timer);
    state.autoplayTimers = [];
  }

  function isElementVisible(element) {
    if (!element || !element.isConnected) return false;
    const style = window.getComputedStyle(element);
    if (style.display === 'none' || style.visibility === 'hidden') return false;
    return element.getClientRects().length > 0;
  }

  function tryCancelAutoplay() {
    if (!autoplayShouldBeCancelled()) return false;
    const cancelButton = [...document.querySelectorAll(CANCEL_AUTOPLAY_SELECTOR)]
      .find(isElementVisible);
    if (!cancelButton) return false;

    cancelButton.click();
    document.body && document.body.classList.add('biliplus-autoplay-ending-blocked');
    return true;
  }

  function scheduleAutoplayCancellation() {
    cancelAutoplayTimers();
    if (!autoplayShouldBeCancelled()) return;

    for (const delay of [0, 60, 180, 500, 1000, 1800, 3000]) {
      state.autoplayTimers.push(setTimeout(tryCancelAutoplay, delay));
    }
  }

  function unbindAutoplayVideo() {
    for (const [target, type, listener] of state.autoplayListeners) {
      target.removeEventListener(type, listener);
    }
    state.autoplayListeners = [];
    state.boundAutoplayVideo = null;
  }

  function bindAutoplayVideo(video) {
    if (video === state.boundAutoplayVideo) return;
    unbindAutoplayVideo();
    if (!video) return;

    state.boundAutoplayVideo = video;
    const onEnded = () => scheduleAutoplayCancellation();
    const onPlaybackResumed = () => {
      cancelAutoplayTimers();
      document.body && document.body.classList.remove('biliplus-autoplay-ending-blocked');
    };

    video.addEventListener('ended', onEnded);
    video.addEventListener('playing', onPlaybackResumed);
    video.addEventListener('loadstart', onPlaybackResumed);
    state.autoplayListeners.push(
      [video, 'ended', onEnded],
      [video, 'playing', onPlaybackResumed],
      [video, 'loadstart', onPlaybackResumed]
    );
  }

  function updateAutoplayMode() {
    const blocking = autoplayShouldBeCancelled();
    document.body && document.body.classList.toggle('biliplus-autoplay-blocking', blocking);

    if (!blocking) {
      cancelAutoplayTimers();
      document.body && document.body.classList.remove('biliplus-autoplay-ending-blocked');
      return;
    }

    tryCancelAutoplay();
  }

  function handleRouteChange(nextRouteKey) {
    state.lastRouteKey = nextRouteKey;
    document.body && document.body.classList.remove('biliplus-autoplay-ending-blocked');
    cancelAutoplayTimers();
    rateKeeper.handleNavigation();

    // 相同播放器跨分 P 时要重新执行一次自动宽屏判断；若宽屏仍保持，
    // isWidescreenEntered 会直接完成，不会反向切换。
    state.widescreen.key = '';
  }

  function scan() {
    state.scanQueued = false;
    if (!state.initialized || !playbackRuntimeNeeded()) return;

    const nextRouteKey = routeKey();
    if (nextRouteKey !== state.lastRouteKey) handleRouteChange(nextRouteKey);

    const video = findPlayerVideo();
    rateKeeper.bind(video);
    bindAutoplayVideo(video);
    ensureRateUi();
    ensureAutoWidescreen();
    updateAutoplayMode();
  }

  function queueScan() {
    if (state.scanQueued || !playbackRuntimeNeeded()) return;
    state.scanQueued = true;
    window.requestAnimationFrame(scan);
  }

  function stopRuntimeWatchers() {
    documentObserver?.disconnect();
    documentObserver = null;
    if (fallbackScanTimer) {
      clearInterval(fallbackScanTimer);
      fallbackScanTimer = null;
    }
    cancelAutoplayTimers();
    unbindAutoplayVideo();
    rateKeeper?.unbind();
    removeRateUi();
    document.body && document.body.classList.remove(
      'biliplus-autoplay-blocking',
      'biliplus-autoplay-ending-blocked'
    );
    state.widescreen.key = '';
    state.widescreen.userOverrideKey = '';
  }

  function startRuntimeWatchers() {
    if (!documentObserver) {
      documentObserver = new MutationObserver(queueScan);
      documentObserver.observe(document.documentElement, {
        childList: true,
        subtree: true
      });
    }
    if (!fallbackScanTimer) {
      fallbackScanTimer = window.setInterval(queueScan, 1000);
    }
    queueScan();
  }

  function updateRuntimeWatchers() {
    if (playbackRuntimeNeeded()) {
      startRuntimeWatchers();
    } else {
      stopRuntimeWatchers();
    }
  }

  function applyStorageChange(changes, namespace) {
    if (namespace !== 'sync') return;

    const oldMaster = config.master;
    const oldRememberSetting = config.rememberRate;
    if (changes[STORAGE_KEYS.master]) config.master = Boolean(changes[STORAGE_KEYS.master].newValue);
    if (changes[STORAGE_KEYS.steplessRate]) config.steplessRate = Boolean(changes[STORAGE_KEYS.steplessRate].newValue);
    if (changes[STORAGE_KEYS.rememberRate]) config.rememberRate = Boolean(changes[STORAGE_KEYS.rememberRate].newValue);
    if (changes[STORAGE_KEYS.autoWidescreen]) config.autoWidescreen = Boolean(changes[STORAGE_KEYS.autoWidescreen].newValue);
    if (changes[STORAGE_KEYS.autoplayMode]) {
      config.autoplayMode = normalizeAutoplayMode(changes[STORAGE_KEYS.autoplayMode].newValue);
    }

    if (changes[STORAGE_KEYS.rateValue] && rateKeeper) {
      rateKeeper.setDesiredRate(changes[STORAGE_KEYS.rateValue].newValue, {
        apply: config.master && config.rememberRate,
        persist: false,
        source: 'storage'
      });
    }

    if (rateKeeper && oldMaster !== config.master) {
      // 总开关只暂停功能，不采纳站点当前的 1.0x，也不覆盖已保存倍速。
      rateKeeper.setPaused(!config.master);
    }

    if (rateKeeper && oldRememberSetting !== config.rememberRate) {
      if (!oldRememberSetting && config.rememberRate && config.master && !rateKeeper.video) {
        const currentVideo = findPlayerVideo();
        if (currentVideo) {
          rateKeeper.setDesiredRate(currentVideo.playbackRate, {
            apply: false,
            persist: true,
            source: 'remember-enabled'
          });
        }
      }
      rateKeeper.setRemember(config.rememberRate, {
        preferCurrent: !oldRememberSetting && config.rememberRate && Boolean(rateKeeper.video)
      });
    }

    if (!featureEnabled('autoWidescreen')) {
      state.widescreen.key = '';
      state.widescreen.userOverrideKey = '';
    }
    updateRuntimeWatchers();
  }

  function initialize(storage) {
    readConfig(storage);
    rateKeeper = new PlaybackRateKeeper({
      initialRate: getInitialRate(storage),
      paused: !config.master,
      getRemember: () => featureEnabled('rememberRate'),
      onRateChange: (rate, metadata) => {
        updateRateUi(rate);
        if (metadata.persist) persistRate(rate);
      }
    });

    state.initialized = true;
    state.lastRouteKey = routeKey();

    document.addEventListener('keydown', handleRateShortcut, true);
    window.addEventListener('popstate', queueScan);
    window.addEventListener('pageshow', queueScan);
    chrome.storage.onChanged.addListener(applyStorageChange);

    // MutationObserver 能覆盖绝大多数 SPA 跳转；低频兜底只在至少一个
    // 播放增强启用时运行，避免总开关关闭后继续唤醒后台标签页。
    updateRuntimeWatchers();
  }

  chrome.storage.sync.get(STORAGE_KEY_LIST, initialize);
})();
