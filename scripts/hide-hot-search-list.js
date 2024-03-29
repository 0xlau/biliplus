/**
 * 隐藏搜索栏热搜列表
 */
chrome.storage.sync.get(['biliplus-enable', 'hide-hot-search-list'], storage => {
  if (storage['biliplus-enable'] && storage['hide-hot-search-list']) {
    const body = document.querySelector('body');
    body.classList.add('biliplus-hide-hot-search-list');

    // 解决没有历史记录时显示空白的问题
    const navSearchform = document.querySelector('#nav-searchform');
    navSearchform.addEventListener('focusin', () => {
      const history = document.querySelector('.search-panel .history');
      const searchPanel = document.querySelector('.search-panel');
      if (!history) {
        searchPanel.style.display = 'none';
        body.classList.add('biliplus-hide-hot-search-list-search-panel-raduis');
      } else {
        searchPanel.style.display = 'block';
        body.classList.remove('biliplus-hide-hot-search-list-search-panel-raduis');
        const clearButton = document.querySelector('.search-panel .history .clear');
        clearButton.addEventListener('click', () => {
          searchPanel.style.display = 'none';
          body.classList.add('biliplus-hide-hot-search-list-search-panel-raduis');
        });
      }
    });

    // 防止搜索框输入时候样式改变导致下边框圆角不一致
    const navSearchInput = document.querySelector('.nav-search-input');
    navSearchInput.addEventListener('input', () => {
      const suggestions = document.querySelector('.search-panel .suggestions');
      const history = document.querySelector('.search-panel .history');
      const searchPanel = document.querySelector('.search-panel');
      console.log(!suggestions && !history);
      if (!suggestions && !history) {
        searchPanel.style.display = 'none';
        body.classList.add('biliplus-hide-hot-search-list-search-panel-raduis');
      } else {
        searchPanel.style.display = 'block';
        body.classList.remove('biliplus-hide-hot-search-list-search-panel-raduis');
      }
    });
  }
});
