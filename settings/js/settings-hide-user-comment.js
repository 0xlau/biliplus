const userButton = `
<button class="btn btn-ghost flex flex-col" id="user-[[userMid]]" data-user-mid="[[userMid]]" data-user-name="[[userName]]" data-user-avatar="[[userAvatar]]">
    <div class="avatar">
        <div class="w-8 rounded-full">
        <img src="[[userAvatar]]"/>
        </div>
    </div>
    <span>[[userName]]</span>
</button>
`;

$(function () {
  chrome.storage.sync.get('hide-user-comment', storage => {
    const userConfigs = storage['hide-user-comment'];
    if (userConfigs == null) {
      return;
    }
    for (const userConfig of userConfigs) {
      $('#userList').prepend(userButton.replaceAll('[[userAvatar]]', userConfig.upic).replaceAll('[[userName]]', userConfig.uname).replaceAll('[[userMid]]', userConfig.mid));
      $(`#user-${userConfig.mid}`).click(function () {
        const mid = $(this)[0].dataset['userMid'];
        removeUser($(this)[0], mid);
      });
    }
  });

  $('#userIdBox').keypress(async function (event) {
    if (event.which == '13') {
      event.preventDefault();
      var keyword = $(this).val();
      const userInfo = await _BILIAPI.getUserInfoByKeyword(keyword);
      if (userInfo == null) {
        return;
      }
      addUser($(this), userInfo.mid, userInfo.uname, 'https:' + userInfo.upic);
    }
  });
});

function addUser(ele, mid, uname, upic) {
  chrome.storage.sync.get('hide-user-comment', storage => {
    let userConfigs = storage['hide-user-comment'];
    if (userConfigs == null) {
      userConfigs = [];
    }
    const userConfigIndex = userConfigs.findIndex(obj => obj.mid == mid);
    if (userConfigIndex != -1) {
      return;
    }
    userConfigs.push({
      mid: mid,
      uname: uname,
      upic: upic
    });
    chrome.storage.sync.set({ 'hide-user-comment': userConfigs }, () => {
      $('#userList').prepend(userButton.replaceAll('[[userAvatar]]', upic).replaceAll('[[userName]]', uname).replaceAll('[[userMid]]', mid));
      $(`#user-${mid}`).click(function () {
        const mid = $(this)[0].dataset['userMid'];
        removeUser($(this)[0], mid);
      });
      ele.val('');
    });
  });
}

function removeUser(ele, mid) {
  chrome.storage.sync.get('hide-user-comment', storage => {
    const userConfigs = storage['hide-user-comment'];
    if (userConfigs == null) {
      return;
    }
    const userConfigIndex = userConfigs.findIndex(obj => obj.mid == mid);
    if (userConfigIndex == -1) {
      return;
    }
    userConfigs.splice(userConfigIndex, 1);
    chrome.storage.sync.set({ 'hide-user-comment': userConfigs }, () => {
      ele.remove();
    });
  });
}
