/**
 * 全站广告屏蔽
 */
chrome.storage.sync.get(["biliplus-enable", "ad-block"], (storage) => {
  if (storage["biliplus-enable"] && storage["ad-block"]) {
    replaceHomePageAds();
    removeOtherAds()

    const observer = new MutationObserver(() => {
      replaceHomePageAds();
      removeOtherAds();
    });
    observer.observe(document.body, {childList: true, subtree: true});
  }
});

function removeOtherAds() {
  let ads = document.querySelectorAll('.vcd');
  ads.forEach(ad => {
    ad.remove()
  });
}

function replaceHomePageAds() {
  let ads = document.querySelectorAll('.feed-card:has(a[href*="cm.bilibili.com"][data-target-url]:not([data-target-url*=".bilibili.com/"]))');
  ads.forEach(ad => {
    const skeleton = ad.querySelector('.bili-video-card__skeleton');
    const wrap = ad.querySelector('.bili-video-card__wrap');
    
    skeleton.classList.remove('hide')
    wrap.remove()
    
    const cover = skeleton.querySelector('.bili-video-card__skeleton--cover')
    cover.style = `position: relative;`
    cover.innerHTML = `
      <span style="position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); color: var(--text3);">biliplus已为您屏蔽该广告</span>
    `
  });
}
