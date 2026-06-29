import type { PlayerPhysicsProfile, RosterPlayer } from './PlayerRosterService';
import type { MatchSettlement } from './SingleMatchService';
import type { MatchSnapshot, ScoreState, ShootCommand } from '../MatchTypes';
import { getCurrentAuthToken, getCurrentClientInstanceId, getCurrentDeviceId, getCurrentGuestSessionId, getCurrentUserId, postJson } from './AuthService';

export interface OnlinePlayer {
  userId: number;
  username: string;
  displayName: string;
  avatarUrl?: string | null;
}

export interface OnlineMatchmakingResponse {
  ok: boolean;
  message: string;
  status: 'IDLE' | 'WAITING' | 'MATCHED' | 'CANCELLED' | 'EXPIRED' | 'ERROR';
  requestId: string;
  matchId?: string;
  selfSide?: 'home' | 'away';
  initialTurn?: 'home' | 'away';
  leftPlayer?: OnlinePlayer;
  rightPlayer?: OnlinePlayer;
  homePlayer?: OnlinePlayer;
  awayPlayer?: OnlinePlayer;
  homeFormationId?: string;
  awayFormationId?: string;
  homeLineup?: RosterPlayer[];
  awayLineup?: RosterPlayer[];
  matchedAtMillis?: number;
  snapshot?: MatchSnapshot | null;
}

export interface OnlineAction {
  seq: number;
  actorUserId: number;
  actorRequestId: string;
  actorNetworkSide: 'home' | 'away';
  command: ShootCommand;
}

export interface OnlineClock {
  serverTimeMillis: number;
  matchRemainingSeconds: number;
  turnRemainingSeconds: number;
  paused?: boolean;
  pauseReason?: string;
}

export interface OnlineActionResponse {
  ok: boolean;
  message: string;
  actions: OnlineAction[];
  nextSeq: number;
  clock?: OnlineClock | null;
}

export interface OnlineClockResponse {
  ok: boolean;
  message: string;
  clock?: OnlineClock | null;
}

export interface OnlineSkillTrigger {
  actorId: string;
  skillId: string;
  name: string;
}

export interface OnlineReadyResponse {
  ok: boolean;
  message: string;
  started: boolean;
  clock?: OnlineClock | null;
  snapshot?: MatchSnapshot | null;
}

export interface OnlineTurnResponse {
  ok: boolean;
  message: string;
  canControl: boolean;
  clock?: OnlineClock | null;
  homePhysics?: PlayerPhysicsProfile[];
  awayPhysics?: PlayerPhysicsProfile[];
  skillTriggers?: OnlineSkillTrigger[];
}

export interface OnlineScoreResponse {
  ok: boolean;
  message: string;
  score?: ScoreState | null;
}

export interface OnlineFinishCheckResponse {
  ok: boolean;
  message: string;
  canEnd: boolean;
  settlement?: MatchSettlement | null;
}

export interface OnlineSettlementResponse {
  ok: boolean;
  message: string;
  settlement?: MatchSettlement | null;
}

export interface MatchFieldSize {
  fieldWidth: number;
  fieldHeight: number;
}

let selectedOnlineMatch: OnlineMatchmakingResponse | null = null;

export function createMatchmakingRequestId(): string {
  return `mm-${Date.now().toString(36)}-${Math.floor(Math.random() * 0xffffffff).toString(16)}`;
}

export function joinOnlineMatch(requestId: string): Promise<OnlineMatchmakingResponse> {
  return postJson<OnlineMatchmakingResponse>('/online-match/join', {
    userId: getCurrentUserId(),
    requestId,
    guestSessionId: getCurrentGuestSessionId(),
    deviceId: getCurrentDeviceId(),
    authToken: getCurrentAuthToken(),
    clientInstanceId: getCurrentClientInstanceId(),
  });
}

export function fetchOnlineMatchStatus(requestId: string): Promise<OnlineMatchmakingResponse> {
  return postJson<OnlineMatchmakingResponse>('/online-match/status', {
    userId: getCurrentUserId(),
    requestId,
    deviceId: getCurrentDeviceId(),
    authToken: getCurrentAuthToken(),
    clientInstanceId: getCurrentClientInstanceId(),
  });
}

export function cancelOnlineMatch(requestId: string): Promise<OnlineMatchmakingResponse> {
  return postJson<OnlineMatchmakingResponse>('/online-match/cancel', {
    userId: getCurrentUserId(),
    requestId,
    deviceId: getCurrentDeviceId(),
    authToken: getCurrentAuthToken(),
    clientInstanceId: getCurrentClientInstanceId(),
  });
}

export function submitOnlineShoot(matchId: string, requestId: string, command: ShootCommand): Promise<OnlineActionResponse> {
  return postJson<OnlineActionResponse>('/online-match/shoot', {
    userId: getCurrentUserId(),
    requestId,
    matchId,
    commandId: command.commandId,
    actorId: command.actorId,
    side: command.side,
    angleRad: command.angleRad,
    power: command.power,
    curveAngleRad: command.curveAngleRad || 0,
    curveDistance: command.curveDistance || 0,
    noop: command.noop === true,
    fieldWidth: command.fieldWidth,
    fieldHeight: command.fieldHeight,
    clientTick: command.clientTick,
    deviceId: getCurrentDeviceId(),
    authToken: getCurrentAuthToken(),
    clientInstanceId: getCurrentClientInstanceId(),
  });
}

export function fetchOnlineClock(matchId: string, requestId: string): Promise<OnlineClockResponse> {
  return postJson<OnlineClockResponse>('/online-match/clock', {
    userId: getCurrentUserId(),
    requestId,
    matchId,
    deviceId: getCurrentDeviceId(),
    authToken: getCurrentAuthToken(),
    clientInstanceId: getCurrentClientInstanceId(),
  }, 7000);
}

export function submitOnlineReady(matchId: string, requestId: string, fieldSize: MatchFieldSize | null = null): Promise<OnlineReadyResponse> {
  return postJson<OnlineReadyResponse>('/online-match/ready', {
    userId: getCurrentUserId(),
    requestId,
    matchId,
    fieldWidth: fieldSize?.fieldWidth,
    fieldHeight: fieldSize?.fieldHeight,
    deviceId: getCurrentDeviceId(),
    authToken: getCurrentAuthToken(),
    clientInstanceId: getCurrentClientInstanceId(),
  }, 12000);
}

export function requestOnlineTurn(matchId: string, requestId: string, fieldSize: MatchFieldSize | null = null): Promise<OnlineTurnResponse> {
  return postJson<OnlineTurnResponse>('/online-match/turn-request', {
    userId: getCurrentUserId(),
    requestId,
    matchId,
    fieldWidth: fieldSize?.fieldWidth,
    fieldHeight: fieldSize?.fieldHeight,
    deviceId: getCurrentDeviceId(),
    authToken: getCurrentAuthToken(),
    clientInstanceId: getCurrentClientInstanceId(),
  }, 8000);
}

export function fetchOnlineOpponentAction(matchId: string, requestId: string, sinceSeq: number, fieldSize: MatchFieldSize | null = null): Promise<OnlineActionResponse> {
  return postJson<OnlineActionResponse>('/online-match/opponent-action', {
    userId: getCurrentUserId(),
    requestId,
    matchId,
    sinceSeq,
    fieldWidth: fieldSize?.fieldWidth,
    fieldHeight: fieldSize?.fieldHeight,
    deviceId: getCurrentDeviceId(),
    authToken: getCurrentAuthToken(),
    clientInstanceId: getCurrentClientInstanceId(),
  }, 3000);
}

export function fetchOnlineScore(matchId: string, requestId: string): Promise<OnlineScoreResponse> {
  return postJson<OnlineScoreResponse>('/online-match/score', {
    userId: getCurrentUserId(),
    requestId,
    matchId,
    deviceId: getCurrentDeviceId(),
    authToken: getCurrentAuthToken(),
    clientInstanceId: getCurrentClientInstanceId(),
  }, 3000);
}

export function checkOnlineFinish(matchId: string, requestId: string): Promise<OnlineFinishCheckResponse> {
  return postJson<OnlineFinishCheckResponse>('/online-match/finish-check', {
    userId: getCurrentUserId(),
    requestId,
    matchId,
    guestSessionId: getCurrentGuestSessionId(),
    deviceId: getCurrentDeviceId(),
    authToken: getCurrentAuthToken(),
    clientInstanceId: getCurrentClientInstanceId(),
  }, 5000);
}

export function fetchOnlineSettlement(matchId: string, requestId: string): Promise<OnlineSettlementResponse> {
  return postJson<OnlineSettlementResponse>('/online-match/settlement', {
    userId: getCurrentUserId(),
    requestId,
    matchId,
    guestSessionId: getCurrentGuestSessionId(),
    deviceId: getCurrentDeviceId(),
    authToken: getCurrentAuthToken(),
    clientInstanceId: getCurrentClientInstanceId(),
  });
}

export function setSelectedOnlineMatch(match: OnlineMatchmakingResponse | null): void {
  selectedOnlineMatch = match;
}

export function consumeSelectedOnlineMatch(): OnlineMatchmakingResponse | null {
  const match = selectedOnlineMatch;
  selectedOnlineMatch = null;
  return match;
}
