import { MatchEvent, MatchSnapshot, ShootCommand } from '../MatchTypes';
import { PlayerPhysicsProfile, RosterPlayer } from './PlayerRosterService';
import { getCurrentGuestSessionId, getCurrentUserId, postJson, type UserSummary } from './AuthService';

export interface SingleMatchStartResponse {
  ok: boolean;
  message: string;
  matchId: string;
  userId: number;
  username: string;
  homeFormationId: string;
  awayFormationId: string;
  homeLineup: RosterPlayer[];
  awayLineup: RosterPlayer[];
  snapshot: MatchSnapshot;
}

export interface SingleMatchShootResponse {
  ok: boolean;
  message: string;
  expectedSnapshot?: MatchSnapshot;
}

export interface SingleMatchAiShootResponse {
  ok: boolean;
  message: string;
  command?: ShootCommand;
  expectedSnapshot?: MatchSnapshot;
}

export interface SingleMatchAiKeeperResponse {
  ok: boolean;
  message: string;
  direction: -1 | 0 | 1;
}

export interface SingleMatchSnapshotResponse {
  ok: boolean;
  valid: boolean;
  message: string;
  expectedSnapshot?: MatchSnapshot;
  homePhysics?: PlayerPhysicsProfile[];
  awayPhysics?: PlayerPhysicsProfile[];
}

export interface MatchSettlementGoal {
  matchSecond: number;
  penalty: boolean;
  userId: number;
  username: string;
  side: 'home' | 'away';
  actorId: string;
  playerId: string;
  playerName: string;
  ownGoal: boolean;
  order: number;
}

export interface MatchSettlementBestPlayer {
  userId: number;
  username: string;
  side: 'home' | 'away';
  actorId: string;
  playerId: string;
  playerName: string;
  goals: number;
}

export interface MatchSettlement {
  matchId: string;
  result: string;
  scoreText: string;
  winnerSide: 'home' | 'away' | 'draw';
  bestPlayer?: MatchSettlementBestPlayer;
  goals: MatchSettlementGoal[];
}

export function startSingleMatch(fieldWidth: number, fieldHeight: number): Promise<SingleMatchStartResponse> {
  return postJson<SingleMatchStartResponse>('/single-match/start', {
    userId: getCurrentUserId(),
    clientSessionId: getCurrentGuestSessionId(),
    fieldWidth,
    fieldHeight,
  });
}

export function submitSingleMatchShoot(matchId: string, command: ShootCommand): Promise<SingleMatchShootResponse> {
  return postJson<SingleMatchShootResponse>('/single-match/shoot', {
    matchId,
    command: {
      ...command,
      matchId,
    },
  });
}

export function requestSingleMatchAiShoot(
  matchId: string,
  options: { phase?: string; actorId?: string; actorX?: number; actorY?: number } = {},
): Promise<SingleMatchAiShootResponse> {
  return postJson<SingleMatchAiShootResponse>('/single-match/ai-shoot', { matchId, ...options });
}

export function requestSingleMatchAiKeeper(matchId: string): Promise<SingleMatchAiKeeperResponse> {
  return postJson<SingleMatchAiKeeperResponse>('/single-match/ai-keeper', { matchId });
}

export function validateSingleMatchSnapshot(matchId: string, snapshot: MatchSnapshot, phase = 'settled'): Promise<SingleMatchSnapshotResponse> {
  return postJson<SingleMatchSnapshotResponse>('/single-match/snapshot', {
    matchId,
    phase,
    snapshot: {
      ...snapshot,
      matchId,
    },
  });
}

export function sendSingleMatchEvent(matchId: string, event: MatchEvent): Promise<{ ok: boolean; message: string }> {
  return postJson<{ ok: boolean; message: string }>('/single-match/event', {
    ...event,
    matchId,
  });
}

export function finishSingleMatch(matchId: string, durationSeconds: number, score: { home: number; away: number }, result: string, resultScore: string): Promise<{ ok: boolean; message: string; settlement?: MatchSettlement; userSummary?: UserSummary }> {
  return postJson<{ ok: boolean; message: string; settlement?: MatchSettlement; userSummary?: UserSummary }>('/single-match/finish', {
    matchId,
    durationSeconds,
    score,
    result,
    resultScore,
  });
}

export function abandonSingleMatch(matchId: string): Promise<{ ok: boolean; message: string }> {
  return postJson<{ ok: boolean; message: string }>('/single-match/abandon', {
    matchId,
    userId: getCurrentUserId(),
  });
}
