/**
 * 隐藏用户评论实现
 */
chrome.storage.sync.get(["biliplus-enable", "hide-user-comment"], (storage) => {
  if (
    storage["biliplus-enable"] &&
    storage["hide-user-comment"] != null &&
    storage["hide-user-comment"].length > 0
  ) {
    setInterval(() => {
      const rootUsers = document.getElementsByClassName("root-reply-avatar");
      if (rootUsers != null){
        for (const rootUser of rootUsers){
          for (const hideUser of storage["hide-user-comment"]) {
            if (String(hideUser.mid) == rootUser.dataset['userId']){
              const replyItem = _UTILS.findParentElement(rootUser, (e) => e.className == "reply-item");
              if (replyItem != null) replyItem.remove();
            }
          }
        }
      }
      const subUsers = document.getElementsByClassName("sub-reply-avatar");
      if (subUsers != null){
        for (const subUser of subUsers){
          for (const hideUser of storage["hide-user-comment"]) {
            if (String(hideUser.mid) == subUser.dataset['userId']){
              const replyItem = _UTILS.findParentElement(subUser, (e) => e.className == "sub-reply-item");
              if (replyItem != null) replyItem.remove();
            }
          }
        }
      }
    }, 500);
  }
});
