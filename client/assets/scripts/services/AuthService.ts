import { sys } from 'cc';
import { setCurrentCoins } from './WalletService';

const DEV_BACKEND_HOST = '192.168.3.44';

export const AUTH_API_BASE_URL = resolveApiBaseUrl();

export type AuthCode = 'SUCCESS' | 'WRONG_PASSWORD' | 'USER_NOT_FOUND' | 'USERNAME_EXISTS' | 'INVALID_SESSION' | 'INVALID_REQUEST' | 'ERROR';

export interface AuthResponse {
  code: AuthCode;
  message: string;
  user?: {
    id: number;
    username: string;
    displayName: string;
    coins?: number;
  };
  authToken?: string;
  expiresAt?: string;
}

const DEVICE_ID_KEY = 'footballBounce.deviceId';
const AUTH_TOKEN_KEY = 'footballBounce.authToken';
const AUTH_USER_KEY = 'footballBounce.authUser';
const AUTH_EXPIRES_AT_KEY = 'footballBounce.authExpiresAt';
const GUEST_USER_ID = 1;

function resolveApiBaseUrl(): string {
  const browserLocation = (globalThis as { location?: { protocol?: string; hostname?: string } }).location;
  if (browserLocation?.hostname && browserLocation.hostname !== 'localhost' && browserLocation.hostname !== '127.0.0.1') {
    return `${browserLocation.protocol || 'http:'}//${browserLocation.hostname}:8080/api`;
  }
  if (sys.isNative) return `http://${DEV_BACKEND_HOST}:8080/api`;
  return 'http://127.0.0.1:8080/api';
}

export function authMessage(response: AuthResponse): string {
  if (response.message) return response.message;
  if (response.code === 'WRONG_PASSWORD') return '密码错误';
  if (response.code === 'USER_NOT_FOUND') return '未查询到用户';
  if (response.code === 'USERNAME_EXISTS') return '用户名已存在';
  if (response.code === 'INVALID_SESSION') return '自动登录已失效，请重新登录';
  return '请求失败';
}

export function loginWithPassword(username: string, password: string): Promise<AuthResponse> {
  return postAuth('/auth/login', { username, password, deviceId: getOrCreateDeviceId() }).then((response) => {
    saveAuthSession(response);
    return response;
  });
}

export function registerAccount(username: string, password: string): Promise<AuthResponse> {
  return postAuth('/auth/register', { username, password });
}

export function loginAsGuest(): void {
  sys.localStorage.removeItem(AUTH_TOKEN_KEY);
  sys.localStorage.removeItem(AUTH_EXPIRES_AT_KEY);
  sys.localStorage.setItem(AUTH_USER_KEY, JSON.stringify({
    id: GUEST_USER_ID,
    username: 'guest',
    displayName: '游客 10086',
    coins: 100000,
  }));
  setCurrentCoins(100000);
}

export function tryAutoLogin(): Promise<AuthResponse | null> {
  const authToken = sys.localStorage.getItem(AUTH_TOKEN_KEY) || '';
  if (!authToken) return Promise.resolve(null);
  return postAuth('/auth/auto-login', { deviceId: getOrCreateDeviceId(), authToken }).then((response) => {
    if (response.code === 'SUCCESS') {
      saveAuthSession(response);
      return response;
    }
    if (response.code === 'INVALID_SESSION') clearAuthSession();
    return response;
  });
}

export function logoutCurrentDevice(): void {
  const authToken = sys.localStorage.getItem(AUTH_TOKEN_KEY) || '';
  const deviceId = getOrCreateDeviceId();
  clearAuthSession();
  if (!authToken) return;
  void postAuth('/auth/logout', { deviceId, authToken }).catch(() => {
    // Local logout should succeed even when the server is temporarily unreachable.
  });
}

export function getCurrentUserDisplayName(): string {
  const saved = sys.localStorage.getItem(AUTH_USER_KEY);
  if (!saved) return '游客 10086';
  try {
    const user = JSON.parse(saved) as { username?: string; displayName?: string };
    return user.displayName || user.username || '游客 10086';
  } catch {
    return '游客 10086';
  }
}

export function getCurrentUserId(): number | null {
  const saved = sys.localStorage.getItem(AUTH_USER_KEY);
  if (!saved) return null;
  try {
    const user = JSON.parse(saved) as { id?: number };
    return typeof user.id === 'number' ? user.id : null;
  } catch {
    return null;
  }
}

export function clearAuthSession(): void {
  sys.localStorage.removeItem(AUTH_TOKEN_KEY);
  sys.localStorage.removeItem(AUTH_USER_KEY);
  sys.localStorage.removeItem(AUTH_EXPIRES_AT_KEY);
}

function saveAuthSession(response: AuthResponse): void {
  if (response.code !== 'SUCCESS') return;
  if (response.user) sys.localStorage.setItem(AUTH_USER_KEY, JSON.stringify(response.user));
  if (typeof response.user?.coins === 'number') setCurrentCoins(response.user.coins);
  if (response.authToken) sys.localStorage.setItem(AUTH_TOKEN_KEY, response.authToken);
  if (response.expiresAt) sys.localStorage.setItem(AUTH_EXPIRES_AT_KEY, response.expiresAt);
}

function getOrCreateDeviceId(): string {
  const saved = sys.localStorage.getItem(DEVICE_ID_KEY);
  if (saved) return saved;
  const deviceId = `fb-${Date.now().toString(36)}-${randomHex(16)}`;
  sys.localStorage.setItem(DEVICE_ID_KEY, deviceId);
  return deviceId;
}

function randomHex(byteLength: number): string {
  const bytes = new Uint8Array(byteLength);
  const globalCrypto = (globalThis as { crypto?: { getRandomValues?: (data: Uint8Array) => Uint8Array } }).crypto;
  if (globalCrypto?.getRandomValues) {
    globalCrypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < bytes.length; i += 1) bytes[i] = Math.floor(Math.random() * 256);
  }
  return Array.from(bytes, (value) => {
    const hex = value.toString(16);
    return hex.length === 1 ? `0${hex}` : hex;
  }).join('');
}

export function postAuth(path: string, body: Record<string, string>): Promise<AuthResponse> {
  return postJson<AuthResponse>(path, body);
}

export function postJson<T>(path: string, body: unknown, timeoutMs = 8000): Promise<T> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', `${AUTH_API_BASE_URL}${path}`, true);
    xhr.setRequestHeader('Content-Type', 'application/json');
    xhr.timeout = timeoutMs;
    xhr.onreadystatechange = () => {
      if (xhr.readyState !== 4) return;
      let parsed: T | null = null;
      try {
        parsed = xhr.responseText ? JSON.parse(xhr.responseText) as T : null;
      } catch {
        parsed = null;
      }
      if (xhr.status >= 200 && xhr.status < 300 && parsed) {
        resolve(parsed);
        return;
      }
      const message = parsed && typeof parsed === 'object' && 'message' in parsed ? String((parsed as { message?: unknown }).message || '') : '';
      reject(new Error(message || `服务器请求失败：${xhr.status}`));
    };
    xhr.onerror = () => reject(new Error('无法连接服务器'));
    xhr.ontimeout = () => reject(new Error('连接服务器超时'));
    xhr.send(JSON.stringify(body));
  });
}
