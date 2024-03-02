/**
 * 首页“换一换”回溯功能实现
 */
chrome.storage.sync.get(
  ["biliplus-enable", "feed-roll-history-btn"],
  (storage) => {
    if (storage["biliplus-enable"] && storage["feed-roll-history-btn"]) {
      const feedHistory = [];
      let feedHistoryIndex = 0;

      const feedRollBackBtn = `
    <button id="feed-roll-back-btn" class="primary-btn feed-roll-back-btn biliplus-disabled">
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor"><path d="M5.82843 6.99955L8.36396 9.53509L6.94975 10.9493L2 5.99955L6.94975 1.0498L8.36396 2.46402L5.82843 4.99955H13C17.4183 4.99955 21 8.58127 21 12.9996C21 17.4178 17.4183 20.9996 13 20.9996H4V18.9996H13C16.3137 18.9996 19 16.3133 19 12.9996C19 9.68584 16.3137 6.99955 13 6.99955H5.82843Z"></path></svg>
    </button>
`;

      const feedRollNextBtn = `
    <button id="feed-roll-next-btn" class="primary-btn feed-roll-next-btn biliplus-disabled">
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor"><path d="M18.1716 6.99955H11C7.68629 6.99955 5 9.68584 5 12.9996C5 16.3133 7.68629 18.9996 11 18.9996H20V20.9996H11C6.58172 20.9996 3 17.4178 3 12.9996C3 8.58127 6.58172 4.99955 11 4.99955H18.1716L15.636 2.46402L17.0503 1.0498L22 5.99955L17.0503 10.9493L15.636 9.53509L18.1716 6.99955Z"></path></svg>
    </button>
`;

      let feedRollBtn = document.getElementsByClassName("roll-btn")[0];

      if (feedRollBtn) {
        // 处理返回上一页feed的历史内容
        let backBtn = document.createElement("button");
        feedRollBtn.parentNode.appendChild(backBtn);
        backBtn.outerHTML = feedRollBackBtn;

        document.getElementById("feed-roll-back-btn").addEventListener("click", () => {
          let feedCards = document.getElementsByClassName("feed-card");
          if (feedHistoryIndex == feedHistory.length) {
            feedHistory.push(listInnerHTMLOfFeedCard(feedCards));
          }
          for (let fc_i = 0; fc_i < feedCards.length; fc_i++) {
            feedCards[fc_i].innerHTML = feedHistory[feedHistoryIndex - 1][fc_i];
          }
          feedHistoryIndex = feedHistoryIndex - 1;
          if (feedHistoryIndex == 0) {
            disableElementById("feed-roll-back-btn", true);
          }
          disableElementById("feed-roll-next-btn", false);
        });

        // 处理返回下一页feed的历史内容
        let nextBtn = document.createElement("div");
        feedRollBtn.parentNode.appendChild(nextBtn);
        nextBtn.outerHTML = feedRollNextBtn;

        document.getElementById("feed-roll-next-btn").addEventListener("click", () => {
          let feedCards = document.getElementsByClassName("feed-card");

          for (let fc_i = 0; fc_i < feedCards.length; fc_i++) {
            feedCards[fc_i].innerHTML = feedHistory[feedHistoryIndex + 1][fc_i];
          }

          feedHistoryIndex = feedHistoryIndex + 1;
          if (feedHistoryIndex == feedHistory.length - 1) {
            disableElementById("feed-roll-next-btn", true);
          }
          disableElementById("feed-roll-back-btn", false);
        });

        // 处理点击换一换事件
        feedRollBtn.id = "feed-roll-btn";
        feedRollBtn.addEventListener("click", () => {
          if (feedHistoryIndex == feedHistory.length) {
            let feedCards = listInnerHTMLOfFeedCard(
              document.getElementsByClassName("feed-card")
            );
            feedHistory.push(feedCards);
          }
          feedHistoryIndex = feedHistory.length;
          disableElementById("feed-roll-back-btn", false);
          disableElementById("feed-roll-next-btn", true);
        });
      }
    }
  }
);

function disableElementById(id, bool) {
  if (bool) {
    document.getElementById(id).classList.add("biliplus-disabled");
  } else {
    document.getElementById(id).classList.remove("biliplus-disabled");
  }
}

function listInnerHTMLOfFeedCard(feedCardElements) {
  let feedCardInnerHTMLs = [];
  for (let fc of feedCardElements) {
    feedCardInnerHTMLs.push(fc.innerHTML);
  }
  return feedCardInnerHTMLs;
}
