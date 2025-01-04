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
        return ;
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
    }},
    {
        urls: ["*://api.bilibili.com/x/player/wbi/v2*"],
    }
);
