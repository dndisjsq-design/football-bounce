import { sys } from 'cc';

const COINS_KEY = 'footballBounce.wallet.coins';
const DEFAULT_COINS = 1280;

export function getCurrentCoins(): number {
  const saved = sys.localStorage.getItem(COINS_KEY);
  if (!saved) return DEFAULT_COINS;
  const value = Number.parseInt(saved, 10);
  return Number.isFinite(value) && value >= 0 ? value : DEFAULT_COINS;
}

export function setCurrentCoins(value: number): void {
  const next = Math.max(0, Math.floor(value));
  sys.localStorage.setItem(COINS_KEY, String(next));
}

