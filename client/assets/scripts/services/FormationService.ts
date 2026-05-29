import { sys } from 'cc';
import { TeamSide } from '../MatchTypes';

export interface FormationPoint {
  x: number;
  y: number;
}

export interface FormationDefinition {
  id: string;
  code: string;
  name: string;
  description: string;
  points: FormationPoint[];
}

export const DEFAULT_FORMATION_ID = 'balanced-221';

const SELECTED_FORMATION_KEY = 'footballBounce.selectedFormation';

export const BASIC_FORMATIONS: FormationDefinition[] = [
  {
    id: 'balanced-221',
    code: '2-2-1',
    name: '均衡推进',
    description: '后场稳定，前点压迫',
    points: [
      { x: -0.18, y: -0.34 },
      { x: 0.18, y: -0.34 },
      { x: -0.16, y: -0.22 },
      { x: 0.16, y: -0.22 },
      { x: 0, y: -0.08 },
    ],
  },
  {
    id: 'midfield-131',
    code: '1-3-1',
    name: '中场覆盖',
    description: '三中路封堵传球线',
    points: [
      { x: 0, y: -0.35 },
      { x: -0.22, y: -0.22 },
      { x: 0, y: -0.22 },
      { x: 0.22, y: -0.22 },
      { x: 0, y: -0.08 },
    ],
  },
  {
    id: 'defense-311',
    code: '3-1-1',
    name: '后场铁壁',
    description: '三人守后区，反击直上',
    points: [
      { x: -0.23, y: -0.35 },
      { x: 0, y: -0.35 },
      { x: 0.23, y: -0.35 },
      { x: 0, y: -0.21 },
      { x: 0, y: -0.08 },
    ],
  },
  {
    id: 'attack-122',
    code: '1-2-2',
    name: '双前锋',
    description: '前场双点抢二次球',
    points: [
      { x: 0, y: -0.35 },
      { x: -0.18, y: -0.23 },
      { x: 0.18, y: -0.23 },
      { x: -0.16, y: -0.08 },
      { x: 0.16, y: -0.08 },
    ],
  },
  {
    id: 'diamond-212',
    code: '2-1-2',
    name: '菱形展开',
    description: '中轴接应，边路前插',
    points: [
      { x: -0.19, y: -0.35 },
      { x: 0.19, y: -0.35 },
      { x: 0, y: -0.22 },
      { x: -0.18, y: -0.08 },
      { x: 0.18, y: -0.08 },
    ],
  },
];

export const SHOP_EXTRA_FORMATIONS: FormationDefinition[] = [
  formation('wall-300', '3-0-0', '三塔守门', '三人压低防线', [[-0.24, -0.34], [0, -0.34], [0.24, -0.34]]),
  formation('blade-201', '2-0-1', '尖刀反击', '双后卫保护单箭头', [[-0.2, -0.34], [0.2, -0.34], [0, -0.1]]),
  formation('bridge-111', '1-1-1', '中轴桥', '三点直线推进', [[0, -0.35], [0, -0.22], [0, -0.08]]),
  formation('wing-210', '2-1-0', '双翼护腰', '边路封锁中路接应', [[-0.24, -0.33], [0.24, -0.33], [0, -0.2]]),
  formation('spear-120', '1-2-0', '双枪上压', '一后两前抢先手', [[0, -0.34], [-0.2, -0.12], [0.2, -0.12]]),
  formation('square-220', '2-2-0', '方阵推进', '四点稳步推进', [[-0.2, -0.34], [0.2, -0.34], [-0.2, -0.16], [0.2, -0.16]]),
  formation('shield-301', '3-0-1', '重盾长矛', '三后卫加单前锋', [[-0.24, -0.35], [0, -0.35], [0.24, -0.35], [0, -0.09]]),
  formation('diamond-121', '1-2-1', '小菱形', '中路弹射角度多', [[0, -0.35], [-0.2, -0.22], [0.2, -0.22], [0, -0.08]]),
  formation('lane-112', '1-1-2', '前压双点', '前场双人压迫', [[0, -0.35], [0, -0.22], [-0.18, -0.08], [0.18, -0.08]]),
  formation('fan-130', '1-3-0', '扇形封堵', '横向覆盖球路', [[0, -0.34], [-0.24, -0.15], [0, -0.15], [0.24, -0.15]]),
  formation('lock-310', '3-1-0', '三锁一腰', '后场厚度优先', [[-0.24, -0.35], [0, -0.35], [0.24, -0.35], [0, -0.2]]),
  formation('curve-211', '2-1-1', '弧线穿插', '中路做墙接前点', [[-0.2, -0.35], [0.2, -0.35], [0, -0.21], [0, -0.08]]),
  formation('cross-202', '2-0-2', '十字前插', '双后双前拉空间', [[-0.2, -0.34], [0.2, -0.34], [-0.2, -0.08], [0.2, -0.08]]),
  formation('arrow-221', '2-2-1', '箭头推进', '标准五人均衡', [[-0.2, -0.35], [0.2, -0.35], [-0.16, -0.22], [0.16, -0.22], [0, -0.08]]),
  formation('storm-131', '1-3-1', '风暴中场', '三中路控节奏', [[0, -0.35], [-0.24, -0.22], [0, -0.22], [0.24, -0.22], [0, -0.08]]),
  formation('fort-311', '3-1-1', '堡垒反击', '后场稳定反弹', [[-0.24, -0.35], [0, -0.35], [0.24, -0.35], [0, -0.2], [0, -0.08]]),
  formation('twin-122', '1-2-2', '双锋压迫', '前场二点冲击', [[0, -0.35], [-0.2, -0.23], [0.2, -0.23], [-0.18, -0.08], [0.18, -0.08]]),
  formation('wave-212', '2-1-2', '海浪推进', '后中前三层', [[-0.2, -0.35], [0.2, -0.35], [0, -0.22], [-0.2, -0.08], [0.2, -0.08]]),
  formation('hook-113', '1-1-3', '三叉钩', '极限前场压制', [[0, -0.35], [0, -0.22], [-0.24, -0.08], [0, -0.08], [0.24, -0.08]]),
  formation('net-401', '4-0-1', '四门栓', '四人低位封门', [[-0.28, -0.35], [-0.09, -0.35], [0.09, -0.35], [0.28, -0.35], [0, -0.08]]),
];

export const SHOP_FORMATIONS: FormationDefinition[] = [...BASIC_FORMATIONS, ...SHOP_EXTRA_FORMATIONS];

export function getUnlockedFormations(): FormationDefinition[] {
  return BASIC_FORMATIONS;
}

export function getShopFormations(): FormationDefinition[] {
  return SHOP_FORMATIONS;
}

export function getSelectedFormation(): FormationDefinition {
  return getFormationById(sys.localStorage.getItem(SELECTED_FORMATION_KEY) || DEFAULT_FORMATION_ID);
}

export function setSelectedFormationId(id: string): FormationDefinition {
  const formation = getFormationById(id);
  sys.localStorage.setItem(SELECTED_FORMATION_KEY, formation.id);
  return formation;
}

export function getFormationById(id: string): FormationDefinition {
  return SHOP_FORMATIONS.find((formation) => formation.id === id) || BASIC_FORMATIONS[0];
}

export function getMatchFormationPoints(side: TeamSide, fieldWidth: number, fieldHeight: number): FormationPoint[] {
  const formation = getSelectedFormation();
  const ySign = side === 'home' ? 1 : -1;
  return formation.points.map((point) => ({
    x: point.x * fieldWidth,
    y: point.y * fieldHeight * ySign,
  }));
}

export function getPreviewFormationPoints(formation: FormationDefinition, width: number, height: number): FormationPoint[] {
  const minY = -0.36;
  const maxY = -0.07;
  return formation.points.map((point) => ({
    x: point.x * width,
    y: (((point.y - minY) / (maxY - minY)) - 0.5) * height,
  }));
}

function formation(id: string, code: string, name: string, description: string, points: Array<[number, number]>): FormationDefinition {
  return {
    id,
    code,
    name,
    description,
    points: points.map(([x, y]) => ({ x, y })),
  };
}
