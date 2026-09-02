/**
 * BiliPlus background service worker.
 *
 * Keep each background feature isolated so a missing legacy API cannot stop
 * privacy-rule registration for the rest of the extension.
 */

let informationCocoonLoadError = null;
try {
    importScripts(chrome.runtime.getURL('scripts/background/information-cocoon.js'));
} catch (error) {
    informationCocoonLoadError = error;
    console.error('加载拒绝信息茧房后台模块失败', error);
}

if (informationCocoonLoadError) {
    chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
        if (message?.type !== 'biliplus-sync-information-cocoon') return undefined;
        sendResponse({
            ok: false,
            error: `后台模块加载失败：${informationCocoonLoadError.message}`,
        });
        return false;
    });
}

let archiveProxyLoadError = null;
try {
    importScripts(chrome.runtime.getURL('scripts/background/archive-proxy.js'));
} catch (error) {
    archiveProxyLoadError = error;
    console.error('加载失效视频归档代理失败', error);
}

if (archiveProxyLoadError) {
    chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
        if (message?.type !== 'biliplus-archive-fetch') return undefined;
        sendResponse({
            ok: false,
            error: `后台模块加载失败：${archiveProxyLoadError.message}`,
        });
        return false;
    });
}

function isExtensionRequest(details) {
    return details.initiator?.startsWith('chrome-extension://') ||
           details.documentUrl?.startsWith('chrome-extension://');
}

chrome.webRequest?.onCompleted?.addListener((details) => {
    if (isExtensionRequest(details)) return;

    if (details.type === 'xmlhttprequest') {
        fetch(details.url)
            .then(response => response.json())
            .then(data => {
                if (data?.data?.subtitle?.subtitles?.length > 0) {
                    chrome.tabs.sendMessage(
                        details.tabId,
                        {
                            type: 'subtitle-ready',
                            exists: true
                        }
                    );
                }
            })
            .catch(error => console.error('获取字幕数据失败:', error));
    }
}, {
    urls: ['*://api.bilibili.com/x/player/wbi/v2*'],
});
