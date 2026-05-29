import { sys } from 'cc';

export type PlayerRarity = 'blue' | 'purple' | 'orange' | 'red';

export interface RosterPlayer {
  id: string;
  name: string;
  score: number;
  rarity: PlayerRarity;
  avatarSeed: number;
}

const LINEUP_KEY = 'footballBounce.lineupPlayers';
export const RARITY_ORDER: Record<PlayerRarity, number> = {
  red: 0,
  orange: 1,
  purple: 2,
  blue: 3,
};

const RED_NAMES = ['罗哥', '西西', '神兽', '大圣', '战神', '天王', '金靴', '雷帝', '影锋', '猎鹰', '无双', '锋皇', '闪王', '暴风', '龙脚', '赤焰', '银狼', '铁王', '灵猫', '圣盾'];
const ORANGE_NAMES = ['哈仔', '姆宝', '内少', '魔笛', '丁丁', '凯皇', '本泽', '苏牙', '贝尔', '坎爷', '范墙', '皮哥', '小白', '托神', '飞翼', '狂刀', '幻步', '火炮', '钢腰', '龙门'];
const PURPLE_NAMES = ['魔爷', '风子', '飞狐', '猎手', '弧线', '快马', '影卫', '游侠', '铁肺', '蓝狮', '小鹰', '短炮', '灵翼', '石墙', '疾电', '铁闸', '远射', '稳哥', '边王', '夜刀'];
const BLUE_NAMES = ['铁壁', '快腿', '老姜', '门将', '小炮', '游翼', '小虎', '阿飞', '阿远', '冷箭', '稳仔', '黑塔', '白塔', '小罗盘', '强哥', '小新', '长腿', '草帽', '铜墙', '水手'];

export const BASIC_PLAYERS: RosterPlayer[] = [
  ...makePlayers('red', RED_NAMES, 98, 79),
  ...makePlayers('orange', ORANGE_NAMES, 93, 59),
  ...makePlayers('purple', PURPLE_NAMES, 88, 39),
  ...makePlayers('blue', BLUE_NAMES, 82, 19),
];

export function getOwnedPlayers(): RosterPlayer[] {
  return [...BASIC_PLAYERS].sort((a, b) => RARITY_ORDER[a.rarity] - RARITY_ORDER[b.rarity] || b.score - a.score);
}

export function getPlayersByRarity(rarities: PlayerRarity[]): RosterPlayer[] {
  return getOwnedPlayers().filter((player) => rarities.indexOf(player.rarity) >= 0);
}

export function getPlayerById(id: string): RosterPlayer | null {
  return BASIC_PLAYERS.find((player) => player.id === id) || null;
}

export function getLineupPlayerIds(): string[] {
  const saved = sys.localStorage.getItem(LINEUP_KEY);
  if (saved) {
    try {
      const parsed = JSON.parse(saved) as string[];
      if (Array.isArray(parsed) && parsed.length >= 5) {
        const lineup = parsed.slice(0, 5);
        if (lineup.every((id) => !!getPlayerById(id))) return lineup;
      }
    } catch {
      // Ignore malformed local roster data and rebuild the default lineup.
    }
  }
  const fallback = getOwnedPlayers().slice(0, 5).map((player) => player.id);
  saveLineupPlayerIds(fallback);
  return fallback;
}

export function saveLineupPlayerIds(ids: string[]): void {
  sys.localStorage.setItem(LINEUP_KEY, JSON.stringify(ids.slice(0, 5)));
}

export function assignLineupPlayer(slotIndex: number, playerId: string): string[] {
  const lineup = getLineupPlayerIds();
  const existingIndex = lineup.indexOf(playerId);
  if (existingIndex >= 0 && existingIndex !== slotIndex) {
    lineup[existingIndex] = lineup[slotIndex];
  }
  lineup[slotIndex] = playerId;
  saveLineupPlayerIds(lineup);
  return lineup;
}

export function swapLineupPlayers(fromIndex: number, toIndex: number): string[] {
  const lineup = getLineupPlayerIds();
  if (fromIndex < 0 || fromIndex >= lineup.length || toIndex < 0 || toIndex >= lineup.length || fromIndex === toIndex) {
    return lineup;
  }
  const current = lineup[fromIndex];
  lineup[fromIndex] = lineup[toIndex];
  lineup[toIndex] = current;
  saveLineupPlayerIds(lineup);
  return lineup;
}

export function getLineupPlayers(): Array<RosterPlayer | null> {
  return getLineupPlayerIds().map((id) => getPlayerById(id));
}

function makePlayers(rarity: PlayerRarity, names: string[], topScore: number, avatarOffset: number): RosterPlayer[] {
  return names.map((name, index) => ({
    id: `${rarity}-${index + 1}`,
    name,
    score: topScore - Math.floor(index / 2),
    rarity,
    avatarSeed: avatarOffset + index,
  }));
}
