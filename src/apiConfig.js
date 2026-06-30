/**
 * API routing: Vite dev (5173) uses proxied relative paths.
 * Remote/direct access uses backend port 8000.
 */
const host = window.location.hostname;
const port = window.location.port;
const useViteProxy = port === '5173' || port === '4173';

export const API_BASE = useViteProxy ? '' : `http://${host}:8000`;

export const COMMAND_URL = useViteProxy ? '/api/command' : `${API_BASE}/command`;

export function apiUrl(path) {
  const p = path.startsWith('/') ? path : `/${path}`;
  return API_BASE ? `${API_BASE}${p}` : p;
}

export function wsUrl(path) {
  const p = path.startsWith('/') ? path : `/${path}`;
  if (useViteProxy) {
    const proto = window.location.protocol === 'https:' ? 'wss' : 'ws';
    return `${proto}://${window.location.host}${p}`;
  }
  return `ws://${host}:8000${p}`;
}
