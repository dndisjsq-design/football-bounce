import { sys } from 'cc';
import { setCurrentCoins } from './WalletService';

const DEV_BACKEND_HOST = '192.168.3.45';

export const AUTH_API_BASE_URL = resolveApiBaseUrl();

export type AuthCode = 'SUCCESS' | 'WRONG_PASSWORD' | 'USER_NOT_FOUND' | 'USERNAME_EXISTS' | 'INVALID_SESSION' | 'INVALID_REQUEST' | 'ERROR';

export interface AuthResponse {
  code: AuthCode;
  message: string;
  user?: UserSummary;
  userSummary?: UserSummary;
  authToken?: string;
  expiresAt?: string;
}

export interface UserSummary {
  id: number;
  username: string;
  displayName: string;
  avatarUrl?: string | null;
  coins?: number;
  singleTotalMatches?: number;
  singleWinMatches?: number;
  onlineTotalMatches?: number;
  onlineWinMatches?: number;
}

const DEVICE_ID_KEY = 'footballBounce.deviceId';
const AUTH_TOKEN_KEY = 'footballBounce.authToken';
const AUTH_USER_KEY = 'footballBounce.authUser';
const AUTH_EXPIRES_AT_KEY = 'footballBounce.authExpiresAt';
const GUEST_USER_ID = 1;
const GUEST_USERNAME = 'visiter';
const GUEST_DISPLAY_NAME = 'visiter';
const GUEST_DEFAULT_COINS = 100000;
const GUEST_SESSION_ID_KEY = 'footballBounce.guestSessionId';
const userSummaryListeners: Array<(summary: UserSummary) => void> = [];

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
  const previousGuestSessionId = getCurrentGuestSessionId();
  return postAuth('/auth/login', { username, password, deviceId: getOrCreateDeviceId() }).then((response) => {
    if (response.code === 'SUCCESS' && previousGuestSessionId) resetGuestAccount(previousGuestSessionId);
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
  applyUserSummary({
    id: GUEST_USER_ID,
    username: GUEST_USERNAME,
    displayName: GUEST_DISPLAY_NAME,
    coins: GUEST_DEFAULT_COINS,
    singleTotalMatches: 0,
    singleWinMatches: 0,
    onlineTotalMatches: 0,
    onlineWinMatches: 0,
  });
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
  const guestSessionId = getCurrentGuestSessionId();
  const guest = isCurrentUserGuest();
  const authToken = sys.localStorage.getItem(AUTH_TOKEN_KEY) || '';
  const deviceId = getOrCreateDeviceId();
  clearAuthSession();
  if (guest) resetGuestAccount(guestSessionId);
  if (!authToken) return;
  void postAuth('/auth/logout', { deviceId, authToken }).catch(() => {
    // Local logout should succeed even when the server is temporarily unreachable.
  });
}

export function startGuestLogin(): void {
  const previousGuestSessionId = getCurrentGuestSessionId();
  resetGuestAccount(previousGuestSessionId);
  loginAsGuest();
  sys.localStorage.setItem(GUEST_SESSION_ID_KEY, `guest-${Date.now().toString(36)}-${randomHex(12)}`);
}

export function getCurrentUserDisplayName(): string {
  const user = getCurrentUserSummary();
  return user.displayName || user.username || GUEST_DISPLAY_NAME;
}

export function getCurrentUserId(): number {
  const user = getCurrentUserSummary();
  return Number.isFinite(user.id) && user.id > 0 ? user.id : GUEST_USER_ID;
}

export function getCurrentUserSummary(): UserSummary {
  const saved = sys.localStorage.getItem(AUTH_USER_KEY);
  if (!saved) return guestSummary();
  try {
    const user = JSON.parse(saved) as Partial<UserSummary>;
    return normalizeUserSummary(user);
  } catch {
    return guestSummary();
  }
}

export function onUserSummaryChange(listener: (summary: UserSummary) => void): () => void {
  userSummaryListeners.push(listener);
  return () => {
    const index = userSummaryListeners.indexOf(listener);
    if (index >= 0) userSummaryListeners.splice(index, 1);
  };
}

export function applyUserSummary(summary: Partial<UserSummary> | null | undefined): void {
  if (!summary) return;
  const previous = getCurrentUserSummary();
  const next = normalizeUserSummary({ ...previous, ...summary });
  sys.localStorage.setItem(AUTH_USER_KEY, JSON.stringify(next));
  if (typeof next.coins === 'number') setCurrentCoins(next.coins);
  for (const listener of userSummaryListeners.slice()) listener(next);
}

export function applyApiUserSummary(response: unknown): void {
  if (!response || typeof response !== 'object') return;
  const maybe = response as { userSummary?: Partial<UserSummary>; user?: Partial<UserSummary> };
  if (maybe.userSummary) applyUserSummary(maybe.userSummary);
}

export function getCurrentGuestSessionId(): string {
  return sys.localStorage.getItem(GUEST_SESSION_ID_KEY) || '';
}

export function isCurrentUserGuest(): boolean {
  return getCurrentUserId() === 1 && !!getCurrentGuestSessionId();
}

export function clearAuthSession(): void {
  sys.localStorage.removeItem(AUTH_TOKEN_KEY);
  sys.localStorage.removeItem(AUTH_USER_KEY);
  sys.localStorage.removeItem(AUTH_EXPIRES_AT_KEY);
  sys.localStorage.removeItem(GUEST_SESSION_ID_KEY);
}

function saveAuthSession(response: AuthResponse): void {
  if (response.code !== 'SUCCESS') return;
  sys.localStorage.removeItem(GUEST_SESSION_ID_KEY);
  applyUserSummary(response.user || response.userSummary);
  if (response.authToken) sys.localStorage.setItem(AUTH_TOKEN_KEY, response.authToken);
  if (response.expiresAt) sys.localStorage.setItem(AUTH_EXPIRES_AT_KEY, response.expiresAt);
}

function normalizeUserSummary(user: Partial<UserSummary>): UserSummary {
  const id = typeof user.id === 'number' && Number.isFinite(user.id) && user.id > 0 ? user.id : GUEST_USER_ID;
  const username = typeof user.username === 'string' && user.username.trim() ? user.username.trim() : (id === GUEST_USER_ID ? GUEST_USERNAME : '');
  const displayName = typeof user.displayName === 'string' && user.displayName.trim() ? user.displayName.trim() : (username || GUEST_DISPLAY_NAME);
  const coins = typeof user.coins === 'number' && Number.isFinite(user.coins) ? Math.max(0, Math.floor(user.coins)) : undefined;
  const avatarUrl = typeof user.avatarUrl === 'string' ? user.avatarUrl : user.avatarUrl === null ? null : undefined;
  const singleTotalMatches = normalizeCounter(user.singleTotalMatches);
  const singleWinMatches = normalizeCounter(user.singleWinMatches);
  const onlineTotalMatches = normalizeCounter(user.onlineTotalMatches);
  const onlineWinMatches = normalizeCounter(user.onlineWinMatches);
  return { id, username, displayName, avatarUrl, coins, singleTotalMatches, singleWinMatches, onlineTotalMatches, onlineWinMatches };
}

function guestSummary(): UserSummary {
  return {
    id: GUEST_USER_ID,
    username: GUEST_USERNAME,
    displayName: GUEST_DISPLAY_NAME,
    coins: GUEST_DEFAULT_COINS,
    singleTotalMatches: 0,
    singleWinMatches: 0,
    onlineTotalMatches: 0,
    onlineWinMatches: 0,
  };
}

function normalizeCounter(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? Math.max(0, Math.floor(value)) : undefined;
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

function resetGuestAccount(guestSessionId: string): void {
  void postJson('/auth/guest/reset', {
    userId: 1,
    guestSessionId,
  }).catch(() => {
    // Guest reset is best-effort; the backend will still be authoritative after it reconnects.
  });
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
        applyApiUserSummary(parsed);
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
