const DEFAULT_LOCAL_API = 'http://127.0.0.1:5050';
const CACHE_KEY = 'orbitops.analytics.v1';

function getApiBaseUrl() {
    const configured = import.meta.env.VITE_API_BASE_URL?.trim();

    if (configured) return configured.replace(/\/$/, '');

    const isLocal =
        window.location.hostname === 'localhost' ||
        window.location.hostname === '127.0.0.1';

    if (isLocal && window.location.port !== '5050') return DEFAULT_LOCAL_API;
    return '';
}

async function fetchJson(path, { signal } = {}) {
    const response = await fetch(`${getApiBaseUrl()}${path}`, {
        cache: 'no-store',
        headers: { Accept: 'application/json' },
        signal,
    });

    const payload = await response.json().catch(() => null);

    if (!response.ok) {
        throw new Error(
            payload?.message ||
            payload?.error ||
            `OrbitOPS analytics request failed (${response.status})`
        );
    }

    return payload;
}

export function readCachedAnalytics() {
    try {
        const raw = window.localStorage.getItem(CACHE_KEY);
        return raw ? JSON.parse(raw) : null;
    } catch {
        return null;
    }
}

export function cacheAnalytics(payload) {
    if (!payload || payload.status === 'warming') return;

    try {
        window.localStorage.setItem(CACHE_KEY, JSON.stringify(payload));
    } catch {
        // Storage can be unavailable in private browsing. The live request still works.
    }
}

export async function fetchAnalytics({
    windowRange = '7d',
    objectType = 'ALL',
    refresh = false,
    signal,
} = {}) {
    const params = new URLSearchParams({
        window: windowRange,
        object_type: objectType,
    });

    if (refresh) params.set('refresh', '1');

    const payload = await fetchJson(`/api/analytics?${params.toString()}`, { signal });
    cacheAnalytics(payload);
    return payload;
}
