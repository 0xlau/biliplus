/**
 * 隐藏搜索栏热搜列表
 */
chrome.storage.sync.get(["biliplus-enable", "hide-hot-search-list"], (storage) => {
  if (storage["biliplus-enable"] && storage["hide-hot-search-list"]) {
    const header = document.querySelector(location.href.includes('bilibili.com/video') ? '#biliMainHeader' : ".bili-header");
    header.addEventListener('focusin', () => {
      const history = document.querySelector('.search-panel .history')
      const searchPanel = document.querySelector('.search-panel')
      const navSearchform = document.querySelector('#nav-searchform')
      if (!history) {
        searchPanel.style.display = 'none'
        navSearchform.style.borderRadius = '8px'

      }
    })
    const navSearch = document.querySelector('body')
    navSearch.classList.add('biliplus-hide-hot-search-list')
  }
});
