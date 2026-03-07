/**
 * 监听v2请求，并且重发，判断是否有字幕
 */

function isExtensionRequest(details) {
    // 检查是否是扩展发起的请求
    return details.initiator?.startsWith('chrome-extension://') ||
        details.documentUrl?.startsWith('chrome-extension://');
}

chrome.webRequest.onCompleted.addListener((details) => {
    // 只处理页面发起的请求
    if (isExtensionRequest(details)) {
        return;
    }

    if (details.type === 'xmlhttprequest') {
        fetch(details.url)
            .then(response => response.json())
            .then(data => {
                if (data?.data?.subtitle?.subtitles?.length > 0) {
                    // 发送消息给 content script
                    chrome.tabs.sendMessage(
                        details.tabId,
                        {
                            type: 'subtitle-ready',
                            exists: true
                        }
                    );
                }
            })
            .catch(error => console.error("获取字幕数据失败:", error));
    }
},
    {
        urls: ["*://api.bilibili.com/x/player/wbi/v2*"],
    }
);

// 新增：处理 Content Script 发来的跨域 API 请求（解决 MV3 下的 CORS 问题）
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.type === 'proxy-fetch') {
        const options = Object.assign({ credentials: 'include' }, request.options);
        fetch(request.url, options)
            .then(res => res.json())
            .then(data => sendResponse({ success: true, data: data }))
            .catch(error => sendResponse({ success: false, error: error.toString() }));

        return true; // 表明是异步相应
    }
});
