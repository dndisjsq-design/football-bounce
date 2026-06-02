import { ShootCommand } from '../MatchTypes';
import { RosterPlayer } from './PlayerRosterService';
import { getCurrentGuestSessionId, getCurrentUserId, postJson } from './AuthService';

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
  commandJson: string;
  validResult?: boolean;
  validationMessage: string;
  createdAt: string;
}

export interface MatchReplayData {
  ok: boolean;
  message: string;
  record?: MatchRecordSummary;
  homeLineup: RosterPlayer[];
  awayLineup: RosterPlayer[];
  actions: MatchActionRecord[];
}

let selectedReplayMatchId = '';

export function fetchRecentMatchRecords(limit = 20): Promise<{ ok: boolean; message: string; records: MatchRecordSummary[] }> {
  return postJson('/match-records/recent', {
    userId: getCurrentUserId(),
    guestSessionId: getCurrentGuestSessionId(),
    limit,
  });
}

export function fetchMatchReplay(matchId: string): Promise<MatchReplayData> {
  return postJson('/match-records/replay', {
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
