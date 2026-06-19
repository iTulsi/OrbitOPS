const LOCAL_API_URL = 'http://127.0.0.1:5050';
const CACHE_KEY = 'orbitops-conjunctions-v1';

function getApiBaseUrl() {
    const configured = import.meta.env.VITE_API_BASE_URL?.trim();
    if (configured) return configured.replace(/\/$/, '');

    const localFrontend =
        window.location.hostname === 'localhost' ||
        window.location.hostname === '127.0.0.1';

    if (localFrontend && window.location.port !== '5050') return LOCAL_API_URL;
    return '';
}

async function requestJson(path, { signal, timeoutMs = 9000 } = {}) {
    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => controller.abort(), timeoutMs);
    const abortFromParent = () => controller.abort();
    signal?.addEventListener('abort', abortFromParent, { once: true });

    try {
        const response = await fetch(`${getApiBaseUrl()}${path}`, {
            method: 'GET',
            cache: 'no-store',
            signal: controller.signal,
            headers: { Accept: 'application/json' },
        });
        const payload = await response.json().catch(() => null);
        if (!response.ok) {
            throw new Error(
                payload?.message || payload?.error || `Request failed (${response.status})`
            );
        }
        return payload;
    } finally {
        window.clearTimeout(timeoutId);
        signal?.removeEventListener('abort', abortFromParent);
    }
}

export function readCachedConjunctions() {
    try {
        const payload = JSON.parse(window.localStorage.getItem(CACHE_KEY) || 'null');
        if (!payload || !Array.isArray(payload.events)) return null;
        return payload;
    } catch {
        return null;
    }
}

export function cacheConjunctions(payload) {
    try {
        if (payload && Array.isArray(payload.events)) {
            window.localStorage.setItem(CACHE_KEY, JSON.stringify(payload));
        }
    } catch {
        // Storage can be disabled; live data still works without it.
    }
}

export async function fetchConjunctions({ refresh = false, limit = 500, signal } = {}) {
    const params = new URLSearchParams({
        limit: String(limit),
        ...(refresh ? { refresh: '1' } : {}),
    });
    return requestJson(`/api/conjunctions?${params.toString()}`, {
        signal,
        timeoutMs: refresh ? 12000 : 9000,
    });
}

export async function fetchConjunctionHistory({
    status = 'active',
    limit = 1000,
    signal,
} = {}) {
    const params = new URLSearchParams({
        status: String(status),
        limit: String(limit),
    });

    return requestJson(`/api/conjunction-history?${params.toString()}`, {
        signal,
        timeoutMs: 9000,
    });
}
