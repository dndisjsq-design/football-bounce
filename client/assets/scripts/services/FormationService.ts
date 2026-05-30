import { sys } from 'cc';
import { TeamSide } from '../MatchTypes';
import { BASIC_FORMATIONS, SHOP_FORMATIONS } from './FormationCatalog';
import type { FormationDefinition, FormationPoint } from './FormationCatalog';

export type { FormationDefinition, FormationPoint } from './FormationCatalog';

export const DEFAULT_FORMATION_ID = 'balanced-221';

const SELECTED_FORMATION_KEY = 'footballBounce.selectedFormation';

export function getFormationsByIds(ids: string[]): FormationDefinition[] {
  const seen = new Set<string>();
  const formations: FormationDefinition[] = [];
  for (const id of ids) {
    if (seen.has(id)) continue;
    const formation = getFormationById(id);
    if (!formation) continue;
    seen.add(id);
    formations.push(formation);
  }
  return formations;
}

export function getUnlockedFormations(): FormationDefinition[] {
  return BASIC_FORMATIONS;
}

export function getShopFormations(): FormationDefinition[] {
  return SHOP_FORMATIONS;
}

export function getSelectedFormation(): FormationDefinition {
  return getFormationById(sys.localStorage.getItem(SELECTED_FORMATION_KEY) || DEFAULT_FORMATION_ID) || BASIC_FORMATIONS[0];
}

export function setSelectedFormationId(id: string): FormationDefinition {
  const formation = getFormationById(id) || BASIC_FORMATIONS[0];
  sys.localStorage.setItem(SELECTED_FORMATION_KEY, formation.id);
  return formation;
}

export function getFormationById(id: string): FormationDefinition | null {
  return SHOP_FORMATIONS.find((formation) => formation.id === id) || null;
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
