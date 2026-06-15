import { AUTH_API_BASE_URL } from './AuthService';
import type { PlayerRarity, RosterPlayer } from './PlayerRosterService';

export interface ShopPlayerDetail extends RosterPlayer {
  price: number;
  intro: string;
  bodyType: string;
  nationality: string;
  club: string;
  height: number;
  weight: number;
  age: number;
  skills: string;
  power: number;
  accuracy: number;
  curve: number;
  stamina: number;
  bodyStrength: number;
}

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

export function fetchShopPlayerDetail(playerId: string): Promise<ShopPlayerDetail> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    const url = `${AUTH_API_BASE_URL}/shop/players/${encodeURIComponent(playerId)}?_=${Date.now()}`;
    xhr.open('GET', url, true);
    xhr.setRequestHeader('Content-Type', 'application/json');
    xhr.timeout = 8000;
    xhr.onreadystatechange = () => {
      if (xhr.readyState !== 4) return;
      let parsed: Partial<ShopPlayerDetail> | null = null;
      try {
        parsed = xhr.responseText ? JSON.parse(xhr.responseText) as Partial<ShopPlayerDetail> : null;
      } catch {
        parsed = null;
      }
      if (xhr.status >= 200 && xhr.status < 300 && isShopPlayerDetail(parsed)) {
        resolve(parsed);
        return;
      }
      reject(new Error(`球员详情接口请求失败：${xhr.status}`));
    };
    xhr.onerror = () => reject(new Error('无法连接球员详情服务器'));
    xhr.ontimeout = () => reject(new Error('连接球员详情服务器超时'));
    xhr.send();
  });
}

function isShopPlayerDetail(value: Partial<ShopPlayerDetail> | null): value is ShopPlayerDetail {
  if (!value) return false;
  return typeof value.id === 'string'
    && typeof value.name === 'string'
    && typeof value.score === 'number'
    && isPlayerRarity(value.rarity)
    && typeof value.avatarSeed === 'number'
    && typeof value.price === 'number'
    && typeof value.intro === 'string'
    && typeof value.bodyType === 'string'
    && typeof value.nationality === 'string'
    && typeof value.club === 'string'
    && typeof value.height === 'number'
    && typeof value.weight === 'number'
    && typeof value.age === 'number'
    && typeof value.skills === 'string'
    && typeof value.power === 'number'
    && typeof value.accuracy === 'number'
    && typeof value.curve === 'number'
    && typeof value.stamina === 'number'
    && typeof value.bodyStrength === 'number';
}

function isPlayerRarity(value: unknown): value is PlayerRarity {
  return value === 'blue' || value === 'purple' || value === 'orange' || value === 'red';
}
