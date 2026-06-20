import type { RosterPlayer } from './PlayerRosterService';
import type { MatchSettlement } from './SingleMatchService';
import type { MatchEvent, MatchSnapshot, ScoreState, ShootCommand } from '../MatchTypes';
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
  turnNetworkSide: 'home' | 'away';
  controlEnabled?: boolean;
}

export interface OnlineActionResponse {
  ok: boolean;
  message: string;
  actions: OnlineAction[];
  nextSeq: number;
  clock?: OnlineClock | null;
  winnerNetworkSide?: 'home' | 'away' | null;
  loserNetworkSide?: 'home' | 'away' | null;
  finalScore?: ScoreState | null;
}

export interface OnlineResultResponse {
  ok: boolean;
  valid: boolean;
  confirmed?: boolean;
  message: string;
  clock?: OnlineClock | null;
  winnerNetworkSide?: 'home' | 'away' | null;
  loserNetworkSide?: 'home' | 'away' | null;
  finalScore?: ScoreState | null;
}

export interface OnlineClockResponse {
  ok: boolean;
  message: string;
  clock?: OnlineClock | null;
  winnerNetworkSide?: 'home' | 'away' | null;
  loserNetworkSide?: 'home' | 'away' | null;
  finalScore?: ScoreState | null;
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
    fieldWidth: command.fieldWidth,
    fieldHeight: command.fieldHeight,
    clientTick: command.clientTick,
    deviceId: getCurrentDeviceId(),
    authToken: getCurrentAuthToken(),
    clientInstanceId: getCurrentClientInstanceId(),
  });
}

export function fetchOnlineActions(matchId: string, requestId: string, sinceSeq: number, fieldSize: MatchFieldSize | null = null): Promise<OnlineActionResponse> {
  return postJson<OnlineActionResponse>('/online-match/actions', {
    userId: getCurrentUserId(),
    requestId,
    matchId,
    sinceSeq,
    fieldWidth: fieldSize?.fieldWidth,
    fieldHeight: fieldSize?.fieldHeight,
    deviceId: getCurrentDeviceId(),
    authToken: getCurrentAuthToken(),
    clientInstanceId: getCurrentClientInstanceId(),
  }, 6000);
}

export function fetchOnlineClock(matchId: string, requestId: string, fieldSize: MatchFieldSize | null = null): Promise<OnlineClockResponse> {
  return postJson<OnlineClockResponse>('/online-match/clock', {
    userId: getCurrentUserId(),
    requestId,
    matchId,
    fieldWidth: fieldSize?.fieldWidth,
    fieldHeight: fieldSize?.fieldHeight,
    deviceId: getCurrentDeviceId(),
    authToken: getCurrentAuthToken(),
    clientInstanceId: getCurrentClientInstanceId(),
  }, 3000);
}

export function submitOnlineResult(matchId: string, requestId: string, commandId: string, snapshot: MatchSnapshot | null, event: MatchEvent | null = null, fieldSize: MatchFieldSize | null = null): Promise<OnlineResultResponse> {
  return postJson<OnlineResultResponse>('/online-match/result', {
    userId: getCurrentUserId(),
    requestId,
    matchId,
    commandId,
    snapshot,
    fieldWidth: snapshot?.fieldWidth ?? fieldSize?.fieldWidth,
    fieldHeight: snapshot?.fieldHeight ?? fieldSize?.fieldHeight,
    eventId: event?.eventId,
    eventType: event?.type,
    eventTick: event?.tick,
    eventSide: event?.side,
    eventActorId: event?.actorId,
    eventMatchSecond: event?.matchSecond,
    eventPenalty: event?.penalty,
    eventOwnGoal: event?.ownGoal,
    eventScore: event?.score,
    deviceId: getCurrentDeviceId(),
    authToken: getCurrentAuthToken(),
    clientInstanceId: getCurrentClientInstanceId(),
  });
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
