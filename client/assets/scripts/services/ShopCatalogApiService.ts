import { AUTH_API_BASE_URL } from './AuthService';
import type { RosterPlayer } from './PlayerRosterService';

export function fetchShopPlayers(): Promise<RosterPlayer[]> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    const url = `${AUTH_API_BASE_URL}/shop/players?_=${Date.now()}`;
    xhr.open('GET', url, true);
    xhr.setRequestHeader('Content-Type', 'application/json');
    xhr.timeout = 8000;
    xhr.onreadystatechange = () => {
      if (xhr.readyState !== 4) return;
      let parsed: RosterPlayer[] | null = null;
      try {
        parsed = xhr.responseText ? JSON.parse(xhr.responseText) as RosterPlayer[] : null;
      } catch {
        parsed = null;
      }
      if (xhr.status >= 200 && xhr.status < 300 && Array.isArray(parsed)) {
        resolve(parsed);
        return;
      }
      reject(new Error(`球员池接口请求失败：${xhr.status}`));
    };
    xhr.onerror = () => reject(new Error('无法连接球员池服务器'));
    xhr.ontimeout = () => reject(new Error('连接球员池服务器超时'));
    xhr.send();
  });
}
