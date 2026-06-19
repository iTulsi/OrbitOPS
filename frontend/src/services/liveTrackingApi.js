const LOCAL_API_URL = 'http://127.0.0.1:5050';

function getApiBaseUrl() {
    const configured = import.meta.env.VITE_API_BASE_URL?.trim();

    if (configured) {
        return configured.replace(/\/$/, '');
    }

    const isLocalFrontend =
        window.location.hostname === 'localhost' ||
        window.location.hostname === '127.0.0.1';

    if (isLocalFrontend && window.location.port !== '5050') {
        return LOCAL_API_URL;
    }

    return '';
}

async function requestJson(path, { signal, timeoutMs = 8000 } = {}) {
    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => controller.abort(), timeoutMs);

    const abortFromParent = () => controller.abort();
    signal?.addEventListener('abort', abortFromParent, { once: true });

    try {
        const response = await fetch(`${getApiBaseUrl()}${path}`, {
            method: 'GET',
            cache: 'no-store',
            signal: controller.signal,
            headers: {
                Accept: 'application/json',
            },
        });

        const payload = await response.json().catch(() => null);

        if (!response.ok) {
            throw new Error(
                payload?.message ||
                payload?.error ||
                `OrbitOPS API request failed (${response.status})`
            );
        }

        return payload;
    } catch (error) {
        if (controller.signal.aborted && !signal?.aborted) {
            throw new Error('OrbitOPS telemetry request timed out');
        }
        throw error;
    } finally {
        window.clearTimeout(timeoutId);
        signal?.removeEventListener('abort', abortFromParent);
    }
}

export function fetchLiveObjects({
    limit = 700,
    signal,
    timeoutMs = 8000,
} = {}) {
    const safeLimit = Math.max(1, Math.min(Number(limit) || 700, 2500));
    return requestJson(`/api/satellites/live?limit=${safeLimit}`, {
        signal,
        timeoutMs,
    });
}

export function fetchTrackingStatus({ signal, timeoutMs = 5000 } = {}) {
    return requestJson('/api/data-status', { signal, timeoutMs });
}
