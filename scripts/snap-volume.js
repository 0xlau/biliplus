/**
 * SnapVolume - 音量滑块整五吸附
 */

const STEP = 5;

function snap(value, step = STEP) {
  if (value <= 0) return 0;
  return Math.ceil(value / step) * step;
}

function snapFloor(value, step = STEP) {
  if (value <= 0) return 0;
  return Math.floor(value / step) * step;
}

// ============ Toast ============

let toastTimer = null;

function showToast(value, video) {
  const existing = document.getElementById('sv-toast');
  if (existing) existing.remove();

  const el = document.createElement('div');
  el.id = 'sv-toast';
  el.textContent = `\uD83D\uDD0A ${value}`;
  el.setAttribute('role', 'status');

  if (video) {
    const rect = video.getBoundingClientRect();
    el.style.cssText = `
      position: fixed !important;
      left: ${rect.left + rect.width / 2}px !important;
      top: ${rect.top + rect.height / 2}px !important;
      transform: translate(-50%, -50%) !important;
      z-index: 2147483647 !important;
    `;
  } else {
    el.style.cssText = `
      position: fixed !important;
      left: 50% !important;
      top: 50% !important;
      transform: translate(-50%, -50%) !important;
      z-index: 2147483647 !important;
    `;
  }

  document.body.appendChild(el);
  el.offsetHeight;
  el.style.opacity = '1';

  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    el.style.opacity = '0';
    setTimeout(() => el.remove(), 300);
  }, 800);
}

// ============ VideoVolumeHook ============

function hookVideoVolume(video) {
  if (video._sv_hooked) return;
  video._sv_hooked = true;

  const descriptor = Object.getOwnPropertyDescriptor(HTMLVideoElement.prototype, 'volume');
  if (!descriptor) return;

  Object.defineProperty(video, 'volume', {
    get() {
      return descriptor.get.call(this);
    },
    set(newVal) {
      const percent = newVal * 100;
      const snappedPercent = snap(percent);
      const snappedVal = snappedPercent / 100;

      const currentPercent = descriptor.get.call(this) * 100;
      if (Math.round(currentPercent) !== snappedPercent) {
        descriptor.set.call(this, snappedVal);
        setTimeout(() => {
          updateBiliVolumeDisplay(snappedPercent);
        }, 0);
      }
      return snappedVal;
    },
    configurable: true
  });
}

function updateBiliVolumeDisplay(percent) {
  const num = document.querySelector('.bpx-player-ctrl-volume-number');
  if (num) num.textContent = percent;
}

// ============ 滑块拦截 ============

function getClassName(el) {
  let cls = el.className || '';
  if (typeof cls !== 'string') cls = cls.baseVal || '';
  return cls;
}

function isBiliVolumeSlider(el) {
  if (!el) return false;
  const cls = getClassName(el).toLowerCase();
  return cls.includes('bpx-player-ctrl-volume-progress') || cls.includes('bui-slider');
}

function calcVolumeFromPointer(sliderEl, e) {
  const rect = sliderEl.getBoundingClientRect();
  const trackHeight = rect.height;
  const pointerY = e.clientY - rect.top;
  const percent = Math.max(0, Math.min(100, (1 - pointerY / trackHeight) * 100));
  return Math.round(percent);
}

function initSliderInterceptor() {
  let isDragging = false;
  let currentSlider = null;
  let lastSnapped = -1;

  document.addEventListener('pointerdown', e => {
    let el = e.target;
    while (el && el !== document.body && el !== document.documentElement) {
      if (isBiliVolumeSlider(el)) {
        e.preventDefault();
        isDragging = true;
        currentSlider = el;
        el.setPointerCapture(e.pointerId);
        return;
      }
      el = el.parentElement;
    }
  }, true);

  document.addEventListener('pointermove', e => {
    if (!isDragging || !currentSlider) return;
    if (e.buttons !== 1) return;

    const percent = calcVolumeFromPointer(currentSlider, e);
    const snapped = snap(percent);
    if (snapped === lastSnapped) return;

    lastSnapped = snapped;
    const video = document.querySelector('video');
    if (video) {
      video.volume = snapped / 100;
      updateBiliVolumeDisplay(snapped);
      showToast(snapped, video);
    }
  }, true);

  document.addEventListener('pointerup', () => {
    isDragging = false;
    currentSlider = null;
    lastSnapped = -1;
  }, true);

  document.addEventListener('wheel', e => {
    let el = e.target;
    while (el && el !== document.body && el !== document.documentElement) {
      if (isBiliVolumeSlider(el)) {
        e.preventDefault();
        e.stopPropagation();
        const video = document.querySelector('video');
        if (video) {
          const current = Math.round(video.volume * 100);
          let newVal;
          if (e.deltaY < 0) {
            newVal = snap(Math.min(100, current + STEP));
          } else {
            newVal = snapFloor(Math.max(0, current - STEP));
          }
          if (newVal === current) return;
          video.volume = newVal / 100;
          updateBiliVolumeDisplay(newVal);
          showToast(newVal, video);
        }
        return;
      }
      el = el.parentElement;
    }
  }, { passive: false });

  document.addEventListener('keydown', e => {
    const key = e.key;
    if (!['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(key)) return;

    let el = e.target;
    while (el && el !== document.body && el !== document.documentElement) {
      if (isBiliVolumeSlider(el)) {
        e.preventDefault();
        const video = document.querySelector('video');
        if (!video) return;
        const step = e.shiftKey ? 10 : STEP;
        const current = Math.round(video.volume * 100);
        let newVal;
        if (key === 'ArrowUp' || key === 'ArrowRight') {
          newVal = snap(Math.min(100, current + step));
        } else {
          newVal = snapFloor(Math.max(0, current - step));
        }
        if (newVal !== current) {
          video.volume = newVal / 100;
          updateBiliVolumeDisplay(newVal);
          showToast(newVal, video);
        }
        return;
      }
      el = el.parentElement;
    }
  }, true);
}

// ============ VideoObserver ============

function initVideoObserver() {
  const hooked = new WeakSet();

  function hookAllVideos() {
    document.querySelectorAll('video').forEach(v => {
      if (!hooked.has(v)) {
        hooked.add(v);
        hookVideoVolume(v);
      }
    });
  }

  hookAllVideos();
  const observer = new MutationObserver(hookAllVideos);
  observer.observe(document, { subtree: true, childList: true });
}

// ============ Init ============

function init() {
  chrome.storage.sync.get(['biliplus-enable', 'snap-volume'], storage => {
    if (storage['biliplus-enable'] && storage['snap-volume']) {
      initSliderInterceptor();
      initVideoObserver();
    }
  });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
