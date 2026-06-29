import { sys } from 'cc';

export const DEV_BACKEND_HOST = '192.168.3.44';
export const BACKEND_PORT = 8080;

export function resolveApiBaseUrl(): string {
  const browserLocation = (globalThis as { location?: { protocol?: string; hostname?: string } }).location;
  if (browserLocation?.hostname && browserLocation.hostname !== 'localhost' && browserLocation.hostname !== '127.0.0.1') {
    return `${browserLocation.protocol || 'http:'}//${browserLocation.hostname}:${BACKEND_PORT}/api`;
  }
  if (sys.isNative) return `http://${DEV_BACKEND_HOST}:${BACKEND_PORT}/api`;
  return `http://127.0.0.1:${BACKEND_PORT}/api`;
}
