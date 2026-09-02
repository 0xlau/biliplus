/**
 * Bilibili content filtering shared helpers and runtime.
 *
 * The matcher deliberately relies on structural signals (card classes, link
 * destinations, scoped badges and data attributes) instead of scanning titles.
 * This avoids hiding ordinary videos whose titles merely mention "直播" or
 * "广告".
 */
(function initHomeContentFilter(globalScope) {
  const CARD_SELECTOR = [
    '.feed-card',
    '.bili-live-card',
    '.floor-single-card',
    '.video-page-card-small',
    '.video-page-card',
    '.recommend-list-v1 .video-page-card-small',
    '.bili-video-card__wrap.__scale-wrap',
    '.bili-video-card',
  ].join(',');

  const CARD_ROOT_SELECTORS = [
    '.feed-card',
    '.bili-live-card',
    '.floor-single-card',
    '.video-page-card-small',
    '.video-page-card',
    '.bili-video-card__wrap.__scale-wrap',
    '.bili-video-card',
  ];

  const HOME_GRID_SELECTOR =
    '.recommended-container_floor-aside .container';

  const BADGE_SELECTOR = [
    '.bili-video-card__info--ad',
    '.bili-video-card__info--badge',
    '.bili-video-card__badge',
    '.bili-video-card__info--reason',
    '.rcmd-tag',
    '.vui_tag',
    '[class*="ad-tag"]',
    '[class*="live-tag"]',
  ].join(',');

  const AD_MARKER_SELECTOR = [
    '.bili-video-card__info--ad',
    '.ad-card',
    '.adcard',
    '.cm-card',
    '.is-ad',
    '[data-ad-report]',
    '[data-is-ad="true"]',
  ].join(',');

  const LIVE_MARKER_SELECTOR = [
    '.bili-live-card',
    '.live-card',
    '[data-room-id]',
    '[data-roomid]',
    '[room-id]',
  ].join(',');

  const normalizeText = value =>
    String(value || '')
      .replace(/\s+/g, ' ')
      .trim();

  const isLiveHref = href =>
    /^(?:https?:)?\/\/live\.bilibili\.com(?:[/:?#]|$)/i.test(
      String(href || '').trim()
    );

  const isAdHref = href =>
    /^(?:https?:)?\/\/(?:cm|ad)\.bilibili\.com(?:[/:?#]|$)/i.test(
      String(href || '').trim()
    );

  const isLiveBadgeText = text =>
    /^(?:正在)?直播(?:中)?$|^LIVE$/i.test(normalizeText(text));

  const isAdBadgeText = text =>
    /^(?:广告|推广|商业推广|创作推广|赞助|AD)$/i.test(normalizeText(text));

  const hasLiveClassName = classNames =>
    /(?:^|\s)(?:bili-)?live-card(?:\s|$)/i.test(String(classNames || ''));

  const hasAdClassName = classNames =>
    /(?:^|\s)(?:ad-card|adcard|cm-card|is-ad)(?:\s|$)/i.test(
      String(classNames || '')
    );

  const classifySignals = signals => {
    const safeSignals = signals || {};
    const hrefs = Array.isArray(safeSignals.hrefs) ? safeSignals.hrefs : [];
    const badgeTexts = Array.isArray(safeSignals.badgeTexts)
      ? safeSignals.badgeTexts
      : [];

    return {
      live:
        Boolean(safeSignals.hasLiveMarker) ||
        hasLiveClassName(safeSignals.classNames) ||
        hrefs.some(isLiveHref) ||
        badgeTexts.some(isLiveBadgeText),
      ad:
        Boolean(safeSignals.hasAdMarker) ||
        hasAdClassName(safeSignals.classNames) ||
        hrefs.some(isAdHref) ||
        badgeTexts.some(isAdBadgeText),
    };
  };

  const safeMatches = (element, selector) =>
    Boolean(
      element &&
        typeof element.matches === 'function' &&
        element.matches(selector)
    );

  const safeClosest = (element, selector) => {
    if (!element || typeof element.closest !== 'function') {
      return null;
    }
    return element.closest(selector);
  };

  const findCardRoot = element => {
    for (const selector of CARD_ROOT_SELECTORS) {
      const card = safeClosest(element, selector);
      if (card) {
        return card;
      }
    }
    return null;
  };

  /**
   * Bilibili occasionally wraps a feed card in an otherwise classless grid
   * item. Hiding the inner card leaves that grid item behind, so CSS Grid
   * still reserves an empty slot. Promote homepage cards to the direct grid
   * child while keeping sidebar cards scoped to their own card root.
   */
  const findLayoutCardRoot = card => {
    if (!card || typeof card.closest !== 'function') {
      return card || null;
    }
    const grid = card.closest(HOME_GRID_SELECTOR);
    if (!grid) {
      return card;
    }

    let layoutRoot = card;
    while (layoutRoot.parentElement && layoutRoot.parentElement !== grid) {
      layoutRoot = layoutRoot.parentElement;
    }
    return layoutRoot.parentElement === grid ? layoutRoot : card;
  };

  const extractCardSignals = card => {
    if (!card || typeof card.querySelectorAll !== 'function') {
      return {};
    }

    const linkElements = card.querySelectorAll('a[href], [data-target-url]');
    const badgeElements = card.querySelectorAll(BADGE_SELECTOR);

    return {
      classNames:
        typeof card.className === 'string'
          ? card.className
          : card.getAttribute?.('class') || '',
      hrefs: Array.from(linkElements, element =>
        element.getAttribute('href') ||
        element.getAttribute('data-target-url') ||
        ''
      ),
      badgeTexts: Array.from(
        badgeElements,
        element => element.textContent || ''
      ),
      hasAdMarker:
        safeMatches(card, AD_MARKER_SELECTOR) ||
        Boolean(card.querySelector(AD_MARKER_SELECTOR)),
      hasLiveMarker:
        safeMatches(card, LIVE_MARKER_SELECTOR) ||
        Boolean(card.querySelector(LIVE_MARKER_SELECTOR)),
    };
  };

  const classifyCard = card => classifySignals(extractCardSignals(card));

  const collectCards = root => {
    const cards = new Set();
    if (!root) {
      return cards;
    }

    const element = root.nodeType === 1 ? root : root.parentElement;
    if (!element) {
      return cards;
    }

    if (safeMatches(element, CARD_SELECTOR)) {
      cards.add(findCardRoot(element) || element);
    } else {
      const parentCard = findCardRoot(element);
      if (parentCard) {
        cards.add(parentCard);
      }
    }

    if (typeof element.querySelectorAll === 'function') {
      for (const candidate of element.querySelectorAll(CARD_SELECTOR)) {
        cards.add(findCardRoot(candidate) || candidate);
      }
    }

    return cards;
  };

  const api = {
    CARD_SELECTOR,
    normalizeText,
    isLiveHref,
    isAdHref,
    isLiveBadgeText,
    isAdBadgeText,
    classifySignals,
    classifyCard,
    collectCards,
    findCardRoot,
    findLayoutCardRoot,
  };

  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  }
  globalScope.BiliPlusHomeContentFilter = api;

  const storage = globalScope.chrome?.storage;
  const documentObject = globalScope.document;
  if (!storage?.sync || !documentObject?.documentElement) {
    return;
  }

  const STORAGE_KEYS = [
    'biliplus-enable',
    'hide-live-content',
    'hide-ad-content',
  ];
  const state = {
    enabled: false,
    hideLive: false,
    hideAds: false,
  };
  let observer;
  let scanScheduled = false;
  const pendingRoots = new Set();

  const updateRootAttributes = () => {
    const root = documentObject.documentElement;
    root.toggleAttribute(
      'biliplus-hide-live-content',
      state.enabled && state.hideLive
    );
    root.toggleAttribute(
      'biliplus-hide-ad-content',
      state.enabled && state.hideAds
    );
  };

  const applyCardState = card => {
    const classification = classifyCard(card);
    const hideAsLive = state.enabled && state.hideLive && classification.live;
    const hideAsAd = state.enabled && state.hideAds && classification.ad;

    const layoutRoot = findLayoutCardRoot(card) || card;
    if (layoutRoot !== card) {
      if (card.classList.contains('biliplus-filtered-live-content')) {
        card.classList.remove('biliplus-filtered-live-content');
      }
      if (card.classList.contains('biliplus-filtered-ad-content')) {
        card.classList.remove('biliplus-filtered-ad-content');
      }
      if (card.hasAttribute('data-biliplus-filter-reason')) {
        card.removeAttribute('data-biliplus-filter-reason');
      }
    }

    if (
      layoutRoot.classList.contains('biliplus-filtered-live-content') !==
      hideAsLive
    ) {
      layoutRoot.classList.toggle('biliplus-filtered-live-content', hideAsLive);
    }
    if (
      layoutRoot.classList.contains('biliplus-filtered-ad-content') !== hideAsAd
    ) {
      layoutRoot.classList.toggle('biliplus-filtered-ad-content', hideAsAd);
    }

    if (hideAsLive || hideAsAd) {
      const reason = [hideAsLive ? 'live' : '', hideAsAd ? 'ad' : '']
        .filter(Boolean)
        .join(' ');
      if (layoutRoot.getAttribute('data-biliplus-filter-reason') !== reason) {
        layoutRoot.setAttribute('data-biliplus-filter-reason', reason);
      }
    } else if (layoutRoot.hasAttribute('data-biliplus-filter-reason')) {
      layoutRoot.removeAttribute('data-biliplus-filter-reason');
    }
  };

  const scanRoot = root => {
    for (const card of collectCards(root)) {
      applyCardState(card);
    }
  };

  const flushScans = () => {
    scanScheduled = false;
    const roots = Array.from(pendingRoots);
    pendingRoots.clear();
    for (const root of roots) {
      scanRoot(root);
    }
  };

  const scheduleScan = root => {
    if (!root) {
      return;
    }
    pendingRoots.add(root);
    if (!scanScheduled) {
      scanScheduled = true;
      queueMicrotask(flushScans);
    }
  };

  const startObserver = () => {
    if (observer) {
      return;
    }
    observer = new MutationObserver(mutations => {
      for (const mutation of mutations) {
        if (mutation.type === 'childList') {
          for (const addedNode of mutation.addedNodes) {
            scheduleScan(addedNode);
          }
          if (mutation.addedNodes.length === 0) {
            scheduleScan(mutation.target);
          }
        } else {
          scheduleScan(mutation.target);
        }
      }
    });
    observer.observe(documentObject.documentElement, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: [
        'class',
        'href',
        'data-target-url',
        'data-ad-report',
        'data-is-ad',
        'data-room-id',
        'data-roomid',
        'room-id',
      ],
    });
  };

  const stopObserverAndClear = () => {
    observer?.disconnect();
    observer = undefined;
    pendingRoots.clear();

    for (const card of documentObject.querySelectorAll(
      '.biliplus-filtered-live-content, .biliplus-filtered-ad-content'
    )) {
      card.classList.remove(
        'biliplus-filtered-live-content',
        'biliplus-filtered-ad-content'
      );
      card.removeAttribute('data-biliplus-filter-reason');
    }
  };

  const applyStorageValues = values => {
    state.enabled = Boolean(values['biliplus-enable']);
    state.hideLive = Boolean(values['hide-live-content']);
    state.hideAds = Boolean(values['hide-ad-content']);
    updateRootAttributes();
    if (state.enabled && (state.hideLive || state.hideAds)) {
      scanRoot(documentObject.documentElement);
      startObserver();
    } else {
      stopObserverAndClear();
    }
  };

  storage.sync.get(STORAGE_KEYS, applyStorageValues);

  storage.onChanged?.addListener((changes, areaName) => {
    if (areaName !== 'sync') {
      return;
    }

    let changed = false;
    for (const key of STORAGE_KEYS) {
      if (Object.prototype.hasOwnProperty.call(changes, key)) {
        changed = true;
      }
    }
    if (!changed) {
      return;
    }

    storage.sync.get(STORAGE_KEYS, applyStorageValues);
  });
})(typeof globalThis === 'undefined' ? this : globalThis);
