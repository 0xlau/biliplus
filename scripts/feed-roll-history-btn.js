/**
 * 首页“换一换”回溯与 R 快捷键。
 */
(function initFeedRollHistory(globalScope) {
  const BACK_BUTTON_ID = 'feed-roll-back-btn';
  const NEXT_BUTTON_ID = 'feed-roll-next-btn';
  const STORAGE_KEYS = ['biliplus-enable', 'feed-roll-history-btn'];
  const TRANSIENT_FILTER_CLASSES = [
    'biliplus-filtered-live-content',
    'biliplus-filtered-ad-content',
  ];
  const TRANSIENT_FILTER_SELECTOR = [
    '.biliplus-filtered-live-content',
    '.biliplus-filtered-ad-content',
    '[data-biliplus-filter-reason]',
  ].join(',');

  const snapshotsEqual = (left, right) =>
    Array.isArray(left) &&
    Array.isArray(right) &&
    left.length === right.length &&
    left.every((value, index) => value === right[index]);

  /**
   * Small, DOM-independent history state machine.
   * index === snapshots.length means the visible page has not been saved yet.
   */
  const createFeedHistory = maxEntries => {
    const snapshots = [];
    let index = 0;
    const historyLimit = Math.max(
      2,
      Number.isFinite(maxEntries) ? Math.floor(maxEntries) : 20
    );

    const validSnapshot = snapshot =>
      Array.isArray(snapshot) && snapshot.length > 0;

    const trimToLimit = () => {
      const overflow = snapshots.length - historyLimit;
      if (overflow <= 0) {
        return;
      }
      snapshots.splice(0, overflow);
      index = Math.max(0, index - overflow);
    };

    const saveBeforeRoll = snapshot => {
      if (!validSnapshot(snapshot)) {
        return;
      }

      if (index === snapshots.length) {
        if (!snapshotsEqual(snapshots[snapshots.length - 1], snapshot)) {
          snapshots.push(snapshot);
          trimToLimit();
        }
      } else {
        snapshots[index] = snapshot;
        snapshots.splice(index + 1);
      }
      index = snapshots.length;
    };

    const back = currentSnapshot => {
      if (index === snapshots.length) {
        if (!validSnapshot(currentSnapshot)) {
          return null;
        }

        // A second click before Bilibili finishes loading must not create a
        // duplicate history entry or jump two pages backwards.
        if (snapshotsEqual(snapshots[snapshots.length - 1], currentSnapshot)) {
          return null;
        }
        snapshots.push(currentSnapshot);
        trimToLimit();
      }

      if (index <= 0) {
        return null;
      }
      index -= 1;
      return snapshots[index] || null;
    };

    const next = () => {
      if (index >= snapshots.length - 1) {
        return null;
      }
      index += 1;
      return snapshots[index] || null;
    };

    const getState = () => ({
      index,
      length: snapshots.length,
      canGoBack: index > 0,
      canGoNext: index < snapshots.length - 1,
    });

    const reset = () => {
      snapshots.splice(0);
      index = 0;
    };

    return { saveBeforeRoll, back, next, getState, reset };
  };

  const isEditableElement = element => {
    if (!element || element.nodeType !== 1) {
      return false;
    }
    if (element.isContentEditable) {
      return true;
    }
    if (typeof element.closest !== 'function') {
      return false;
    }
    return Boolean(
      element.closest(
        'input, textarea, select, [contenteditable=""], [contenteditable="true"], [role="textbox"], [role="searchbox"], [role="combobox"]'
      )
    );
  };

  const isHomePageLocation = locationObject =>
    Boolean(
      locationObject &&
        locationObject.hostname === 'www.bilibili.com' &&
        (locationObject.pathname === '/' ||
          locationObject.pathname === '/index.html')
    );

  /**
   * Home content filters annotate feed cards while they are connected. History
   * snapshots retain the actual nodes, so those runtime-only annotations must
   * not outlive the setting that produced them. Once restored, an active
   * content-filter observer will classify the clean nodes again from their
   * structural signals.
   */
  const clearTransientFilterState = root => {
    if (!root || typeof root !== 'object') {
      return;
    }

    const markedElements = [root];
    if (typeof root.querySelectorAll === 'function') {
      markedElements.push(...root.querySelectorAll(TRANSIENT_FILTER_SELECTOR));
    }

    for (const element of markedElements) {
      element.classList?.remove(...TRANSIENT_FILTER_CLASSES);
      element.removeAttribute?.('data-biliplus-filter-reason');
    }
  };

  const shouldHandleRollShortcut = (
    event,
    locationObject,
    activeElement,
    hasRollButton
  ) =>
    Boolean(
      hasRollButton &&
        isHomePageLocation(locationObject) &&
        event &&
        String(event.key || '').toLowerCase() === 'r' &&
        !event.defaultPrevented &&
        !event.repeat &&
        !event.isComposing &&
        !event.altKey &&
        !event.ctrlKey &&
        !event.metaKey &&
        !event.shiftKey &&
        !isEditableElement(event.target) &&
        !isEditableElement(activeElement)
    );

  const api = {
    snapshotsEqual,
    createFeedHistory,
    clearTransientFilterState,
    isEditableElement,
    isHomePageLocation,
    shouldHandleRollShortcut,
  };

  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  }
  globalScope.BiliPlusFeedRollHistory = api;

  const documentObject = globalScope.document;
  const storage = globalScope.chrome?.storage;
  if (!documentObject?.documentElement || !storage?.sync) {
    return;
  }
  const history = createFeedHistory();
  let configured = false;
  let enabled = false;
  let mountScheduled = false;
  let mountObserving = false;
  let mountObserver = null;
  let routeMonitor = null;
  let nativeCaptureTimer = null;
  let nativeSnapshot = null;
  let nativeLoading = false;
  let displayingHistory = false;

  // The same undo glyph Bilibili uses in its recommendation-card feedback.
  const historyIconPaths = [
    'M8.28032 2.46967C8.57321 2.76257 8.57321 3.23744 8.28032 3.53033L4.81065 7L8.28032 10.46965C8.57321 10.76255 8.57321 11.23745 8.28032 11.53035C7.98743 11.8232 7.51254 11.8232 7.21966 11.53035L3.57321 7.88389C3.08505 7.39573 3.08505 6.60428 3.57321 6.11612L7.21966 2.46967C7.51254 2.17678 7.98743 2.17678 8.28032 2.46967Z',
    'M3.75 7C3.75 6.58579 4.08579 6.25 4.5 6.25L14.25 6.25C17.97795 6.25 21 9.27208 21 13C21 16.72795 17.97795 19.75 14.25 19.75L7.5 19.75C7.08579 19.75 6.75 19.4142 6.75 19C6.75 18.5858 7.08579 18.25 7.5 18.25L14.25 18.25C17.1495 18.25 19.5 15.8995 19.5 13C19.5 10.10052 17.1495 7.75 14.25 7.75L4.5 7.75C4.08579 7.75 3.75 7.41421 3.75 7Z',
  ];

  const createFeedRollButton = (id, className, label) => {
    const button = documentObject.createElement('button');
    button.type = 'button';
    button.id = id;
    button.className = `primary-btn ${className} biliplus-disabled`;
    button.disabled = true;
    button.title = label;
    button.setAttribute('aria-label', label);

    const svg = documentObject.createElementNS(
      'http://www.w3.org/2000/svg',
      'svg'
    );
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('fill', 'currentColor');
    svg.setAttribute('aria-hidden', 'true');
    for (const iconPath of historyIconPaths) {
      const path = documentObject.createElementNS(
        'http://www.w3.org/2000/svg',
        'path'
      );
      path.setAttribute('d', iconPath);
      svg.appendChild(path);
    }
    button.appendChild(svg);
    return button;
  };

  const snapshotCurrentFeed = () =>
    Array.from(documentObject.getElementsByClassName('feed-card'));

  const snapshotSignature = snapshot =>
    (Array.isArray(snapshot) ? snapshot : [])
      .map(card => card.querySelector?.('a[href]')?.href || '')
      .filter(Boolean)
      .join('\n');

  const restoreFeed = snapshot => {
    if (!Array.isArray(snapshot) || snapshot.length === 0) {
      return false;
    }
    const feedCards = snapshotCurrentFeed();
    if (feedCards.length === 0) {
      return false;
    }

    // These nodes may have spent time detached while filter settings changed.
    // Clear derived UI state before insertion; an enabled filter observer sees
    // the following replacements and deterministically re-applies current state.
    for (const card of snapshot) {
      clearTransientFilterState(card);
    }

    const count = Math.min(feedCards.length, snapshot.length);
    for (let index = 0; index < count; index += 1) {
      feedCards[index].replaceWith(snapshot[index]);
    }
    if (snapshot.length > count) {
      const parent =
        documentObject.querySelector(
          '.recommended-container_floor-aside .container'
        ) || feedCards[0].parentElement;
      if (!parent) return false;
      const previousSnapshotNode = snapshot[count - 1];
      const insertionPoint =
        previousSnapshotNode?.parentElement === parent
          ? previousSnapshotNode.nextSibling
          : null;
      for (let index = count; index < snapshot.length; index += 1) {
        parent.insertBefore(snapshot[index], insertionPoint);
      }
    } else {
      for (let index = count; index < feedCards.length; index += 1) {
        feedCards[index].remove();
      }
    }

    // The insertion mutations let active content filters re-apply live/ad
    // visibility. Keep the event as an explicit integration signal for other
    // BiliPlus modules that may need to refresh restored feed nodes.
    documentObject.dispatchEvent(
      new CustomEvent('biliplus:feed-history-restored')
    );
    return true;
  };

  const setButtonDisabled = (id, disabled) => {
    const button = documentObject.getElementById(id);
    if (!button) {
      return;
    }
    button.disabled = disabled;
    button.classList.toggle('biliplus-disabled', disabled);
  };

  const updateButtonStates = () => {
    const state = history.getState();
    setButtonDisabled(BACK_BUTTON_ID, nativeLoading || !state.canGoBack);
    setButtonDisabled(NEXT_BUTTON_ID, nativeLoading || !state.canGoNext);
  };

  const handleBack = () => {
    const currentSnapshot = snapshotCurrentFeed();
    if (!displayingHistory) {
      nativeSnapshot = currentSnapshot;
    }
    const snapshot = history.back(currentSnapshot);
    if (snapshot && restoreFeed(snapshot)) {
      displayingHistory = !snapshotsEqual(snapshot, nativeSnapshot);
    }
    updateButtonStates();
  };

  const handleNext = () => {
    const snapshot = history.next();
    if (snapshot && restoreFeed(snapshot)) {
      displayingHistory = !snapshotsEqual(snapshot, nativeSnapshot);
    }
    updateButtonStates();
  };

  const removeButtons = () => {
    documentObject.getElementById(BACK_BUTTON_ID)?.remove();
    documentObject.getElementById(NEXT_BUTTON_ID)?.remove();
  };

  const mountButtons = () => {
    mountScheduled = false;
    if (!enabled) {
      removeButtons();
      return;
    }

    const feedRollButton = documentObject.querySelector('.roll-btn');
    if (!feedRollButton?.parentElement) {
      return;
    }

    const parent = feedRollButton.parentElement;
    let backButton = documentObject.getElementById(BACK_BUTTON_ID);
    let nextButton = documentObject.getElementById(NEXT_BUTTON_ID);

    // The homepage can replace the entire roll-button container. Recreate our
    // controls in the new container instead of retaining detached references.
    if (!backButton || backButton.parentElement !== parent) {
      backButton?.remove();
      backButton = createFeedRollButton(
        BACK_BUTTON_ID,
        'feed-roll-back-btn',
        '返回上一组推荐'
      );
      parent.appendChild(backButton);
      backButton.addEventListener('click', handleBack);
    }

    if (!nextButton || nextButton.parentElement !== parent) {
      nextButton?.remove();
      nextButton = createFeedRollButton(
        NEXT_BUTTON_ID,
        'feed-roll-next-btn',
        '前往下一组推荐'
      );
      parent.appendChild(nextButton);
      nextButton.addEventListener('click', handleNext);
    }

    updateButtonStates();
    if (!displayingHistory && !nativeSnapshot) {
      const initialSnapshot = snapshotCurrentFeed();
      if (initialSnapshot.length > 0) {
        nativeSnapshot = initialSnapshot;
      }
    }
  };

  const scheduleMount = () => {
    if (mountScheduled) {
      return;
    }
    mountScheduled = true;
    queueMicrotask(mountButtons);
  };

  const stopNativeCapture = () => {
    clearTimeout(nativeCaptureTimer);
    nativeCaptureTimer = null;
    nativeLoading = false;
  };

  const scheduleNativeCapture = previousSnapshot => {
    stopNativeCapture();
    nativeLoading = true;
    updateButtonStates();
    let attempts = 0;
    const previousSignature = snapshotSignature(previousSnapshot);
    const capture = () => {
      nativeCaptureTimer = null;
      if (!enabled) {
        nativeLoading = false;
        return;
      }
      const currentSnapshot = snapshotCurrentFeed();
      const currentSignature = snapshotSignature(currentSnapshot);
      if (
        currentSnapshot.length > 0 &&
        !snapshotsEqual(currentSnapshot, previousSnapshot) &&
        currentSignature &&
        currentSignature !== previousSignature
      ) {
        nativeSnapshot = currentSnapshot;
        nativeLoading = false;
        displayingHistory = false;
        updateButtonStates();
        return;
      }
      attempts += 1;
      if (attempts < 40) {
        nativeCaptureTimer = setTimeout(capture, 100);
      } else {
        if (currentSnapshot.length > 0) {
          nativeSnapshot = currentSnapshot;
        }
        nativeLoading = false;
        updateButtonStates();
      }
    };
    nativeCaptureTimer = setTimeout(capture, 0);
  };

  const stopMountObserver = () => {
    mountObserver?.disconnect();
    mountObserving = false;
  };

  const startMountObserver = () => {
    if (mountObserving) {
      return;
    }
    if (!mountObserver) {
      mountObserver = new MutationObserver(() => {
        if (!enabled) {
          return;
        }
        const backButton = documentObject.getElementById(BACK_BUTTON_ID);
        const nextButton = documentObject.getElementById(NEXT_BUTTON_ID);
        const parent = backButton?.parentElement;
        if (
          backButton &&
          nextButton &&
          parent &&
          nextButton.parentElement === parent &&
          parent.querySelector('.roll-btn')
        ) {
          return;
        }
        scheduleMount();
      });
    }
    mountObserver.observe(documentObject.documentElement, {
      childList: true,
      subtree: true,
    });
    mountObserving = true;
  };

  const resetRuntimeState = () => {
    stopNativeCapture();
    history.reset();
    nativeSnapshot = null;
    nativeLoading = false;
    displayingHistory = false;
  };

  const syncRouteState = () => {
    const isRuntimeHomePage =
      globalScope.__BILIPLUS_BROWSER_TEST__ === true ||
      isHomePageLocation(globalScope.location);
    const nextEnabled = configured && isRuntimeHomePage;
    const changed = nextEnabled !== enabled;
    enabled = nextEnabled;
    documentObject.documentElement.toggleAttribute(
      'biliplus-feed-roll-history',
      enabled
    );

    if (enabled) {
      startMountObserver();
      scheduleMount();
    } else {
      stopMountObserver();
      if (changed && displayingHistory && nativeSnapshot) {
        restoreFeed(nativeSnapshot);
      }
      removeButtons();
      if (changed) {
        resetRuntimeState();
      }
    }
  };

  const updateRouteMonitor = () => {
    if (configured && !routeMonitor) {
      routeMonitor = setInterval(syncRouteState, 1000);
    } else if (!configured && routeMonitor) {
      clearInterval(routeMonitor);
      routeMonitor = null;
    }
  };

  const applyStorage = values => {
    configured = Boolean(
      values['biliplus-enable'] && values['feed-roll-history-btn']
    );
    updateRouteMonitor();
    syncRouteState();
  };

  storage.sync.get(STORAGE_KEYS, applyStorage);

  storage.onChanged?.addListener((changes, areaName) => {
    if (
      areaName === 'sync' &&
      STORAGE_KEYS.some(key => Object.prototype.hasOwnProperty.call(changes, key))
    ) {
      storage.sync.get(STORAGE_KEYS, applyStorage);
    }
  });

  // Capture before Bilibili handles the native click, so branching from an old
  // history page drops the obsolete forward branch deterministically.
  documentObject.addEventListener(
    'click',
    event => {
      if (!enabled || !(event.target instanceof Element)) {
        return;
      }
      if (event.target.closest('.roll-btn')) {
        const visibleSnapshot = snapshotCurrentFeed();
        const previousNativeSnapshot = nativeSnapshot?.length
          ? nativeSnapshot
          : visibleSnapshot;
        history.saveBeforeRoll(visibleSnapshot);
        if (displayingHistory && nativeSnapshot) {
          restoreFeed(nativeSnapshot);
        }
        displayingHistory = false;
        scheduleNativeCapture(previousNativeSnapshot);
        updateButtonStates();
      }
    },
    true
  );

  documentObject.addEventListener(
    'keydown',
    event => {
      const rollButton = documentObject.querySelector('.roll-btn');
      const canClick = Boolean(
        rollButton &&
          !rollButton.disabled &&
          rollButton.getAttribute('aria-disabled') !== 'true'
      );
      if (
        !enabled ||
        !shouldHandleRollShortcut(
          event,
          globalScope.__BILIPLUS_BROWSER_TEST__ === true
            ? { hostname: 'www.bilibili.com', pathname: '/' }
            : globalScope.location,
          documentObject.activeElement,
          canClick
        )
      ) {
        return;
      }

      event.preventDefault();
      event.stopImmediatePropagation();
      rollButton.click();
    },
    true
  );

  globalScope.addEventListener('popstate', syncRouteState);
  globalScope.addEventListener('pageshow', syncRouteState);
})(typeof globalThis === 'undefined' ? this : globalThis);
