/**
 * 首页干净模式实现
 */
chrome.storage.sync.get(["biliplus-enable", "clean-home-page"], (storage) => {
  if (storage["biliplus-enable"] && storage["clean-home-page"]) {
    let body = document.getElementsByTagName("body")[0];
    body.setAttribute("biliplus-clean-mode", "");
    document.getElementsByClassName("recommended-swipe")[0].remove();
  }
});
