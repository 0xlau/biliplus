/**
 * 搜索净化与本地历史增强。
 *
 * “关闭热搜排行榜”同时隐藏热搜面板和输入框里的灰色热词，但不会
 * 隐藏用户输入后出现的搜索联想。本地历史只补充 B 站没有展示的记录，
 * 因而可以和站点原生历史并存。
 */
(function initSearchEnhancements(globalScope) {
  'use strict';

  const DEFAULT_HISTORY_LIMIT = 20;
  const MAX_HISTORY_LIMIT = 50;
  const CONFIG_STORAGE_KEYS = [
    'biliplus-enable',
    'hide-hot-search-list',
    'search-history-limit',
  ];
  const HISTORY_STORAGE_KEY = 'search-history';

  const SEARCH_INPUT_SELECTOR = [
    '.nav-search-input',
    '#nav-searchform input[type="text"]',
    '.nav-search-form input[type="text"]',
  ].join(', ');
  const SEARCH_FORM_SELECTOR = [
    '#nav-searchform',
    'form.nav-search-form',
    '.center-search__bar form',
  ].join(', ');
  const SEARCH_PANEL_SELECTOR = '.search-panel';
  const CUSTOM_HISTORY_CLASS = 'biliplus-search-history';

  function parseHistoryLimit(value) {
    const parsed = Number.parseInt(value, 10);
    if (!Number.isFinite(parsed) || parsed < 1) {
      return DEFAULT_HISTORY_LIMIT;
    }
    return Math.min(parsed, MAX_HISTORY_LIMIT);
  }

  function normalizeQuery(value) {
    if (typeof value !== 'string') {
      return '';
    }
    return value.trim().replace(/\s+/g, ' ').slice(0, 100);
  }

  function queryIdentity(value) {
    const query = normalizeQuery(value);
    try {
      return query.normalize('NFKC').toLocaleLowerCase();
    } catch (_) {
      return query.toLocaleLowerCase();
    }
  }

  function normalizeHistory(history, limit = DEFAULT_HISTORY_LIMIT) {
    const result = [];
    const seen = new Set();
    const normalizedLimit = parseHistoryLimit(limit);

    if (!Array.isArray(history)) {
      return result;
    }

    for (const value of history) {
      const query = normalizeQuery(value);
      const identity = queryIdentity(query);
      if (!query || seen.has(identity)) {
        continue;
      }
      seen.add(identity);
      result.push(query);
      if (result.length >= normalizedLimit) {
        break;
      }
    }
    return result;
  }

  function mergeHistory(history, query, limit = DEFAULT_HISTORY_LIMIT) {
    return normalizeHistory([query, ...(Array.isArray(history) ? history : [])], limit);
  }

  function getAdditionalHistory(history, nativeHistory, limit = DEFAULT_HISTORY_LIMIT) {
    const nativeIdentities = new Set(
      normalizeHistory(nativeHistory, MAX_HISTORY_LIMIT).map(queryIdentity),
    );
    return normalizeHistory(history, limit).filter(
      query => !nativeIdentities.has(queryIdentity(query)),
    );
  }

  function extractSearchQuery(urlValue) {
    let url;
    try {
      url = new URL(urlValue, 'https://www.bilibili.com/');
    } catch (_) {
      return '';
    }

    const isSearchPage =
      url.hostname === 'search.bilibili.com' ||
      (url.hostname.endsWith('.bilibili.com') && /^\/search(?:\/|$)/.test(url.pathname));
    if (!isSearchPage) {
      return '';
    }

    for (const key of ['keyword', 'q', 'search_query']) {
      const value = normalizeQuery(url.searchParams.get(key) || '');
      if (value) {
        return value;
      }
    }
    return '';
  }

  const publicApi = {
    DEFAULT_HISTORY_LIMIT,
    MAX_HISTORY_LIMIT,
    parseHistoryLimit,
    normalizeQuery,
    normalizeHistory,
    mergeHistory,
    getAdditionalHistory,
    extractSearchQuery,
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = publicApi;
  }

  if (
    typeof document === 'undefined' ||
    typeof chrome === 'undefined' ||
    !chrome.storage ||
    !chrome.storage.sync ||
    !chrome.storage.local
  ) {
    return;
  }

  const state = {
    masterEnabled: false,
    featureEnabled: false,
    enabled: false,
    history: [],
    historyLimit: DEFAULT_HISTORY_LIMIT,
    observer: null,
    refreshScheduled: false,
    listenersInstalled: false,
    lastRecordedQuery: '',
    lastRecordedAt: 0,
  };
  const savedPlaceholders = new WeakMap();

  function saveHistory(history) {
    chrome.storage.local.set({ [HISTORY_STORAGE_KEY]: history });
  }

  function findSearchInput(node) {
    if (!node || typeof node.closest !== 'function') {
      return null;
    }
    if (node.matches && node.matches(SEARCH_INPUT_SELECTOR)) {
      return node;
    }
    const form = node.closest(SEARCH_FORM_SELECTOR);
    return form ? form.querySelector(SEARCH_INPUT_SELECTOR) : null;
  }

  function getPanelInput(panel) {
    const searchBar = panel.closest(
      '.center-search__bar, .center-search-container, .nav-search, .bili-header',
    );
    return searchBar ? searchBar.querySelector(SEARCH_INPUT_SELECTOR) : null;
  }

  function getPanels() {
    return Array.from(document.querySelectorAll(SEARCH_PANEL_SELECTOR));
  }

  function rememberAndHidePlaceholder(input) {
    const placeholder = input.getAttribute('placeholder');
    if (placeholder) {
      savedPlaceholders.set(input, placeholder);
      input.setAttribute('placeholder', '');
    }
  }

  function restorePlaceholders() {
    document.querySelectorAll(SEARCH_INPUT_SELECTOR).forEach(input => {
      const placeholder = savedPlaceholders.get(input);
      if (placeholder && !input.getAttribute('placeholder')) {
        input.setAttribute('placeholder', placeholder);
      }
      savedPlaceholders.delete(input);
    });
  }

  function isNativeHistory(historyElement) {
    return Boolean(
      historyElement && !historyElement.classList.contains(CUSTOM_HISTORY_CLASS),
    );
  }

  function getNativeHistoryElement(panel) {
    return Array.from(panel.querySelectorAll('.history')).find(isNativeHistory) || null;
  }

  function extractNativeHistory(panel) {
    const historyElement = getNativeHistoryElement(panel);
    if (!historyElement) {
      return [];
    }

    const values = [];
    const candidates = historyElement.querySelectorAll(
      '.history-item .history-text, .history-item, [data-keyword], [data-value]',
    );
    candidates.forEach(candidate => {
      if (candidate.closest('.clear')) {
        return;
      }
      const value =
        candidate.dataset.keyword ||
        candidate.dataset.value ||
        candidate.getAttribute('title') ||
        candidate.textContent;
      const query = normalizeQuery(value || '');
      if (query && query !== '搜索历史' && query !== '清空') {
        values.push(query);
      }
    });
    return normalizeHistory(values, MAX_HISTORY_LIMIT);
  }

  function createHistorySection() {
    const section = document.createElement('section');
    section.className = CUSTOM_HISTORY_CLASS;
    section.setAttribute('aria-label', 'BiliPlus 搜索历史');

    const header = document.createElement('div');
    header.className = `${CUSTOM_HISTORY_CLASS}__header`;

    const title = document.createElement('span');
    title.className = `${CUSTOM_HISTORY_CLASS}__title`;
    title.textContent = '更多搜索历史';

    const clearButton = document.createElement('button');
    clearButton.type = 'button';
    clearButton.className = `${CUSTOM_HISTORY_CLASS}__clear`;
    clearButton.dataset.biliplusClearSearchHistory = 'true';
    clearButton.textContent = '清空扩展记录';

    const items = document.createElement('div');
    items.className = `${CUSTOM_HISTORY_CLASS}__items`;

    header.append(title, clearButton);
    section.append(header, items);
    return section;
  }

  function historySignature(history) {
    return history.map(queryIdentity).join('\u0000');
  }

  function updateHistoryItems(section, history) {
    const signature = historySignature(history);
    if (section.dataset.historySignature === signature) {
      return;
    }

    const items = section.querySelector(`.${CUSTOM_HISTORY_CLASS}__items`);
    items.replaceChildren();
    history.forEach(query => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = `${CUSTOM_HISTORY_CLASS}__item`;
      button.dataset.biliplusSearchQuery = query;
      button.title = query;
      button.textContent = query;
      items.append(button);
    });
    section.dataset.historySignature = signature;
  }

  function insertHistorySection(panel, section) {
    const nativeHistory = getNativeHistoryElement(panel);
    if (nativeHistory) {
      nativeHistory.insertAdjacentElement('afterend', section);
      return;
    }
    const trendingOrSuggestions = panel.querySelector('.trending, .suggestions');
    panel.insertBefore(section, trendingOrSuggestions || panel.firstChild);
  }

  function hasSuggestionItems(panel) {
    const suggestions = panel.querySelector('.suggestions');
    return Boolean(
      suggestions &&
        (suggestions.querySelector('.suggest-item, [role="option"], a') ||
          normalizeQuery(suggestions.textContent || '')),
    );
  }

  function updatePanel(panel) {
    const input = getPanelInput(panel);
    const hasInputValue = Boolean(input && normalizeQuery(input.value));
    const nativeHistory = extractNativeHistory(panel);
    const additionalHistory = getAdditionalHistory(
      state.history,
      nativeHistory,
      state.historyLimit,
    );

    let section = panel.querySelector(`.${CUSTOM_HISTORY_CLASS}`);
    if (additionalHistory.length > 0) {
      if (!section) {
        section = createHistorySection();
        insertHistorySection(panel, section);
      }
      updateHistoryItems(section, additionalHistory);
      section.hidden = hasInputValue;
    } else if (section) {
      section.remove();
      section = null;
    }

    const hasNativeHistory = nativeHistory.length > 0 && !hasInputValue;
    const hasCustomHistory = Boolean(
      section && !section.hidden && additionalHistory.length > 0,
    );
    const empty = !hasNativeHistory && !hasCustomHistory && !hasSuggestionItems(panel);
    panel.classList.toggle('biliplus-search-panel-empty', empty);
    const searchBar = panel.closest('.center-search__bar');
    if (searchBar) {
      searchBar.classList.toggle('biliplus-search-panel-empty', empty);
    }
  }

  function refreshDom() {
    state.refreshScheduled = false;
    if (!state.enabled || !document.body) {
      return;
    }

    document.body.classList.add('biliplus-hide-hot-search-list');
    document.querySelectorAll(SEARCH_INPUT_SELECTOR).forEach(rememberAndHidePlaceholder);
    getPanels().forEach(updatePanel);
  }

  function scheduleRefresh() {
    if (!state.enabled || state.refreshScheduled) {
      return;
    }
    state.refreshScheduled = true;
    const schedule = globalScope.requestAnimationFrame || (callback => setTimeout(callback, 0));
    schedule(refreshDom);
  }

  function mutationMayAffectSearch(mutation) {
    if (
      mutation.type === 'attributes' &&
      mutation.attributeName === 'placeholder' &&
      mutation.target.matches(SEARCH_INPUT_SELECTOR)
    ) {
      return true;
    }
    if (
      mutation.target.nodeType === Node.ELEMENT_NODE &&
      mutation.target.closest(SEARCH_PANEL_SELECTOR)
    ) {
      return true;
    }

    return Array.from(mutation.addedNodes).some(node => {
      if (node.nodeType !== Node.ELEMENT_NODE) {
        return false;
      }
      return (
        node.matches(`${SEARCH_INPUT_SELECTOR}, ${SEARCH_PANEL_SELECTOR}`) ||
        Boolean(node.querySelector(`${SEARCH_INPUT_SELECTOR}, ${SEARCH_PANEL_SELECTOR}`))
      );
    });
  }

  function startObserver() {
    if (state.observer || !document.body) {
      return;
    }
    state.observer = new MutationObserver(mutations => {
      if (mutations.some(mutationMayAffectSearch)) {
        scheduleRefresh();
      }
    });
    state.observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['placeholder'],
    });
  }

  function stopObserver() {
    if (state.observer) {
      state.observer.disconnect();
      state.observer = null;
    }
  }

  function clearEnhancementDom() {
    if (!document.body) {
      return;
    }
    document.body.classList.remove('biliplus-hide-hot-search-list');
    document
      .querySelectorAll(`.${CUSTOM_HISTORY_CLASS}`)
      .forEach(section => section.remove());
    document.querySelectorAll('.biliplus-search-panel-empty').forEach(element => {
      element.classList.remove('biliplus-search-panel-empty');
    });
    restorePlaceholders();
  }

  function applyEnabledState() {
    if (state.enabled) {
      startObserver();
      scheduleRefresh();
      recordQuery(extractSearchQuery(globalScope.location.href));
    } else {
      stopObserver();
      clearEnhancementDom();
    }
  }

  function recordQuery(value) {
    if (!state.enabled) {
      return;
    }
    const query = normalizeQuery(value);
    if (!query) {
      return;
    }

    const now = Date.now();
    if (queryIdentity(query) === state.lastRecordedQuery && now - state.lastRecordedAt < 1000) {
      return;
    }
    state.lastRecordedQuery = queryIdentity(query);
    state.lastRecordedAt = now;

    const nextHistory = mergeHistory(state.history, query, state.historyLimit);
    if (historySignature(nextHistory) === historySignature(state.history)) {
      return;
    }
    state.history = nextHistory;
    saveHistory(nextHistory);
    scheduleRefresh();
  }

  function clearLocalHistory() {
    state.history = [];
    saveHistory([]);
    scheduleRefresh();
  }

  function submitCustomHistoryQuery(button) {
    const query = normalizeQuery(button.dataset.biliplusSearchQuery || '');
    const panel = button.closest(SEARCH_PANEL_SELECTOR);
    const input = panel ? getPanelInput(panel) : null;
    if (!query || !input) {
      return;
    }

    const valueSetter = Object.getOwnPropertyDescriptor(
      globalScope.HTMLInputElement.prototype,
      'value',
    );
    if (valueSetter && valueSetter.set) {
      valueSetter.set.call(input, query);
    } else {
      input.value = query;
    }
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
    recordQuery(query);

    const form = input.closest(SEARCH_FORM_SELECTOR);
    const searchButton = form
      ? form.querySelector('.nav-search-btn, [type="submit"]') ||
        (form.parentElement && form.parentElement.querySelector('.nav-search-btn'))
      : null;
    if (searchButton) {
      searchButton.click();
    } else if (form && typeof form.requestSubmit === 'function') {
      form.requestSubmit();
    } else {
      globalScope.location.assign(
        `https://search.bilibili.com/all?keyword=${encodeURIComponent(query)}`,
      );
    }
  }

  function handleFocusOrInput(event) {
    if (state.enabled && findSearchInput(event.target)) {
      scheduleRefresh();
    }
  }

  function handleSubmit(event) {
    if (!state.enabled || !event.target.matches(SEARCH_FORM_SELECTOR)) {
      return;
    }
    const input = event.target.querySelector(SEARCH_INPUT_SELECTOR);
    recordQuery(input && input.value);
  }

  function handleKeydown(event) {
    if (!state.enabled || event.key !== 'Enter' || event.isComposing) {
      return;
    }
    const input = findSearchInput(event.target);
    if (input) {
      recordQuery(input.value);
    }
  }

  function handleClick(event) {
    if (!state.enabled || !(event.target instanceof Element)) {
      return;
    }

    const customHistoryButton = event.target.closest('[data-biliplus-search-query]');
    if (customHistoryButton) {
      event.preventDefault();
      event.stopPropagation();
      submitCustomHistoryQuery(customHistoryButton);
      return;
    }

    if (event.target.closest('[data-biliplus-clear-search-history]')) {
      event.preventDefault();
      event.stopPropagation();
      clearLocalHistory();
      return;
    }

    const nativeClear = event.target.closest('.search-panel .history .clear');
    if (nativeClear && !nativeClear.closest(`.${CUSTOM_HISTORY_CLASS}`)) {
      clearLocalHistory();
      return;
    }

    const searchButton = event.target.closest('.nav-search-btn, [type="submit"]');
    if (searchButton && searchButton.closest(SEARCH_FORM_SELECTOR)) {
      const input = findSearchInput(searchButton);
      recordQuery(input && input.value);
    }
  }

  function installListeners() {
    if (state.listenersInstalled) {
      return;
    }
    state.listenersInstalled = true;
    document.addEventListener('focusin', handleFocusOrInput, true);
    document.addEventListener('input', handleFocusOrInput, true);
    document.addEventListener('submit', handleSubmit, true);
    document.addEventListener('keydown', handleKeydown, true);
    document.addEventListener('click', handleClick, true);
    globalScope.addEventListener('popstate', () => {
      recordQuery(extractSearchQuery(globalScope.location.href));
      scheduleRefresh();
    });
  }

  function readStorage() {
    let config = {};
    let storedHistory = {};
    let pendingReads = 2;

    const finishRead = () => {
      pendingReads -= 1;
      if (pendingReads > 0) {
        return;
      }
      state.historyLimit = parseHistoryLimit(config['search-history-limit']);
      state.history = normalizeHistory(
        storedHistory[HISTORY_STORAGE_KEY],
        state.historyLimit,
      );
      state.masterEnabled = Boolean(config['biliplus-enable']);
      state.featureEnabled = Boolean(config['hide-hot-search-list']);
      state.enabled = state.masterEnabled && state.featureEnabled;
      installListeners();
      applyEnabledState();
    };

    chrome.storage.sync.get(CONFIG_STORAGE_KEYS, storage => {
      config = storage;
      finishRead();
    });
    chrome.storage.local.get(HISTORY_STORAGE_KEY, storage => {
      storedHistory = storage;
      finishRead();
    });
  }

  if (chrome.storage.onChanged) {
    chrome.storage.onChanged.addListener((changes, areaName) => {
      if (areaName === 'local') {
        if (changes[HISTORY_STORAGE_KEY]) {
          state.history = normalizeHistory(
            changes[HISTORY_STORAGE_KEY].newValue,
            state.historyLimit,
          );
          scheduleRefresh();
        }
        return;
      }
      if (areaName !== 'sync') {
        return;
      }

      const wasEnabled = state.enabled;
      if (changes['search-history-limit']) {
        state.historyLimit = parseHistoryLimit(
          changes['search-history-limit'].newValue,
        );
        const trimmedHistory = normalizeHistory(state.history, state.historyLimit);
        if (historySignature(trimmedHistory) !== historySignature(state.history)) {
          state.history = trimmedHistory;
          saveHistory(trimmedHistory);
        }
      }
      if (changes['biliplus-enable']) {
        state.masterEnabled = Boolean(changes['biliplus-enable'].newValue);
      }
      if (changes['hide-hot-search-list']) {
        state.featureEnabled = Boolean(changes['hide-hot-search-list'].newValue);
      }

      state.enabled = state.masterEnabled && state.featureEnabled;

      if (state.enabled !== wasEnabled) {
        applyEnabledState();
      } else {
        scheduleRefresh();
      }
    });
  }

  readStorage();
})(typeof window !== 'undefined' ? window : globalThis);
