/**
 * 全局补丁文件
 * 专门修复b站影响用户体验的全局补丁，非复杂功能性的
 * 谨慎放入！因为没有开关去控制这些补丁的开启与关闭。
 */

/**
 * 解决无法通过 ESC 键退出图片的补丁
 * */
window.addEventListener('keydown', e => {
  if (e.key === 'Escape') {
    const exitButton = document.querySelector('.reply-view-image .operation-btn-icon.close-container');
    if (exitButton) exitButton.click();
  }
});
