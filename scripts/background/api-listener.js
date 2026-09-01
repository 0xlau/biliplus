/**
 * Background service worker，承担两件事：
 * 1. 监听 /x/player/wbi/v2 请求并重发，判断视频是否有字幕（auto-subtitle 功能）
 * 2. 作为第三方归档站（biliplus.com / jijidown.com）的受限 fetch 代理，
 *    供 content script 绕过 CORS（invalid-video-info 功能），仅放行 ARCHIVE_PREFIXES 白名单
 */

function isExtensionRequest(details) {
    // 检查是否是扩展发起的请求
    return details.initiator?.startsWith('chrome-extension://') || 
           details.documentUrl?.startsWith('chrome-extension://');
}

const ARCHIVE_PREFIXES = [
    'https://www.biliplus.com/api/',
    'https://www.jijidown.com/api/v1/'
];

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.type !== 'biliplus-archive-fetch') {
        return;
    }
    const url = message.url;
    if (typeof url !== 'string' || !ARCHIVE_PREFIXES.some((prefix) => url.startsWith(prefix))) {
        sendResponse({ ok: false, error: 'blocked' });
        return;
    }
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);
    fetch(url, { signal: controller.signal })
        .then((response) => response.text().then((text) => ({ status: response.status, text })))
        .then(({ status, text }) => {
            if (status < 200 || status >= 300) {
                sendResponse({ ok: false, error: `http ${status}`, status });
                return;
            }
            sendResponse({ ok: true, status, text });
        })
        .catch((error) => sendResponse({ ok: false, error: String(error) }))
        .finally(() => clearTimeout(timer));
    return true;
});

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
