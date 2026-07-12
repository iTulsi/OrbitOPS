import { io } from 'socket.io-client';

const LOCAL_API_URL = 'http://127.0.0.1:5050';
const REALTIME_MODE = import.meta.env.VITE_REALTIME_MODE?.trim().toLowerCase();
const POLL_INTERVAL_MS = Math.max(
    10000,
    Number(import.meta.env.VITE_POLL_INTERVAL_MS) || 30000,
);

function getApiBaseUrl() {
    const configured = import.meta.env.VITE_API_BASE_URL?.trim();
    if (configured) return configured.replace(/\/$/, '');

    const localFrontend =
        window.location.hostname === 'localhost' ||
        window.location.hostname === '127.0.0.1';

    if (localFrontend && window.location.port !== '5050') {
        return LOCAL_API_URL;
    }

    return '';
}

async function fetchJson(path) {
    const response = await fetch(`${getApiBaseUrl()}${path}`, {
        headers: { Accept: 'application/json' },
    });

    const payload = await response.json().catch(() => null);
    if (!response.ok) {
        throw new Error(
            payload?.message || `Realtime polling failed with HTTP ${response.status}`,
        );
    }

    return payload;
}

class PollingRealtimeClient {
    constructor() {
        this.connected = false;
        this.handlers = new Map();
        this.timer = null;
        this.inFlight = false;
        window.setTimeout(() => this.connect(), 0);
    }

    on(eventName, handler) {
        const handlers = this.handlers.get(eventName) || new Set();
        handlers.add(handler);
        this.handlers.set(eventName, handlers);
        return this;
    }

    off(eventName, handler) {
        if (!handler) {
            this.handlers.delete(eventName);
            return this;
        }

        const handlers = this.handlers.get(eventName);
        handlers?.delete(handler);
        if (handlers?.size === 0) this.handlers.delete(eventName);
        return this;
    }

    connect() {
        if (this.timer) return this;
        this.poll();
        this.timer = window.setInterval(() => this.poll(), POLL_INTERVAL_MS);
        return this;
    }

    disconnect() {
        if (this.timer) window.clearInterval(this.timer);
        this.timer = null;
        this.setConnected(false);
        return this;
    }

    emit(eventName, payload) {
        for (const handler of this.handlers.get(eventName) || []) {
            handler(payload);
        }
    }

    setConnected(nextConnected) {
        if (this.connected === nextConnected) return;
        this.connected = nextConnected;
        this.emit(nextConnected ? 'connect' : 'disconnect');
    }

    async poll() {
        if (this.inFlight) return;
        this.inFlight = true;

        try {
            const [orbitalResult, conjunctionResult] = await Promise.allSettled([
                fetchJson('/api/debris'),
                fetchJson('/api/conjunctions?limit=500'),
            ]);

            const hasSuccessfulResponse =
                orbitalResult.status === 'fulfilled' ||
                conjunctionResult.status === 'fulfilled';
            this.setConnected(hasSuccessfulResponse);

            if (orbitalResult.status === 'fulfilled') {
                const data = orbitalResult.value;
                this.emit('orbital_data', data);
                this.emit('risk_update', {
                    stats: data?.stats || {},
                    high_risk_objects: data?.high_risk_objects || [],
                    last_updated: data?.last_updated,
                    source: data?.source,
                });
            }

            if (conjunctionResult.status === 'fulfilled') {
                this.emit(
                    'conjunction_screening_complete',
                    conjunctionResult.value,
                );
            }
        } finally {
            this.inFlight = false;
        }
    }
}

function createSocketClient() {
    if (REALTIME_MODE === 'polling') {
        return new PollingRealtimeClient();
    }

    return io(getApiBaseUrl() || undefined, {
        transports: ['websocket', 'polling'],
        reconnection: true,
        reconnectionAttempts: Infinity,
        reconnectionDelay: 1200,
        reconnectionDelayMax: 10000,
        timeout: 10000,
    });
}

export const orbitSocket = createSocketClient();
