/**
 * 视频封面显示观看人数实现
 */

let timer = null;
let isRunning = false;

function forcedClose() {
  clearInterval(timer);
  const data = {};
  data["cover-viewer"] = false;
  chrome.storage.sync.set(data);
  console.error(
    "BILIPLUS: 请求可能已被限制，无法使用视频封面显示观看人数功能！"
  );
}

chrome.storage.sync.get(["biliplus-enable", "cover-viewer"], (storage) => {
  if (storage["biliplus-enable"] && storage["cover-viewer"]) {
    timer = setInterval(async () => {
      if (isRunning){
        return;
      }
      isRunning = true;
      const statItemHTML = `
        <span class="bili-video-card__stats--item" id="biliplus-cover-viewer-[[bvid]]">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            xmlns:xlink="http://www.w3.org/1999/xlink"
            viewBox="0 0 18 18"
            width="18"
            height="18"
            fill="currentColor"
            class="bili-video-card__stats--icon"
          >
            <path
              d="M8.905125 4.21875C5.3084925 4.21875 2.91858 7.0112925 1.9141875 8.486775C1.6989299999999998 8.801475 1.6989299999999998 9.198525 1.9141875 9.513225C2.91858 10.9887 5.3084925 13.78125 8.905125 13.78125C12.475237499999999 13.78125 14.959274999999998 11.032275 16.03575 9.5415375C16.274437499999998 9.2125875 16.274437499999998 8.7874125 16.03575 8.4584625C14.959274999999998 6.9677325 12.475237499999999 4.21875 8.905125 4.21875zM0.982035 7.857037500000001C2.0200875 6.33186 4.7038575 3.09375 8.905125 3.09375C13.062375 3.09375 15.84075 6.266655 16.950075000000002 7.803112499999999C17.4696375 8.523787500000001 17.4696375 9.476212499999999 16.950075000000002 10.1968875C15.84075 11.733337500000001 13.062375 14.90625 8.905125 14.90625C4.7038575 14.90625 2.0200875 11.668162500000001 0.982035 10.1429625C0.5096475 9.4478625 0.5096475 8.5521375 0.982035 7.857037500000001z"
              fill="currentColor"
            ></path>
            <path
              d="M9 6.84375C7.809150000000001 6.84375 6.84375 7.809150000000001 6.84375 9C6.84375 10.19085 7.809150000000001 11.15625 9 11.15625C10.19085 11.15625 11.15625 10.19085 11.15625 9C11.15625 7.809150000000001 10.19085 6.84375 9 6.84375zM5.71875 9C5.71875 7.18782 7.18782 5.71875 9 5.71875C10.8121875 5.71875 12.28125 7.18782 12.28125 9C12.28125 10.8121875 10.8121875 12.28125 9 12.28125C7.18782 12.28125 5.71875 10.8121875 5.71875 9z"
              fill="currentColor"
            ></path>
          </svg>
          <span>[[statItem.number]]</span>
        </span>
        `;

      const statElements = document.getElementsByClassName(
        "bili-video-card__stats--left"
      );
      for (const statElement of statElements) {
        // 检测是不是目标Element
        const targetElement = _UTILS.findParentElement(
          statElement,
          (e) => e.className == "bili-video-card__image--link"
        );
        if (targetElement == null) {
          continue;
        }
        // 检测120秒前是否已经刷新过
        const lastTS = statElement.getAttribute(
          "data-biliplus-cover-viewer-last-ts"
        );
        if (lastTS != null && Date.now() - Number(lastTS) < 120 * 1000) {
          continue;
        }
        // 是否具有aid、cid记录
        let bvid = _UTILS.getBvidFromUrl(targetElement.getAttribute("href"));
        let aid = statElement.getAttribute("data-biliplus-aid");
        let cid = statElement.getAttribute("data-biliplus-cid");
        if (aid == null || cid == null) {
          // 获取aid、cid
          try {
            const videoInfo = await _BILIAPI.getVideoInfo(bvid);
            statElement.setAttribute("data-biliplus-aid", videoInfo.aid);
            statElement.setAttribute("data-biliplus-cid", videoInfo.cid);
            statElement.setAttribute("data-biliplus-bvid", videoInfo.bvid);
            aid = videoInfo.aid;
            cid = videoInfo.cid;
            bvid = videoInfo.bvid;
          } catch (e) {
            // 请求异常，立马终止该功能
            forcedClose();
            return;
          }
        }
        // 获取人数
        try {
          const onlineTotal = await _BILIAPI.getOnlineTotal(aid, cid, bvid);
          let targetSpan = document.getElementById(
            `biliplus-cover-viewer-${bvid}`
          );
          if (targetSpan == null) {
            targetSpan = document.createElement("span");
            statElement.appendChild(targetSpan);
          }
          targetSpan.outerHTML = statItemHTML
            .replace("[[statItem.number]]", onlineTotal.total)
            .replace("[[bvid]]", bvid);
          statElement.setAttribute(
            "data-biliplus-cover-viewer-last-ts",
            Date.now()
          );
        } catch (e) {
          // 请求异常，立马终止该功能
          forcedClose();
          return;
        }
      }
      isRunning = false;
    }, 2000);
  }
});
