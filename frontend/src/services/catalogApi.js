const LOCAL_API_URL = 'http://127.0.0.1:5050';
const CACHE_KEY = 'orbitops-object-catalog-v1';

function getApiBaseUrl() {
    const configured = import.meta.env.VITE_API_BASE_URL?.trim();
    if (configured) return configured.replace(/\/$/, '');

    const isLocalFrontend =
        window.location.hostname === 'localhost' ||
        window.location.hostname === '127.0.0.1';

    if (isLocalFrontend && window.location.port !== '5050') return LOCAL_API_URL;
    return '';
}

function createQueryString(params = {}) {
    const query = new URLSearchParams();
    Object.entries(params).forEach(([key, value]) => {
        if (value === undefined || value === null || value === '') return;
        if (Array.isArray(value)) {
            if (value.length) query.set(key, value.join(','));
            return;
        }
        query.set(key, String(value));
    });
    return query.toString();
}

async function requestJson(path, { signal, timeoutMs = 12000 } = {}) {
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
            throw new Error(payload?.message || payload?.error || `OrbitOPS API request failed (${response.status})`);
        }
        return payload;
    } catch (error) {
        if (controller.signal.aborted && !signal?.aborted) {
            throw new Error('OrbitOPS catalog request timed out');
        }
        throw error;
    } finally {
        window.clearTimeout(timeoutId);
        signal?.removeEventListener('abort', abortFromParent);
    }
}

export function readCachedCatalog() {
    try {
        const cached = JSON.parse(window.localStorage.getItem(CACHE_KEY) || 'null');
        if (!cached?.payload?.rows?.length) return null;
        return cached.payload;
    } catch {
        return null;
    }
}

export function writeCachedCatalog(payload) {
    try {
        window.localStorage.setItem(CACHE_KEY, JSON.stringify({ savedAt: Date.now(), payload }));
    } catch {
        // Storage can be unavailable in private browsing. The live page still works.
    }
}

export async function fetchCatalog(params = {}, options = {}) {
    const query = createQueryString(params);
    const payload = await requestJson(`/api/catalog${query ? `?${query}` : ''}`, options);
    if (payload?.rows?.length) writeCachedCatalog(payload);
    return payload;
}

export function fetchCatalogObject(noradId, { refresh = false, signal, timeoutMs = 14000 } = {}) {
    const query = refresh ? '?refresh=1' : '';
    return requestJson(`/api/catalog/object/${encodeURIComponent(noradId)}${query}`, {
        signal,
        timeoutMs,
    });
}

function csvEscape(value) {
    if (value === null || value === undefined) return '';
    const text = String(value);
    return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export async function exportCatalog(params = {}, format = 'json') {
    const query = createQueryString(params);
    const payload = await requestJson(`/api/catalog/export${query ? `?${query}` : ''}`, {
        timeoutMs: 30000,
    });
    const rows = payload?.rows || [];
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');

    if (format.toLowerCase() === 'csv') {
        const fields = [
            ['norad_id', 'NORAD ID'],
            ['name', 'Object Name'],
            ['international_designator', 'International Designator'],
            ['type', 'Object Type'],
            ['owner_code', 'Owner Code'],
            ['country', 'Country / Owner'],
            ['status', 'Status'],
            ['launch_date', 'Launch Date'],
            ['orbital_regime', 'Orbital Regime'],
            ['altitude_km', 'Altitude (km)'],
            ['inclination_deg', 'Inclination (deg)'],
            ['velocity_km_s', 'Velocity (km/s)'],
            ['apogee_km', 'Apogee (km)'],
            ['perigee_km', 'Perigee (km)'],
            ['period_min', 'Period (min)'],
            ['updated_at', 'Updated'],
        ];
        const lines = [fields.map(([, label]) => csvEscape(label)).join(',')];
        rows.forEach((row) => {
            lines.push(fields.map(([key]) => csvEscape(row[key])).join(','));
        });
        downloadBlob(
            new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8' }),
            `orbitops-object-catalog-${timestamp}.csv`,
        );
        return payload;
    }

    downloadBlob(
        new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' }),
        `orbitops-object-catalog-${timestamp}.json`,
    );
    return payload;
}
