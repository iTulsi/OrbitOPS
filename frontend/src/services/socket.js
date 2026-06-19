import { io } from 'socket.io-client';

const LOCAL_API_URL = 'http://127.0.0.1:5050';

function getSocketUrl() {
    const configured = import.meta.env.VITE_API_BASE_URL?.trim();
    if (configured) return configured.replace(/\/$/, '');

    const localFrontend =
        window.location.hostname === 'localhost' ||
        window.location.hostname === '127.0.0.1';

    if (localFrontend && window.location.port !== '5050') {
        return LOCAL_API_URL;
    }

    return undefined;
}

export const orbitSocket = io(getSocketUrl(), {
    transports: ['websocket', 'polling'],
    reconnection: true,
    reconnectionAttempts: Infinity,
    reconnectionDelay: 1200,
    reconnectionDelayMax: 10000,
    timeout: 10000,
});
