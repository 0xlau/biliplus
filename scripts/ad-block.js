/**
 * 全站广告屏蔽
 */
chrome.storage.sync.get(['biliplus-enable', 'ad-block'], storage => {
  if (storage['biliplus-enable'] && storage['ad-block']) {
    replaceHomePageAds();
    removeOtherAds();

    const observer = createObserver(document.body, () => {
      replaceHomePageAds();
      removeOtherAds();
    });
  }
});

function debounce(func, delay) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => func(...args), delay);
  };
}

function throttle(func, delay) {
  let throttled = false;
  return (...args) => {
    if (!throttled) {
      throttled = true;
      setTimeout(() => {
        func(...args);
        throttled = false;
      }, delay);
    }
  };
}

function createObserver(
  targetNode,
  callback,
  options = {
    childList: true,
    optimize: throttle, // debounce | throttle
    waite: 100
  }
) {
  const observer = new MutationObserver(options.optimize(callback, options.waite));
  observer.observe(targetNode, options);
  return observer;
}

let skeleton = null;
function replaceHomePageAds() {
  if (!skeleton) {
    skeleton = document.querySelector('.bili-video-card__skeleton').cloneNode(true);
    skeleton.classList.remove('hide');
    const cover = skeleton.querySelector('.bili-video-card__skeleton--cover');
    cover.style = `position: relative;`;
    cover.innerHTML = `
        <span style="position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); color: var(--text3);">已为您屏蔽该广告</span>
      `;
  }
  let ads = document.querySelectorAll('.bili-video-card:has(a[href*="cm.bilibili.com"][data-target-url]:not([data-target-url*=".bilibili.com/"]))');
  ads.forEach(ad => {
    const ad_wrap = ad.querySelector('.bili-video-card__wrap');
    ad_wrap.remove();

    ad.appendChild(skeleton.cloneNode(true));
  });
}

function removeOtherAds() {
  let ads = document.querySelectorAll('.vcd');
  ads.forEach(ad => {
    ad.remove();
  });
}
