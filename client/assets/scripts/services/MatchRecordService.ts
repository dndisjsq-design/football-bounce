import { ShootCommand } from '../MatchTypes';
import { RosterPlayer } from './PlayerRosterService';
import { getCurrentGuestSessionId, getCurrentUserId, postJson } from './AuthService';
import type { MatchSettlement } from './SingleMatchService';

export interface MatchRecordSummary {
  matchId: string;
  matchTime: string;
  matchType: string;
  durationSeconds: number;
  userId: number;
  username: string;
  userSide: 'home' | 'away';
  opponentUserId?: number;
  opponentUsername: string;
  resultScore: string;
  result: string;
  homeFormationId: string;
  awayFormationId: string;
  homeLineupPlayerIds: string;
  awayLineupPlayerIds: string;
}

export interface MatchActionRecord {
  actionIndex: number;
  actorUserId: number;
  actorSide: 'home' | 'away' | 'server';
  actorId: string;
  actionType: string;
  matchSecond: number;
  commandJson: string;
  validResult?: boolean;
  validationMessage: string;
  createdAt: string;
}

export interface MatchReplayData {
  ok: boolean;
  message: string;
  record?: MatchRecordSummary;
  mirrored?: boolean;
  homeLineup: RosterPlayer[];
  awayLineup: RosterPlayer[];
  actions: MatchActionRecord[];
}

export interface MatchSettlementData {
  ok: boolean;
  message: string;
  settlement?: MatchSettlement | null;
}

let selectedReplayMatchId = '';

export function fetchRecentMatchRecords(limit = 20, offset = 0): Promise<{ ok: boolean; message: string; records: MatchRecordSummary[] }> {
  return postJson('/match-records/recent', {
    userId: getCurrentUserId(),
    guestSessionId: getCurrentGuestSessionId(),
    limit,
    offset,
  });
}

export function fetchMatchReplay(matchId: string): Promise<MatchReplayData> {
  return postJson('/match-records/replay', {
    matchId,
    userId: getCurrentUserId(),
    guestSessionId: getCurrentGuestSessionId(),
  });
}

export function fetchMatchReplaySettlement(matchId: string): Promise<MatchSettlementData> {
  return postJson('/match-records/settlement', {
    matchId,
    userId: getCurrentUserId(),
    guestSessionId: getCurrentGuestSessionId(),
  });
}

export function setSelectedReplayMatchId(matchId: string): void {
  selectedReplayMatchId = matchId;
}

export function consumeSelectedReplayMatchId(): string {
  const matchId = selectedReplayMatchId;
  selectedReplayMatchId = '';
  return matchId;
}

export function parseShootCommand(record: MatchActionRecord): ShootCommand | null {
  if (!record.commandJson) return null;
  try {
    return JSON.parse(record.commandJson) as ShootCommand;
  } catch {
    return null;
  }
}
