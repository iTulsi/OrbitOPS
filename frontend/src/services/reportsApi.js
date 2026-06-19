const API_BASE_URL =
    import.meta.env.VITE_API_BASE_URL ||
    (import.meta.env.DEV ? 'http://127.0.0.1:5050' : '');

const SNAPSHOT_CACHE_KEY = 'orbitops:reports:snapshot:v1';
const AI_CACHE_KEY = 'orbitops:reports:ai-briefing:v1';

function getStorage() {
    try {
        return window.localStorage;
    } catch {
        return null;
    }
}

function readJsonCache(key) {
    const storage = getStorage();
    if (!storage) return null;

    try {
        const raw = storage.getItem(key);
        return raw ? JSON.parse(raw) : null;
    } catch {
        return null;
    }
}

function writeJsonCache(key, value) {
    const storage = getStorage();
    if (!storage) return;

    try {
        storage.setItem(key, JSON.stringify(value));
    } catch {
        // A full or unavailable browser cache should never break the page.
    }
}

async function fetchJson(path, { timeoutMs = 12000, signal } = {}) {
    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), timeoutMs);
    const abortFromParent = () => controller.abort();

    if (signal) {
        if (signal.aborted) controller.abort();
        else signal.addEventListener('abort', abortFromParent, { once: true });
    }

    try {
        const response = await fetch(`${API_BASE_URL}${path}`, {
            signal: controller.signal,
            cache: 'no-store',
            headers: { Accept: 'application/json' },
        });

        let payload = null;
        try {
            payload = await response.json();
        } catch {
            throw new Error(`OrbitOPS returned invalid JSON (${response.status})`);
        }

        if (!response.ok) {
            throw new Error(
                payload?.message ||
                payload?.error ||
                `OrbitOPS request failed (${response.status})`,
            );
        }

        return payload;
    } catch (error) {
        if (error?.name === 'AbortError') {
            throw new Error('OrbitOPS report request timed out');
        }
        throw error;
    } finally {
        window.clearTimeout(timer);
        signal?.removeEventListener('abort', abortFromParent);
    }
}

function successfulValue(result) {
    return result.status === 'fulfilled' ? result.value : null;
}

function errorMessage(result) {
    if (result.status !== 'rejected') return null;
    return result.reason?.message || 'Request unavailable';
}

function normaliseSnapshot(results) {
    const statsPayload = successfulValue(results.stats);
    const conjunctionPayload = successfulValue(results.conjunctions);
    const dataStatusPayload = successfulValue(results.dataStatus);
    const healthPayload = successfulValue(results.health);

    const payload = {
        generated_at: new Date().toISOString(),
        stats: statsPayload?.stats || statsPayload || {},
        stats_meta: statsPayload || {},
        conjunctions: conjunctionPayload || {},
        data_status: dataStatusPayload || {},
        health: healthPayload || {},
        warnings: [
            errorMessage(results.stats),
            errorMessage(results.conjunctions),
            errorMessage(results.dataStatus),
            errorMessage(results.health),
        ].filter(Boolean),
    };

    const hasUsefulData =
        Object.keys(payload.stats).length > 0 ||
        Array.isArray(payload.conjunctions?.events) ||
        Object.keys(payload.data_status).length > 0 ||
        Object.keys(payload.health).length > 0;

    if (!hasUsefulData) {
        throw new Error(payload.warnings[0] || 'OrbitOPS report data is unavailable');
    }

    return payload;
}

export function readCachedReportSnapshot() {
    return readJsonCache(SNAPSHOT_CACHE_KEY);
}

export function readCachedAiBriefing() {
    return readJsonCache(AI_CACHE_KEY);
}

export async function fetchReportSnapshot({ signal } = {}) {
    const [stats, conjunctions, dataStatus, health] = await Promise.allSettled([
        fetchJson('/api/stats', { timeoutMs: 10000, signal }),
        fetchJson('/api/conjunctions?limit=120', { timeoutMs: 12000, signal }),
        fetchJson('/api/data-status', { timeoutMs: 8000, signal }),
        fetchJson('/api/health', { timeoutMs: 8000, signal }),
    ]);

    const payload = normaliseSnapshot({ stats, conjunctions, dataStatus, health });
    writeJsonCache(SNAPSHOT_CACHE_KEY, payload);
    return payload;
}

export async function fetchAiBriefing({ signal } = {}) {
    const separator = '/api/ai/briefing'.includes('?') ? '&' : '?';
    const payload = await fetchJson(
        `/api/ai/briefing${separator}request_time=${Date.now()}`,
        { timeoutMs: 70000, signal },
    );

    const normalised = {
        briefing: String(payload?.briefing || '').trim(),
        model: payload?.model || 'OrbitOPS briefing engine',
        status: payload?.status || 'ok',
        message: payload?.message || null,
        generated_at: new Date().toISOString(),
    };

    if (!normalised.briefing) {
        throw new Error('OrbitOPS returned an empty AI briefing');
    }

    writeJsonCache(AI_CACHE_KEY, normalised);
    return normalised;
}

export function exportReportJson(report) {
    const blob = new Blob([JSON.stringify(report, null, 2)], {
        type: 'application/json;charset=utf-8',
    });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    const stamp = new Date().toISOString().replaceAll(':', '-');

    anchor.href = url;
    anchor.download = `orbitops-ai-briefing-${stamp}.json`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
}
