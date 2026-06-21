export type PlayerRarity = 'blue' | 'purple' | 'orange' | 'red';

export interface PlayerPhysicsProfile {
  actorId?: string;
  maxDragForceDistance: number;
  shotPowerScale: number;
  accuracyLineScale: number;
  maxCurveAngleRad: number;
}

export interface RosterPlayer {
  id: string;
  name: string;
  score: number;
  rarity: PlayerRarity;
  avatarSeed: number;
  physics?: PlayerPhysicsProfile;
}

export const RARITY_ORDER: Record<PlayerRarity, number> = {
  red: 0,
  orange: 1,
  purple: 2,
  blue: 3,
};

export function getOwnedPlayers(): RosterPlayer[] {
  return [];
}

export function getPlayersByRarity(_rarities: PlayerRarity[]): RosterPlayer[] {
  return [];
}

export function getPlayerById(_id: string): RosterPlayer | null {
  return null;
}

export function getLineupPlayerIds(): string[] {
  return [];
}

export function saveLineupPlayerIds(_ids: string[]): void {
  // Lineups are owned by the backend. This local shim only keeps older callers compiling.
}

export function assignLineupPlayer(_slotIndex: number, _playerId: string): string[] {
  return [];
}

export function swapLineupPlayers(_fromIndex: number, _toIndex: number): string[] {
  return [];
}

export function getLineupPlayers(): Array<RosterPlayer | null> {
  return [];
}
