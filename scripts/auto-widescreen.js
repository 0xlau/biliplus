/**
 * 自动宽屏播放
 */
chrome.storage.sync.get(['biliplus-enable', 'auto-widescreen'], storage => {
  if (storage['biliplus-enable'] && storage['auto-widescreen']) {
    const targetNode = document.querySelector('#bilibili-player');
    const observer = createObserver(targetNode, () => {
      const wideScreenBtn = document.querySelector('.bpx-player-ctrl-btn.bpx-player-ctrl-wide');
      if (wideScreenBtn) {
        wideScreenBtn.click();
        return true;
      }
    });
  }
});

function createObserver(
  targetNode,
  callback,
  options = {
    childList: true,
    subtree: true
  }
) {
  const observer = new MutationObserver((mutations, ob) => {
    const result = callback(mutations, ob);
    if (result) disconnect();
  });
  observer.observe(targetNode, options);
  const disconnect = () => observer.disconnect();
  return observer;
}
