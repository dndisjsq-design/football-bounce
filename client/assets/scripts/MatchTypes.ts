export type MatchMode = 'ai' | 'online';

export type TeamSide = 'home' | 'away';

export type BodyKind = 'player' | 'ball';

export interface DiscBodyState {
  id: string;
  kind: BodyKind;
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  mass: number;
  friction: number;
  restitution: number;
}

export interface PlayerDiskState extends DiscBodyState {
  kind: 'player';
  side: TeamSide;
}

export interface BallState extends DiscBodyState {
  id: 'ball';
  kind: 'ball';
}

export interface ScoreState {
  home: number;
  away: number;
}

export interface ShootCommand {
  commandId: string;
  matchId: string;
  actorId: string;
  side: TeamSide;
  angleRad: number;
  power: number;
  curveAngleRad?: number;
  curveDistance?: number;
  fieldWidth?: number;
  fieldHeight?: number;
  clientTick: number;
  noop?: boolean;
}

export interface MatchSnapshot {
  matchId: string;
  mode: MatchMode;
  fieldWidth: number;
  fieldHeight: number;
  tick: number;
  turn: TeamSide;
  score: ScoreState;
  players: PlayerDiskState[];
  ball: BallState;
}

export interface MatchClockState {
  serverTimeMillis: number;
  matchRemainingSeconds: number;
  turnRemainingSeconds: number;
  turn: TeamSide;
  controlEnabled?: boolean;
}

export type MatchEventType = 'shoot' | 'goal' | 'match-end';

export interface MatchEvent {
  eventId: string;
  matchId: string;
  type: MatchEventType;
  tick: number;
  side?: TeamSide;
  actorId?: string;
  matchSecond?: number;
  penalty?: boolean;
  ownGoal?: boolean;
  score?: ScoreState;
  clientTick: number;
}
