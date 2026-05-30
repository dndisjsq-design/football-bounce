import { AUTH_API_BASE_URL, getCurrentUserId } from './AuthService';
import type { RosterPlayer } from './PlayerRosterService';

export interface LineupState {
  userId: number;
  selectedFormationId: string;
  formationIds: string[];
  lineupPlayerIds: string[];
  players: RosterPlayer[];
}

interface LineupSaveBody {
  userId: number;
  selectedFormationId: string;
  lineupPlayerIds: string[];
}

export function fetchLineupState(): Promise<LineupState> {
  const userId = getCurrentUserId();
  if (!userId) return Promise.reject(new Error('当前未登录，无法读取后端阵容'));
  return requestJson<LineupState>('GET', `/lineup/state?userId=${encodeURIComponent(String(userId))}&_=${Date.now()}`);
}

export function saveLineupState(selectedFormationId: string, lineupPlayerIds: string[]): Promise<LineupState> {
  const userId = getCurrentUserId();
  if (!userId) return Promise.reject(new Error('当前未登录，无法保存后端阵容'));
  return requestJson<LineupState>('POST', '/lineup/state', {
    userId,
    selectedFormationId,
    lineupPlayerIds: lineupPlayerIds.slice(0, 5),
  });
}

function requestJson<T>(method: 'GET' | 'POST', path: string, body?: LineupSaveBody): Promise<T> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    const url = `${AUTH_API_BASE_URL}${path}`;
    console.log(`[LineupApi] ${method} ${url}`);
    xhr.open(method, url, true);
    xhr.setRequestHeader('Content-Type', 'application/json');
    xhr.timeout = 8000;
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
      reject(new Error(`阵容接口请求失败：${xhr.status}`));
    };
    xhr.onerror = () => reject(new Error('无法连接阵容服务器'));
    xhr.ontimeout = () => reject(new Error('连接阵容服务器超时'));
    xhr.send(body ? JSON.stringify(body) : null);
  });
}
