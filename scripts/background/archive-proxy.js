/**
 * Restricted JSON proxy for the optional invalid-video archive providers.
 *
 * Content scripts submit only a provider name and numeric aid values. The
 * service worker constructs every URL, omits credentials, rejects redirects,
 * and caps the response body before returning parsed JSON.
 */
(() => {
  const MESSAGE_TYPE = 'biliplus-archive-fetch';
  const MAX_BATCH_SIZE = 20;
  const MAX_RESPONSE_BYTES = 1024 * 1024;
  const REQUEST_TIMEOUT_MS = 8000;

  function normalizeAid(value) {
    const text = String(value ?? '').trim();
    if (!/^[1-9]\d{0,15}$/.test(text)) return null;
    const number = Number(text);
    return Number.isSafeInteger(number) ? String(number) : null;
  }

  function buildArchiveUrl(message) {
    switch (message?.provider) {
      case 'biliplus-aidinfo': {
        if (!Array.isArray(message.aids)) throw new Error('invalid-aids');
        const aids = [...new Set(message.aids.map(normalizeAid).filter(Boolean))];
        if (aids.length === 0 || aids.length > MAX_BATCH_SIZE) throw new Error('invalid-aids');
        const url = new URL('https://www.biliplus.com/api/aidinfo');
        url.searchParams.set('aid', aids.join(','));
        return url.toString();
      }
      case 'biliplus-view': {
        const aid = normalizeAid(message.aid);
        if (!aid) throw new Error('invalid-aid');
        const url = new URL('https://www.biliplus.com/api/view');
        url.searchParams.set('id', aid);
        return url.toString();
      }
      case 'jijidown-info': {
        const aid = normalizeAid(message.aid);
        if (!aid) throw new Error('invalid-aid');
        const url = new URL('https://www.jijidown.com/api/v1/video/get_info');
        url.searchParams.set('id', aid);
        return url.toString();
      }
      default:
        throw new Error('unknown-provider');
    }
  }

  function bodySize(text) {
    if (typeof TextEncoder === 'function') return new TextEncoder().encode(text).byteLength;
    return text.length;
  }

  async function fetchArchiveJson(url, fetchImpl = fetch) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
      const response = await fetchImpl(url, {
        signal: controller.signal,
        credentials: 'omit',
        redirect: 'error',
        cache: 'no-store',
        headers: { Accept: 'application/json' },
      });
      if (!response.ok) {
        return { ok: false, error: `http-${response.status}`, status: response.status };
      }
      const declaredLength = Number(response.headers?.get?.('content-length'));
      if (Number.isFinite(declaredLength) && declaredLength > MAX_RESPONSE_BYTES) {
        return { ok: false, error: 'response-too-large', status: response.status };
      }
      const text = await response.text();
      if (bodySize(text) > MAX_RESPONSE_BYTES) {
        return { ok: false, error: 'response-too-large', status: response.status };
      }
      try {
        return { ok: true, status: response.status, json: JSON.parse(text) };
      } catch {
        return { ok: false, error: 'invalid-json', status: response.status };
      }
    } catch (error) {
      return {
        ok: false,
        error: error?.name === 'AbortError' ? 'timeout' : 'fetch-failed',
      };
    } finally {
      clearTimeout(timer);
    }
  }

  function installArchiveProxy(runtime) {
    runtime.onMessage.addListener((message, sender, sendResponse) => {
      if (message?.type !== MESSAGE_TYPE) return undefined;
      if (sender?.id && sender.id !== runtime.id) {
        sendResponse({ ok: false, error: 'blocked-sender' });
        return false;
      }

      let url;
      try {
        url = buildArchiveUrl(message);
      } catch (error) {
        sendResponse({ ok: false, error: error.message || 'invalid-request' });
        return false;
      }

      fetchArchiveJson(url).then(sendResponse);
      return true;
    });
  }

  if (typeof chrome === 'object' && chrome.runtime?.onMessage) {
    installArchiveProxy(chrome.runtime);
  }

  if (typeof module === 'object' && module.exports) {
    module.exports = {
      MESSAGE_TYPE,
      MAX_BATCH_SIZE,
      MAX_RESPONSE_BYTES,
      normalizeAid,
      buildArchiveUrl,
      fetchArchiveJson,
      installArchiveProxy,
    };
  }
})();
