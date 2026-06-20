import { Color, director, EventTouch, Graphics, Label, Node, Sprite, Touch, UITransform, Vec2, Vec3 } from 'cc';
import type { MatchSettlementPreview, MatchTransport } from '../MatchTransport';
import { BallState, DiscBodyState, MatchEvent, MatchMode, MatchSnapshot, PlayerDiskState, ScoreState, ShootCommand, TeamSide } from '../MatchTypes';
import { getCurrentUserDisplayName } from '../services/AuthService';
import { getMatchFormationPoints, getMatchFormationPointsById } from '../services/FormationService';
import { RosterPlayer, getLineupPlayers } from '../services/PlayerRosterService';
import {
  abandonSingleMatch,
  finishSingleMatch,
  requestSingleMatchAiKeeper,
  requestSingleMatchAiShoot,
  sendSingleMatchEvent,
  startSingleMatch,
  submitSingleMatchShoot,
  validateSingleMatchSnapshot,
  MatchSettlement,
} from '../services/SingleMatchService';
import { MatchActionRecord, MatchReplayData, fetchMatchReplay, fetchMatchReplaySettlement, parseShootCommand } from '../services/MatchRecordService';
import type { OnlineMatchmakingResponse } from '../services/OnlineMatchService';
import { fetchOnlineSettlement } from '../services/OnlineMatchService';
import { findNode, rgba } from '../utils/CocosNodeUtils';

const MATCH_ID = 'editable-scene-preview';
const PLAYER_RADIUS = 20;
const BALL_RADIUS = 13;
const MAX_DRAG_DISTANCE = 154;
const PLAYER_SHOT_SPEED = 890;
const PLAYER_MASS = 3.2;
const BALL_MASS = 0.75;
const PLAYER_FRICTION = 1.65;
const BALL_FRICTION = 1.18;
const PLAYER_STOP_SPEED = 5;
const BALL_STOP_SPEED = 7;
const PLAYER_LOW_SPEED_FRICTION_START = 170;
const BALL_LOW_SPEED_FRICTION_START = 135;
const PLAYER_TAIL_FRICTION = 5.4;
const BALL_TAIL_FRICTION = 4.2;
const PLAYER_RESTITUTION = 0.66;
const BALL_RESTITUTION = 0.94;
const WALL_INSET = 0;
const GOAL_HALF_WIDTH = 63;
const GOAL_DEPTH = 30;
const SOLVER_ITERATIONS = 5;
const AIM_LAYER_COUNT = 10;
const AIM_LAYER_LONG_WIDTH = (MAX_DRAG_DISTANCE - PLAYER_RADIUS - 0.5) / AIM_LAYER_COUNT;
const AIM_LAYER_RATIO = 0.68;
const MAX_CURVE_ANGLE = 0.92;
const CURVE_INPUT_DEADZONE = 8;
const CURVE_MIN_DISTANCE = 34;
const CORNER_CUSHION_RADIUS = 36;
const CORNER_CUSHION_RESTITUTION = 0.92;
const PENALTY_HALF_WIDTH = GOAL_HALF_WIDTH + 34;
const PENALTY_DEPTH = 86;
const MATCH_SECONDS = 180;
const TURN_SECONDS = 15;
const WIN_SCORE = 3;
const GOAL_CELEBRATION_SECONDS = 3;
const FIXED_PHYSICS_DT = 1 / 120;
const PENALTY_ATTACK_DELAY = 3;
const PENALTY_SHOOTOUT_ROUNDS = 5;
const PENALTY_KEEPER_MOVE = 42;
const PENALTY_INTRO_SECONDS = 6;
const PENALTY_OFFSCREEN = 9999;

type CelebrationKind = 'goal' | 'matchEnd' | 'penaltyIntro';

interface PenaltyMark {
  side: TeamSide;
  made: boolean;
}

interface CurveMotion {
  remainingAngle: number;
  remainingDistance: number;
}

export class EditableMatch {
  private canvas: Node;
  private mode: MatchMode;
  private transport: MatchTransport;
  private players: PlayerDiskState[] = [];
  private ball: BallState = makeBall(0, 0);
  private turn: TeamSide = 'home';
  private score = { home: 0, away: 0 };
  private dragActor: PlayerDiskState | null = null;
  private dragStart: Vec2 | null = null;
  private dragNow: Vec2 | null = null;
  private powerTouchId: number | null = null;
  private curveTouchId: number | null = null;
  private curveTouchStart: Vec2 | null = null;
  private curveTouchPoint: Vec2 | null = null;
  private curveBaseOffset = 0;
  private curveCurrentOffset = 0;
  private activeCurves = new Map<string, CurveMotion>();
  private aiCooldown = 0.8;
  private tickIndex = 0;
  private ballSpinDeg = 0;
  private fieldGraphics: Graphics | null = null;
  private aimGraphics: Graphics | null = null;
  private hudGraphics: Graphics | null = null;
  private appliedCommandIds = new Set<string>();
  private matchRemaining = MATCH_SECONDS;
  private turnRemaining = TURN_SECONDS;
  private matchEnded = false;
  private physicsAccumulator = 0;
  private goalCelebrationRemaining = 0;
  private goalCelebrationElapsed = 0;
  private celebrationKind: CelebrationKind = 'goal';
  private goalScorer: TeamSide | null = null;
  private pendingKickoffTurn: TeamSide = 'home';
  private victorySide: TeamSide | null = null;
  private lastShotActorId = '';
  private penaltyShootout = false;
  private penaltySuddenDeath = false;
  private penaltyShotIndex = 0;
  private penaltyTurn: TeamSide = 'home';
  private penaltyAttackerReady = false;
  private penaltyAttackDelay = 0;
  private penaltyShotTaken = false;
  private penaltyKeeperMoved = false;
  private penaltyKeeperPendingDirection: -1 | 0 | 1 = 0;
  private penaltyKeeperSwipeStart: Vec2 | null = null;
  private penaltyScore = { home: 0, away: 0 };
  private penaltyMarks: PenaltyMark[] = [];
  private currentPenaltyKickerId = '';
  private currentPenaltyKeeperId = '';
  private pendingPenaltyIntro = false;
  private activeMatchId = MATCH_ID;
  private singleMatchServerReady = false;
  private singleMatchStarting = false;
  private singleMatchValidationPending = false;
  private singleMatchValidationInFlight = false;
  private singleMatchAiRequestInFlight = false;
  private singleMatchAiKeeperInFlight = false;
  private singleMatchFinishSent = false;
  private singleMatchHomeFormationId = '';
  private singleMatchAwayFormationId = '';
  private singleMatchHomeLineup: Array<RosterPlayer | null> = [];
  private singleMatchAwayLineup: Array<RosterPlayer | null> = [];
  private singleMatchSettlement: MatchSettlement | null = null;
  private replayMatchId = '';
  private replayMode = false;
  private replayData: MatchReplayData | null = null;
  private replayActions: MatchActionRecord[] = [];
  private replayActionIndex = 0;
  private replayElapsedSeconds = 0;
  private replayTurnStartedSecond = 0;
  private replayFinished = false;
  private replayMirrorX = false;
  private replaySettlementRequested = false;
  private onlineMatch: OnlineMatchmakingResponse | null = null;
  private onlineInitialTurn: TeamSide = 'home';
  private onlineControlEnabled = false;
  private pendingOnlineFinishSide: TeamSide | null = null;
  private pendingOnlineFinalScore: ScoreState | null = null;
  private onlineSettlementInFlight = false;
  private onlineSettlementNextRetryAt = 0;
  private onlineInitialSnapshot: MatchSnapshot | null = null;

  constructor(canvas: Node, mode: MatchMode, transport: MatchTransport, replayMatchId = '', onlineMatch: OnlineMatchmakingResponse | null = null) {
    this.canvas = canvas;
    this.mode = mode;
    this.transport = transport;
    this.replayMatchId = replayMatchId;
    this.onlineMatch = onlineMatch;
  }

  start(): void {
    this.removeLegacyBottomScoreboard();
    const title = findNode(this.canvas, 'TextMode')?.getComponent(Label);
    if (title) title.string = `${this.score.home} : ${this.score.away}`;
    if (this.replayMatchId) {
      this.hideRuntimeMatchObjects();
      void this.startReplayFromServer();
      return;
    }
    if (this.mode === 'online') this.applyOnlineMatchData();
    this.transport.onRemoteShoot((command) => this.applyShootWithFastSettlement(command));
    this.transport.onSnapshot((snapshot) => this.applySnapshot(snapshot));
    this.transport.onClock((clock) => this.applyServerClock(clock.matchRemainingSeconds, clock.turnRemainingSeconds, clock.turn, clock.controlEnabled === true));
    this.transport.onServerForfeit((message, finalScore) => this.forceServerForfeit(message, finalScore || null));
    this.transport.onServerVictory((message, finalScore) => this.forceServerVictory(message, finalScore || null));
    this.transport.setFieldSizeProvider(() => ({ fieldWidth: this.fieldWidth, fieldHeight: this.fieldHeight }));
    this.prepareMatchHud();
    if (this.mode === 'ai') {
      this.hideRuntimeMatchObjects();
      void this.startSinglePlayerFromServer();
      return;
    }
    this.resetObjects(this.onlineInitialLocalTurn());
    if (this.mode === 'online' && this.onlineInitialSnapshot) {
      this.applySnapshot(this.onlineInitialSnapshot);
    }
    this.prepareMatchRenderer();
    this.attachPlayerInput();
    this.syncNodes();
    void this.transport.connect(this.activeMatchId).catch(() => undefined);
  }

  tick(dt: number): void {
    if (this.replayMode) {
      this.updateGoalCelebration(dt);
      this.updateReplay(dt);
      this.step(dt);
      this.tickIndex += 1;
      this.syncNodes();
      return;
    }
    this.updateGoalCelebration(dt);
    this.updateClocks(dt);
    this.updatePenaltyShootout(dt);
    this.step(dt);
    if (!this.matchEnded && this.goalCelebrationRemaining <= 0 && this.mode === 'ai' && this.turn === 'away' && this.isSettled()) {
      this.aiCooldown -= dt;
      if (this.aiCooldown <= 0) {
        this.aiCooldown = 0.8;
        this.fireAi();
      }
    }
    this.tickIndex += 1;
    this.flushSingleMatchSettlementValidation();
    this.flushSingleMatchFinish();
    this.flushOnlineMatchSettlement();
    if (this.mode === 'online' && this.pendingOnlineFinishSide && this.goalCelebrationRemaining <= 0 && !this.matchEnded && this.isSettled()) {
      this.startOnlineFinishAnimation();
    }
    if (this.mode !== 'online' && !this.matchEnded && this.goalCelebrationRemaining <= 0 && this.tickIndex % 12 === 0) {
      void this.transport.submitSnapshot(this.createSnapshot()).catch(() => undefined);
    }
    this.syncNodes();
  }

  private async startSinglePlayerFromServer(): Promise<void> {
    if (this.singleMatchStarting) return;
    this.singleMatchStarting = true;
    try {
      const response = await startSingleMatch(this.fieldWidth, this.fieldHeight);
      if (!response.ok || !response.matchId) throw new Error(response.message || '单人比赛创建失败');
      this.activeMatchId = response.matchId;
      this.singleMatchServerReady = true;
      this.singleMatchHomeFormationId = response.homeFormationId;
      this.singleMatchAwayFormationId = response.awayFormationId || response.homeFormationId;
      this.singleMatchHomeLineup = normalizeLineup(response.homeLineup);
      this.singleMatchAwayLineup = normalizeLineup(response.awayLineup || response.homeLineup);
      this.resetObjects(response.snapshot?.turn || 'home');
      if (response.snapshot) this.applySnapshot(response.snapshot);
      this.prepareMatchRenderer();
      this.attachPlayerInput();
      this.syncNodes();
    } catch {
      this.singleMatchServerReady = false;
      this.hideRuntimeMatchObjects();
      const title = findNode(this.canvas, 'TextMode')?.getComponent(Label);
      if (title) title.string = '后端未连接';
    } finally {
      this.singleMatchStarting = false;
    }
  }

  private async startReplayFromServer(): Promise<void> {
    try {
      const response = await fetchMatchReplay(this.replayMatchId);
      if (!response.ok || !response.record) throw new Error(response.message || '回放数据读取失败');
      this.replayMode = true;
      this.replayData = response;
      this.replayActions = response.actions.filter((action) => action.validResult !== false);
      this.replayActionIndex = 0;
      this.replayElapsedSeconds = 0;
      this.replayTurnStartedSecond = 0;
      this.replayFinished = false;
      this.replayMirrorX = response.mirrored === true;
      this.replaySettlementRequested = false;
      this.activeMatchId = response.record.matchId;
      this.singleMatchSettlement = null;
      this.singleMatchHomeFormationId = response.record.homeFormationId;
      this.singleMatchAwayFormationId = response.record.awayFormationId || response.record.homeFormationId;
      this.singleMatchHomeLineup = normalizeLineup(response.homeLineup);
      this.singleMatchAwayLineup = normalizeLineup(response.awayLineup || response.homeLineup);
      this.score = { home: 0, away: 0 };
      this.matchRemaining = MATCH_SECONDS;
      this.turnRemaining = TURN_SECONDS;
      this.matchEnded = false;
      this.victorySide = null;
      this.resetObjects(this.firstReplayTurn(response.actions));
      this.prepareMatchHud();
      this.setReplayHudLabels(response);
      this.prepareMatchRenderer();
      this.syncNodes();
    } catch (error) {
      const title = findNode(this.canvas, 'TextMode')?.getComponent(Label);
      if (title) title.string = error instanceof Error ? error.message : '回放数据读取失败';
      this.hideRuntimeMatchObjects();
    }
  }

  private resetObjects(startingTurn: TeamSide = 'home'): void {
    const fw = this.fieldWidth;
    const fh = this.fieldHeight;
    this.turn = startingTurn;
    this.dragActor = null;
    this.dragStart = null;
    this.dragNow = null;
    this.powerTouchId = null;
    this.curveTouchId = null;
    this.curveTouchStart = null;
    this.curveTouchPoint = null;
    this.curveBaseOffset = 0;
    this.curveCurrentOffset = 0;
    this.activeCurves.clear();
    this.physicsAccumulator = 0;
    this.ball = makeBall(0, 0);
    this.ballSpinDeg = 0;
    const homePoints = this.usesServerLineup() && this.singleMatchHomeFormationId
      ? getMatchFormationPointsById(this.singleMatchHomeFormationId, 'home', fw, fh)
      : getMatchFormationPoints('home', fw, fh);
    const awayPoints = this.usesServerLineup() && this.singleMatchAwayFormationId
      ? getMatchFormationPointsById(this.singleMatchAwayFormationId, 'away', fw, fh)
      : getMatchFormationPoints('away', fw, fh);
    const shouldMirrorReplayX = this.replayMode && this.replayMirrorX;
    const displayHomePoints = shouldMirrorReplayX ? homePoints.map((point) => ({ ...point, x: -point.x })) : homePoints;
    const displayAwayPoints = shouldMirrorReplayX ? awayPoints.map((point) => ({ ...point, x: -point.x })) : awayPoints;
    this.players = [
      ...displayHomePoints.map((point, index) => makePlayer(`home-${index + 1}`, 'home', point.x, point.y)),
      ...displayAwayPoints.map((point, index) => makePlayer(`away-${index + 1}`, 'away', point.x, point.y)),
    ];
    this.resolveAllCollisions();
  }

  private setReplayHudLabels(response: MatchReplayData): void {
    const hud = this.ensureHudNode();
    const home = findNode(hud, 'HudHomeName')?.getComponent(Label);
    const away = findNode(hud, 'HudAwayName')?.getComponent(Label);
    const mode = findNode(hud, 'HudModeName')?.getComponent(Label);
    const title = findNode(this.canvas, 'TextMode')?.getComponent(Label);
    if (home) home.string = this.matchDisplayName();
    if (away) away.string = response.record?.opponentUsername || '人机';
    if (mode) mode.string = '比赛回放';
    if (title) title.string = response.record?.resultScore || '0 : 0';
  }

  private updateReplay(dt: number): void {
    if (!this.replayMode || this.replayFinished || this.matchEnded) return;
    this.advanceReplayClock(dt);
    if (this.goalCelebrationRemaining > 0) return;
    if (!this.isSettled()) return;
    const action = this.peekNextReplayAction();
    if (!action) {
      if (this.replayElapsedSeconds >= this.replayEndSecond()) this.finishReplay();
      return;
    }
    if (this.replayElapsedSeconds + 0.001 < this.actionReplaySecond(action)) {
      return;
    }
    this.replayActionIndex += 1;
    this.applyReplayAction(action);
  }

  private advanceReplayClock(dt: number): void {
    this.replayElapsedSeconds = Math.min(MATCH_SECONDS, this.replayElapsedSeconds + Math.max(0, dt));
    this.matchRemaining = Math.max(0, MATCH_SECONDS - this.replayElapsedSeconds);
    if (this.isSettled()) {
      this.turnRemaining = Math.max(0, TURN_SECONDS - (this.replayElapsedSeconds - this.replayTurnStartedSecond));
    }
  }

  private peekNextReplayAction(): MatchActionRecord | null {
    while (this.replayActionIndex < this.replayActions.length) {
      const action = this.replayActions[this.replayActionIndex];
      if (this.isReplayAction(action)) {
        return action;
      }
      this.replayActionIndex += 1;
    }
    return null;
  }

  private isReplayAction(action: MatchActionRecord): boolean {
    return action.actionType === 'shoot'
      || action.actionType === 'action'
      || action.actionType === 'online-shoot'
      || action.actionType === 'ai-shoot'
      || action.actionType === 'ai-penalty'
      || action.actionType === 'end'
      || action.actionType === 'finish';
  }

  private actionReplaySecond(action: MatchActionRecord): number {
    const value = Number(action.matchSecond);
    return Number.isFinite(value) ? clamp(value, 0, MATCH_SECONDS) : 0;
  }

  private replayEndSecond(): number {
    const recordDuration = this.replayData?.record?.durationSeconds || 0;
    if (recordDuration > 0) return Math.min(MATCH_SECONDS, recordDuration);
    const last = this.replayActions.length > 0 ? this.replayActions[this.replayActions.length - 1] : null;
    return last ? Math.min(MATCH_SECONDS, this.actionReplaySecond(last) + 2) : 0;
  }

  private firstReplayTurn(actions: MatchActionRecord[]): TeamSide {
    const firstShoot = actions.find((action) => action.validResult !== false
      && (action.actionType === 'shoot' || action.actionType === 'action' || action.actionType === 'online-shoot' || action.actionType === 'ai-shoot' || action.actionType === 'ai-penalty')
      && (action.actorSide === 'home' || action.actorSide === 'away'));
    return firstShoot?.actorSide === 'away' ? 'away' : 'home';
  }

  private applyReplayAction(action: MatchActionRecord): void {
    if (action.actionType === 'shoot' || action.actionType === 'action' || action.actionType === 'online-shoot' || action.actionType === 'ai-shoot' || action.actionType === 'ai-penalty') {
      const command = parseShootCommand(action);
      if (!command) return;
      this.turn = command.side;
      if (this.applyShoot({ ...command, matchId: this.activeMatchId })) {
        this.replayTurnStartedSecond = this.actionReplaySecond(action);
      }
      return;
    }
    if (action.actionType === 'end' || action.actionType === 'finish') {
      this.finishReplay();
    }
  }

  private applyReplayGoal(action: MatchActionRecord): void {
    let payload: { side?: TeamSide; score?: { home: number; away: number } } = {};
    try {
      payload = action.commandJson ? JSON.parse(action.commandJson) as { side?: TeamSide; score?: { home: number; away: number } } : {};
    } catch {
      payload = {};
    }
    const side = payload.side === 'away' ? 'away' : 'home';
    if (payload.score) {
      this.score = { ...payload.score };
    } else {
      this.score[side] += 1;
    }
    this.stopBallInGoal();
    this.goalScorer = side;
    this.pendingKickoffTurn = side === 'home' ? 'away' : 'home';
    this.goalCelebrationRemaining = Math.min(1.4, GOAL_CELEBRATION_SECONDS);
    this.goalCelebrationElapsed = 0;
    this.celebrationKind = 'goal';
    this.replayTurnStartedSecond = this.actionReplaySecond(action);
  }

  private finishReplay(): void {
    if (this.matchEnded) return;
    this.replayFinished = true;
    const score = this.singleMatchSettlement?.scoreText ? parseReplayScoreText(this.singleMatchSettlement.scoreText) : this.score;
    this.score = score;
    const winner = this.singleMatchSettlement?.winnerSide || (score.home === score.away ? 'draw' : score.home > score.away ? 'home' : 'away');
    this.victorySide = winner === 'away' ? 'away' : 'home';
    this.matchEnded = true;
    this.turnRemaining = 0;
    this.clearVictoryRuntimeNodes();
    const mode = findNode(this.ensureHudNode(), 'HudModeName')?.getComponent(Label);
    if (mode) mode.string = '回放结束';
    this.requestReplaySettlement();
  }

  private requestReplaySettlement(): void {
    if (!this.replayMode || this.replaySettlementRequested || !this.activeMatchId) return;
    this.replaySettlementRequested = true;
    void fetchMatchReplaySettlement(this.activeMatchId)
      .then((response) => {
        if (response.ok && response.settlement) {
          this.singleMatchSettlement = response.settlement;
          this.score = parseReplayScoreText(response.settlement.scoreText);
          const winner = response.settlement.winnerSide;
          this.victorySide = winner === 'away' ? 'away' : 'home';
          this.clearVictoryRuntimeNodes();
        }
      })
      .catch(() => undefined);
  }

  private prepareMatchHud(): void {
    const hud = this.ensureHudNode();
    hud.removeAllChildren();
    const width = this.canvas.getComponent(UITransform)?.contentSize.width || 390;
    const pitchTop = this.pitchTopY();
    this.createHudLabel(hud, 'HudHomeName', this.matchDisplayName(), -width / 2 + 76, pitchTop + 23, 14, rgba(255, 255, 255), Label.HorizontalAlign.LEFT);
    this.createHudLabel(hud, 'HudAwayName', this.opponentDisplayName(), width / 2 - 76, pitchTop + 23, 14, rgba(255, 255, 255), Label.HorizontalAlign.RIGHT);
    this.createHudLabel(hud, 'HudModeName', this.mode === 'ai' ? '单机人机' : '真人联机', width / 2 - 40, pitchTop + 56, 13, rgba(255, 255, 255), Label.HorizontalAlign.RIGHT)
      .node.getComponent(UITransform)?.setContentSize(92, 22);
    this.createHudLabel(hud, 'HudMatchTime', formatClock(this.matchRemaining), 0, pitchTop + 25, 22, rgba(255, 246, 178), Label.HorizontalAlign.CENTER)
      .node.getComponent(UITransform)?.setContentSize(82, 28);
    this.createHudLabel(hud, 'HudGoalLeft', '进', 240, 0, 64, rgba(255, 246, 220), Label.HorizontalAlign.CENTER).node.active = false;
    this.createHudLabel(hud, 'HudGoalRight', '球', 300, 0, 64, rgba(255, 246, 220), Label.HorizontalAlign.CENTER).node.active = false;
    this.createHudLabel(hud, 'HudPenaltyIntro', '', 0, 36, 24, rgba(255, 246, 220), Label.HorizontalAlign.CENTER).node.active = false;
    this.createHudLabel(hud, 'HudPenaltyCount', '', 0, -8, 92, rgba(255, 246, 178), Label.HorizontalAlign.CENTER).node.active = false;
    this.createHudLabel(hud, 'HudVictoryTitle', '', 0, 42, 34, rgba(255, 246, 178), Label.HorizontalAlign.CENTER).node.active = false;
    this.createHudLabel(hud, 'HudVictoryScore', '', 0, -4, 24, rgba(255, 255, 255), Label.HorizontalAlign.CENTER).node.active = false;
    this.hudGraphics = hud.getComponent(Graphics) || hud.addComponent(Graphics);
    this.drawMatchHud();
  }

  private prepareMatchRenderer(): void {
    this.hideLegacyPitchHints();
    this.layoutGoalWalls();
    this.drawPitchLines();
    const homeLineup = this.matchLineup('home');
    const awayLineup = this.matchLineup('away');
    for (const p of this.players) {
      const node = findNode(this.canvas, `Player_${p.id}`);
      const lineup = p.side === 'home' ? homeLineup : awayLineup;
      const lineupPlayer = lineup[playerSlotIndex(p.id)] || null;
      if (node) {
        node.active = true;
        drawDiscNode(
          node,
          p.radius,
          matchTeamDiscColor(p.side),
          rgba(255, 255, 255, 215),
          '',
          p.side,
          lineupPlayer,
        );
      }
    }
    const ballNode = findNode(this.canvas, 'Ball');
    if (ballNode) {
      ballNode.active = true;
      drawBallNode(ballNode, this.ball.radius);
    }
  }

  private hideLegacyPitchHints(): void {
    ['MidLine', 'CenterCircleHint', 'TopBox', 'BottomBox', 'TopGoal', 'BottomGoal', 'TopWallLeft', 'TopWallRight', 'BottomWallLeft', 'BottomWallRight'].forEach((name) => {
      const sprite = findNode(this.canvas, name)?.getComponent(Sprite);
      if (sprite) sprite.enabled = false;
    });
  }

  private drawPitchLines(): void {
    const pitch = this.pitchNode;
    if (!pitch) return;
    const g = this.getFieldGraphics();
    if (!g) return;
    const w = this.fieldWidth;
    const h = this.fieldHeight;
    const left = -w / 2 + WALL_INSET;
    const right = w / 2 - WALL_INSET;
    const outerTop = h / 2;
    const outerBottom = -h / 2;
    const top = this.goalLineY;
    const bottom = -this.goalLineY;
    const lineColor = rgba(236, 252, 232, 214);

    g.clear();
    this.drawGrassStripes(g, -w / 2, bottom, w, top - bottom);
    this.drawGrassStripes(g, -GOAL_HALF_WIDTH, top, GOAL_HALF_WIDTH * 2, GOAL_DEPTH);
    this.drawGrassStripes(g, -GOAL_HALF_WIDTH, bottom - GOAL_DEPTH, GOAL_HALF_WIDTH * 2, GOAL_DEPTH);
    this.drawGoalSideBlocks(g, left, right, top, bottom, outerTop, outerBottom);
    this.drawCornerCushions(g, left, right, top, bottom);

    this.strokeLine(g, left, 0, right, 0, rgba(236, 252, 232, 220), 2);
    g.strokeColor = rgba(228, 248, 229, 215);
    g.lineWidth = 2;
    g.circle(0, 0, 56);
    g.stroke();
    g.fillColor = rgba(228, 248, 229, 220);
    g.circle(0, 0, 3);
    g.fill();

    this.drawPenaltyAreas(g, top, bottom, lineColor);
    this.drawFenceAndGoals(g, left, right, top, bottom, outerTop, outerBottom);
  }

  private attachPlayerInput(): void {
    for (const player of this.players) {
      const node = findNode(this.canvas, `Player_${player.id}`);
      if (!node || player.side !== 'home') continue;
      const playerId = player.id;
      node.on(Node.EventType.TOUCH_START, (event: EventTouch) => {
        if (this.dragActor) {
          this.updateDragTouches(event);
          return;
        }
        this.beginPenaltyKeeperSwipe(event);
        const current = this.players.find((p) => p.id === playerId);
        if (this.matchEnded || this.goalCelebrationRemaining > 0 || !current || current.side !== 'home' || this.turn !== 'home' || !this.isSettled()) return;
        if (this.mode === 'online' && !this.onlineControlEnabled) return;
        if (this.penaltyShootout && (!this.penaltyAttackerReady || current.id !== this.currentPenaltyKickerId)) return;
        this.dragActor = current;
        this.dragStart = new Vec2(current.x, current.y);
        this.powerTouchId = event.touch?.getID() ?? null;
        this.curveTouchId = null;
        this.curveTouchStart = null;
        this.curveTouchPoint = null;
        this.curveBaseOffset = 0;
        this.curveCurrentOffset = 0;
        this.updateDragTouches(event);
      });
      node.on(Node.EventType.TOUCH_MOVE, (event: EventTouch) => {
        this.updateDragTouches(event);
      });
      node.on(Node.EventType.TOUCH_END, (event: EventTouch) => this.handleDragTouchEnd(event));
      node.on(Node.EventType.TOUCH_CANCEL, (event: EventTouch) => this.handleDragTouchEnd(event));
    }
    const pitch = this.pitchNode;
    pitch?.on(Node.EventType.TOUCH_START, (event: EventTouch) => {
      this.beginPenaltyKeeperSwipe(event);
      this.updateDragTouches(event);
    });
    pitch?.on(Node.EventType.TOUCH_MOVE, (event: EventTouch) => {
      this.handlePenaltyKeeperSwipe(event);
      this.updateDragTouches(event);
    });
    pitch?.on(Node.EventType.TOUCH_END, (event: EventTouch) => this.handleDragTouchEnd(event));
    pitch?.on(Node.EventType.TOUCH_CANCEL, (event: EventTouch) => this.handleDragTouchEnd(event));
  }

  private updateDragTouches(event: EventTouch): void {
    if (!this.dragActor || this.powerTouchId === null) return;
    const allTouches = event.getAllTouches();
    const changedTouches = event.getTouches();
    const powerTouch = allTouches.find((touch) => touch.getID() === this.powerTouchId)
      || changedTouches.find((touch) => touch.getID() === this.powerTouchId);
    if (powerTouch) this.dragNow = this.touchToPitchPoint(powerTouch);

    const curveTouches = allTouches.filter((touch) => touch.getID() !== this.powerTouchId);
    if (curveTouches.length === 0) {
      this.curveTouchId = null;
      this.curveTouchStart = null;
      this.curveTouchPoint = null;
      this.curveBaseOffset = this.curveCurrentOffset;
      return;
    }
    const curveTouch = curveTouches.find((touch) => touch.getID() === this.curveTouchId) || curveTouches[0];
    const curvePoint = this.touchToPitchPoint(curveTouch);
    if (this.curveTouchId !== curveTouch.getID()) {
      this.curveTouchId = curveTouch.getID();
      this.curveTouchStart = new Vec2(curvePoint.x, curvePoint.y);
      this.curveBaseOffset = this.curveCurrentOffset;
    }
    this.curveTouchPoint = curvePoint;
    this.updateCurveOffsetFromTouch();
  }

  private handlePenaltyKeeperSwipe(event: EventTouch): void {
    if (!this.penaltyShootout || this.penaltyKeeperMoved || this.matchEnded || this.goalCelebrationRemaining > 0) return;
    const defendingSide = this.penaltyTurn === 'home' ? 'away' : 'home';
    if (defendingSide !== 'home') return;
    const touch = event.getTouches()[0] || event.touch;
    if (!touch) return;
    const point = this.touchToPitchPoint(touch);
    if (!this.penaltyKeeperSwipeStart) {
      this.penaltyKeeperSwipeStart = point;
      return;
    }
    const dx = point.x - this.penaltyKeeperSwipeStart.x;
    if (Math.abs(dx) < 18) return;
    this.penaltyKeeperPendingDirection = dx > 0 ? 1 : -1;
  }

  private beginPenaltyKeeperSwipe(event: EventTouch): void {
    if (!this.penaltyShootout || this.penaltyKeeperMoved || this.matchEnded || this.goalCelebrationRemaining > 0) return;
    const defendingSide = this.penaltyTurn === 'home' ? 'away' : 'home';
    if (defendingSide !== 'home') return;
    const touch = event.getTouches()[0] || event.touch;
    if (touch) this.penaltyKeeperSwipeStart = this.touchToPitchPoint(touch);
  }

  private handleDragTouchEnd(event: EventTouch): void {
    if (!this.dragActor) return;
    const endedIds = event.getTouches().map((touch) => touch.getID());
    if (this.powerTouchId !== null && endedIds.indexOf(this.powerTouchId) >= 0) {
      this.releaseShot();
      return;
    }
    if (this.curveTouchId !== null && endedIds.indexOf(this.curveTouchId) >= 0) {
      this.curveTouchId = null;
      this.curveTouchStart = null;
      this.curveTouchPoint = null;
      this.curveBaseOffset = this.curveCurrentOffset;
    }
    this.updateDragTouches(event);
  }

  private releaseShot(): void {
    if (!this.dragActor || !this.dragStart || !this.dragNow) {
      this.clearDragAim();
      return;
    }
    if (this.matchEnded || this.goalCelebrationRemaining > 0) {
      this.clearDragAim();
      return;
    }
    const dx = this.dragStart.x - this.dragNow.x;
    const dy = this.dragStart.y - this.dragNow.y;
    const rawLen = Math.sqrt(dx * dx + dy * dy);
    const len = Math.min(rawLen, MAX_DRAG_DISTANCE);
    const power = clamp((len - this.dragActor.radius) / (MAX_DRAG_DISTANCE - this.dragActor.radius), 0, 1);
    if (rawLen > this.dragActor.radius && power > 0) {
      const curveAngleRad = this.curveAngleFromSecondTouch(rawLen);
      const curveDistance = this.curveDistanceForShot(power);
      this.submitShoot({
        commandId: nextId('shoot'),
        matchId: this.activeMatchId,
        actorId: this.dragActor.id,
        side: this.turn,
        angleRad: Math.atan2(dy, dx),
        power,
        curveAngleRad,
        curveDistance,
        fieldWidth: this.fieldWidth,
        fieldHeight: this.fieldHeight,
        clientTick: Date.now(),
      });
    }
    this.clearDragAim();
  }

  private submitShoot(command: ShootCommand): void {
    const normalized = { ...command, matchId: this.activeMatchId, fieldWidth: this.fieldWidth, fieldHeight: this.fieldHeight };
    const applied = this.applyShoot(normalized);
    if (!applied) return;
    if (this.mode === 'ai') {
      if (!this.singleMatchServerReady) {
        this.forceServerForfeit('后端未连接，单人比赛无法校验');
        return;
      }
      if (this.penaltyShootout) {
        return;
      }
      this.singleMatchValidationPending = true;
      void submitSingleMatchShoot(this.activeMatchId, normalized)
        .then((response) => {
          if (!response.ok) this.forceServerForfeit(response.message || '服务端拒绝本次操作');
        })
        .catch(() => this.forceServerForfeit('用户操作无法发送到后端'));
      return;
    }
    const fastSettlement = this.createFastSettlementPreview();
    void this.transport.submitShoot(normalized, fastSettlement).catch(() => undefined);
  }

  private applyShootWithFastSettlement(command: ShootCommand): boolean | MatchSettlementPreview {
    const applied = this.applyShoot(command);
    if (!applied) return false;
    return this.createFastSettlementPreview();
  }

  private applyShoot(command: ShootCommand): boolean {
    if (this.appliedCommandIds.has(command.commandId)) return true;
    const actor = this.players.find((p) => p.id === command.actorId);
    if (!actor || actor.side !== command.side || command.side !== this.turn || !this.isSettled()) return false;
    if (this.penaltyShootout && (!this.penaltyAttackerReady || actor.id !== this.currentPenaltyKickerId)) return false;
    this.appliedCommandIds.add(command.commandId);
    const curveAngle = clamp(command.curveAngleRad || 0, -MAX_CURVE_ANGLE, MAX_CURVE_ANGLE);
    const curveDistance = Math.max(0, command.curveDistance || 0);
    const hasCurve = Math.abs(curveAngle) > 0.03 && curveDistance > CURVE_MIN_DISTANCE;
    const shotAngle = command.angleRad + (hasCurve ? curveAngle : 0);
    const speed = PLAYER_SHOT_SPEED * Math.max(0, command.power);
    actor.vx = Math.cos(shotAngle) * speed;
    actor.vy = Math.sin(shotAngle) * speed;
    this.physicsAccumulator = 0;
    this.lastShotActorId = actor.id;
    if (this.penaltyShootout) {
      this.penaltyShotTaken = true;
      this.applyPenaltyKeeperMove();
    }
    if (hasCurve) {
      this.activeCurves.set(actor.id, {
        remainingAngle: -curveAngle * 2,
        remainingDistance: curveDistance,
      });
    } else {
      this.activeCurves.delete(actor.id);
    }
    if (!this.penaltyShootout) {
      this.turn = this.turn === 'home' ? 'away' : 'home';
      this.turnRemaining = TURN_SECONDS;
    }
    if (this.mode === 'online') this.onlineControlEnabled = false;
    this.emitMatchEvent({ type: 'shoot', side: command.side, actorId: actor.id });
    return true;
  }

  private fireAi(): void {
    if (!this.singleMatchServerReady || this.singleMatchAiRequestInFlight) {
      return;
    }
    const penaltyActor = this.penaltyShootout ? this.players.find((p) => p.id === this.currentPenaltyKickerId) : null;
    this.singleMatchAiRequestInFlight = true;
    void requestSingleMatchAiShoot(this.activeMatchId, penaltyActor ? {
      phase: 'penalty',
      actorId: penaltyActor.id,
      actorX: penaltyActor.x,
      actorY: penaltyActor.y,
    } : {})
      .then((response) => {
        if (!response.ok || !response.command) return;
        if (!this.penaltyShootout) this.singleMatchValidationPending = true;
        const command = { ...response.command, matchId: this.activeMatchId };
        this.applyShoot(command);
      })
      .catch(() => undefined)
      .then(() => {
        this.singleMatchAiRequestInFlight = false;
      });
  }

  private firePenaltyAi(): void {
    this.fireAi();
  }

  private step(dt: number): void {
    if (this.matchEnded) return;
    this.physicsAccumulator = Math.min(this.physicsAccumulator + dt, FIXED_PHYSICS_DT * 12);
    while (this.physicsAccumulator >= FIXED_PHYSICS_DT) {
      this.stepFixed(FIXED_PHYSICS_DT);
      this.physicsAccumulator -= FIXED_PHYSICS_DT;
    }
  }

  private stepFixed(dt: number): void {
    for (const b of this.bodies) this.integrateBody(b, dt);
    this.resolveAllCollisions();
    this.checkGoal();
  }

  private integrateBody(b: DiscBodyState, dt: number): void {
    const speedBeforeDamping = Math.sqrt(b.vx * b.vx + b.vy * b.vy);
    this.applyCurveMotion(b, dt, speedBeforeDamping);
    if (b.kind === 'ball' && speedBeforeDamping > 0) {
      const direction = b.vx + b.vy >= 0 ? -1 : 1;
      this.ballSpinDeg = (this.ballSpinDeg + direction * speedBeforeDamping * dt / b.radius * 180 / Math.PI) % 360;
    }
    b.x += b.vx * dt;
    b.y += b.vy * dt;
    const damping = Math.exp(-this.effectiveFriction(b, speedBeforeDamping) * dt);
    b.vx *= damping;
    b.vy *= damping;
    const stopSpeed = b.kind === 'ball' ? BALL_STOP_SPEED : PLAYER_STOP_SPEED;
    if (Math.sqrt(b.vx * b.vx + b.vy * b.vy) < stopSpeed) {
      b.vx = 0;
      b.vy = 0;
      this.activeCurves.delete(b.id);
    }
  }

  private applyCurveMotion(b: DiscBodyState, dt: number, speed: number): void {
    if (b.kind !== 'player' || speed <= 0) return;
    const curve = this.activeCurves.get(b.id);
    if (!curve) return;
    const travel = Math.min(speed * dt, curve.remainingDistance);
    if (travel <= 0) {
      this.activeCurves.delete(b.id);
      return;
    }
    const angleStep = curve.remainingAngle * (travel / curve.remainingDistance);
    const cos = Math.cos(angleStep);
    const sin = Math.sin(angleStep);
    const vx = b.vx;
    const vy = b.vy;
    b.vx = vx * cos - vy * sin;
    b.vy = vx * sin + vy * cos;
    curve.remainingAngle -= angleStep;
    curve.remainingDistance -= travel;
    if (Math.abs(curve.remainingAngle) < 0.01 || curve.remainingDistance <= 1) this.activeCurves.delete(b.id);
  }

  private effectiveFriction(b: DiscBodyState, speed: number): number {
    const lowSpeed = b.kind === 'ball' ? BALL_LOW_SPEED_FRICTION_START : PLAYER_LOW_SPEED_FRICTION_START;
    if (speed >= lowSpeed) return b.friction;
    const tailFriction = b.kind === 'ball' ? BALL_TAIL_FRICTION : PLAYER_TAIL_FRICTION;
    const slowFactor = 1 - speed / lowSpeed;
    return b.friction + tailFriction * slowFactor * slowFactor;
  }

  private resolveAllCollisions(): void {
    const bodies = this.bodies;
    for (let iteration = 0; iteration < SOLVER_ITERATIONS; iteration++) {
      for (const b of bodies) this.collideArena(b);
      for (let i = 0; i < bodies.length; i++) {
        for (let j = i + 1; j < bodies.length; j++) this.collideBodies(bodies[i], bodies[j]);
      }
    }
  }

  private collideArena(b: DiscBodyState): void {
    const left = -this.fieldWidth / 2 + WALL_INSET + b.radius;
    const right = this.fieldWidth / 2 - WALL_INSET - b.radius;
    let collided = false;
    if (b.x < left) {
      b.x = left;
      b.vx = Math.abs(b.vx) * this.wallRestitution(b);
      collided = true;
    }
    if (b.x > right) {
      b.x = right;
      b.vx = -Math.abs(b.vx) * this.wallRestitution(b);
      collided = true;
    }

    const topLimit = this.bodyInsideGoalMouth(b) ? this.fieldHeight / 2 - b.radius : this.goalLineY - b.radius;
    const bottomLimit = this.bodyInsideGoalMouth(b) ? -this.fieldHeight / 2 + b.radius : -this.goalLineY + b.radius;
    if (b.y > topLimit) {
      b.y = topLimit;
      b.vy = -Math.abs(b.vy) * this.wallRestitution(b);
      collided = true;
    }
    if (b.y < bottomLimit) {
      b.y = bottomLimit;
      b.vy = Math.abs(b.vy) * this.wallRestitution(b);
      collided = true;
    }
    if (this.collideCornerCushions(b)) collided = true;
    if (collided) this.activeCurves.delete(b.id);
    if (b.kind === 'ball') {
      const top = this.goalLineY;
      const bottom = -this.goalLineY;
      this.collideGoalPost(b, -GOAL_HALF_WIDTH, top);
      this.collideGoalPost(b, GOAL_HALF_WIDTH, top);
      this.collideGoalPost(b, -GOAL_HALF_WIDTH, bottom);
      this.collideGoalPost(b, GOAL_HALF_WIDTH, bottom);
    }
  }

  private collideGoalPost(b: DiscBodyState, x: number, y: number): void {
    const postRadius = 5;
    const dx = b.x - x;
    const dy = b.y - y;
    const min = b.radius + postRadius;
    const dSq = dx * dx + dy * dy;
    if (dSq >= min * min) return;
    const d = Math.sqrt(dSq) || 0.0001;
    const nx = dx / d;
    const ny = dy / d;
    b.x += nx * (min - d);
    b.y += ny * (min - d);
    const vn = b.vx * nx + b.vy * ny;
    if (vn < 0) {
      const bounce = 1 + this.wallRestitution(b);
      b.vx -= bounce * vn * nx;
      b.vy -= bounce * vn * ny;
    }
  }

  private collideCornerCushions(b: DiscBodyState): boolean {
    let collided = false;
    const halfW = this.fieldWidth / 2;
    const top = this.goalLineY;
    const bottom = -this.goalLineY;
    const corners = [
      { x: -halfW, y: top, sx: -1, sy: 1 },
      { x: halfW, y: top, sx: 1, sy: 1 },
      { x: -halfW, y: bottom, sx: -1, sy: -1 },
      { x: halfW, y: bottom, sx: 1, sy: -1 },
    ];
    for (const corner of corners) {
      const dx = b.x - corner.x;
      const dy = b.y - corner.y;
      if (dx * corner.sx > 0 || dy * corner.sy > 0) continue;
      const min = CORNER_CUSHION_RADIUS + b.radius;
      const dSq = dx * dx + dy * dy;
      if (dSq >= min * min) continue;
      const d = Math.sqrt(dSq) || 0.0001;
      const nx = dx / d;
      const ny = dy / d;
      b.x += nx * (min - d);
      b.y += ny * (min - d);
      const vn = b.vx * nx + b.vy * ny;
      if (vn < 0) {
        const bounce = 1 + CORNER_CUSHION_RESTITUTION;
        b.vx -= bounce * vn * nx;
        b.vy -= bounce * vn * ny;
      }
      collided = true;
    }
    return collided;
  }

  private collideBodies(a: DiscBodyState, b: DiscBodyState): void {
    let dx = b.x - a.x;
    let dy = b.y - a.y;
    let d = Math.sqrt(dx * dx + dy * dy);
    const min = a.radius + b.radius;
    if (d >= min) return;
    if (d < 0.0001) {
      d = 0.0001;
      dx = 1;
      dy = 0;
    }
    const nx = dx / d;
    const ny = dy / d;
    const invA = 1 / a.mass;
    const invB = 1 / b.mass;
    const invTotal = invA + invB;
    const correction = (min - d) / invTotal;
    a.x -= nx * correction * invA;
    a.y -= ny * correction * invA;
    b.x += nx * correction * invB;
    b.y += ny * correction * invB;
    this.activeCurves.delete(a.id);
    this.activeCurves.delete(b.id);

    const relVx = b.vx - a.vx;
    const relVy = b.vy - a.vy;
    const relNormalSpeed = relVx * nx + relVy * ny;
    if (relNormalSpeed > 0) return;
    const restitution = this.collisionRestitution(a, b);
    const impulse = (-(1 + restitution) * relNormalSpeed) / invTotal;
    a.vx -= impulse * invA * nx;
    a.vy -= impulse * invA * ny;
    b.vx += impulse * invB * nx;
    b.vy += impulse * invB * ny;
  }

  private checkGoal(): void {
    if (this.goalCelebrationRemaining > 0 || this.matchEnded) return;
    if (Math.abs(this.ball.x) > GOAL_HALF_WIDTH - this.ball.radius) return;
    if (this.penaltyShootout) {
      if (this.ball.y > this.goalLineY + this.ball.radius) this.registerPenaltyGoal(this.penaltyTurn);
      return;
    }
    if (this.ball.y > this.goalLineY + this.ball.radius) this.registerGoal('home');
    if (this.ball.y < -this.goalLineY - this.ball.radius) this.registerGoal('away');
  }

  private registerGoal(side: TeamSide): void {
    const actorId = this.lastShotActorId || `${side}-1`;
    const ownGoal = !!this.lastShotActorId && !this.lastShotActorId.startsWith(side);
    this.score[side] += 1;
    this.stopBallInGoal();
    this.emitMatchEvent({ type: 'goal', side, actorId, matchSecond: Math.round(MATCH_SECONDS - this.matchRemaining), penalty: false, ownGoal });
    this.goalScorer = side;
    this.pendingKickoffTurn = side === 'home' ? 'away' : 'home';
    this.goalCelebrationRemaining = GOAL_CELEBRATION_SECONDS;
    this.goalCelebrationElapsed = 0;
    const shouldEndByLocalScore = !this.replayMode && this.score[side] >= WIN_SCORE;
    this.celebrationKind = shouldEndByLocalScore && this.mode !== 'online' ? 'matchEnd' : 'goal';
    this.clearDragAim();
    this.singleMatchValidationPending = false;
    if (shouldEndByLocalScore && this.mode !== 'online') this.victorySide = side;
  }

  private syncNodes(): void {
    const ballNode = findNode(this.canvas, 'Ball');
    if (ballNode) {
      ballNode.setPosition(this.ball.x, this.ball.y);
      ballNode.angle = this.ballSpinDeg;
    }
    for (const p of this.players) {
      const node = findNode(this.canvas, `Player_${p.id}`);
      if (!node) continue;
      node.active = true;
      node.setPosition(p.x, p.y);
    }
    this.syncLegacyScoreLabels();
    const turnLabel = findNode(this.canvas, 'TextTurn')?.getComponent(Label);
    if (turnLabel) turnLabel.string = '';
    this.drawMatchHud();
    this.drawAimIndicator();
  }

  private updateClocks(dt: number): void {
    if (this.matchEnded || this.goalCelebrationRemaining > 0) return;
    if (this.mode === 'online') {
      return;
    }
    if (!this.penaltyShootout) this.matchRemaining = Math.max(0, this.matchRemaining - dt);
    const shouldTickTurn = this.penaltyShootout || this.isSettled();
    if (shouldTickTurn) this.turnRemaining = Math.max(0, this.turnRemaining - dt);
    if (!this.penaltyShootout && this.matchRemaining <= 0) {
      this.endMatchByScore();
      return;
    }
    if (this.turnRemaining <= 0) {
      this.clearDragAim();
      if (this.penaltyShootout) {
        this.penaltyMarks.push({ side: this.penaltyTurn, made: false });
        this.penaltyShotTaken = false;
        this.advancePenaltyKick();
        return;
      }
      this.turn = this.turn === 'home' ? 'away' : 'home';
      this.turnRemaining = TURN_SECONDS;
      this.aiCooldown = 0.8;
    }
  }

  private drawMatchHud(): void {
    const hud = this.ensureHudNode();
    const g = this.hudGraphics || hud.getComponent(Graphics) || hud.addComponent(Graphics);
    this.hudGraphics = g;
    const width = this.canvas.getComponent(UITransform)?.contentSize.width || 390;
    const pitchTop = this.pitchTopY();
    const topY = pitchTop;
    const homeX = -width / 2 + 10;
    const awayX = width / 2 - 10;
    g.clear();
    this.drawHudPlayer(g, homeX, topY, 'home', this.turn === 'home' ? this.turnRemaining / TURN_SECONDS : 1, this.turn === 'home' && !this.matchEnded);
    this.drawHudPlayer(g, awayX, topY, 'away', this.turn === 'away' ? this.turnRemaining / TURN_SECONDS : 1, this.turn === 'away' && !this.matchEnded);
    const matchLabel = findNode(hud, 'HudMatchTime')?.getComponent(Label);
    if (matchLabel) matchLabel.string = this.penaltyShootout ? '' : formatClock(this.matchRemaining);
    this.drawPenaltyScoreboard(g);
    this.drawGoalCelebration(g);
    this.drawPenaltyKickCountdown(g);
    this.drawVictoryOverlay(g);
    this.drawVictorySettlement(g);
  }

  private matchDisplayName(): string {
    const name = getCurrentUserDisplayName();
    return name;
  }

  private opponentDisplayName(): string {
    if (this.mode === 'ai') return '电脑';
    if (!this.onlineMatch) return '对手';
    const opponent = this.onlineMatch.awayPlayer;
    return opponent?.displayName || opponent?.username || '对手';
  }

  private updateGoalCelebration(dt: number): void {
    if (this.goalCelebrationRemaining <= 0) return;
    this.goalCelebrationRemaining = Math.max(0, this.goalCelebrationRemaining - dt);
    this.goalCelebrationElapsed += dt;
    if (this.goalCelebrationRemaining > 0) return;
    this.hideGoalLabels();
    if (this.celebrationKind === 'penaltyIntro') {
      this.hidePenaltyIntroLabels();
      this.enterPenaltyShootout();
      return;
    }
    if (this.pendingOnlineFinishSide) {
      this.startOnlineFinishAnimation();
      return;
    }
    if (this.victorySide) {
      this.matchEnded = true;
      this.turnRemaining = 0;
      return;
    }
    if (this.penaltyShootout) {
      this.advancePenaltyKick();
      return;
    }
    if (this.mode === 'online' && this.resetOnlineObjectsFromInitialSnapshot(this.pendingKickoffTurn)) {
      this.turnRemaining = TURN_SECONDS;
      this.aiCooldown = 0.8;
      return;
    }
    this.resetObjects(this.pendingKickoffTurn);
    this.syncSingleMatchKickoffReset();
    this.turnRemaining = TURN_SECONDS;
    this.aiCooldown = 0.8;
  }

  private drawGoalCelebration(g: Graphics): void {
    const leftLabel = findNode(this.ensureHudNode(), 'HudGoalLeft');
    const rightLabel = findNode(this.ensureHudNode(), 'HudGoalRight');
    if (this.goalCelebrationRemaining <= 0 || !leftLabel || !rightLabel) {
      this.hideGoalLabels();
      return;
    }
    const width = this.canvas.getComponent(UITransform)?.contentSize.width || 390;
    const height = this.canvas.getComponent(UITransform)?.contentSize.height || 844;
    const t = clamp(this.goalCelebrationElapsed / GOAL_CELEBRATION_SECONDS, 0, 1);
    if (this.celebrationKind === 'penaltyIntro') {
      this.drawPenaltyIntro(g, width, height);
      return;
    }
    const slide = easeOutCubic(clamp(t / 0.26, 0, 1));
    const holdY = 6;
    leftLabel.active = true;
    rightLabel.active = true;
    if (this.celebrationKind === 'matchEnd') {
      const left = leftLabel.getComponent(Label);
      const right = rightLabel.getComponent(Label);
      if (left) left.string = '比赛';
      if (right) right.string = '结束';
      leftLabel.getComponent(UITransform)?.setContentSize(120, 72);
      rightLabel.getComponent(UITransform)?.setContentSize(120, 72);
    } else {
      const left = leftLabel.getComponent(Label);
      const right = rightLabel.getComponent(Label);
      if (left) left.string = '进';
      if (right) right.string = '球';
      leftLabel.getComponent(UITransform)?.setContentSize(118, 24);
      rightLabel.getComponent(UITransform)?.setContentSize(118, 24);
    }
    const textX = width / 2 + 70 - (width / 2 + 70) * slide;
    const textGap = this.celebrationKind === 'matchEnd' ? 58 : 34;
    leftLabel.setPosition(textX - textGap, holdY);
    rightLabel.setPosition(textX + textGap, holdY);

    g.fillColor = rgba(0, 0, 0, 132);
    g.rect(-width / 2, -height / 2, width, height);
    g.fill();
    const barSlide = easeOutCubic(clamp(t / 0.3, 0, 1));
    const topBarX = -width + width * barSlide;
    const bottomBarX = width - width * barSlide;
    g.fillColor = rgba(255, 142, 30, 235);
    g.rect(topBarX - width / 2, 48, width, 7);
    g.fill();
    g.rect(bottomBarX - width / 2, -48, width, 7);
    g.fill();
    this.drawConfetti(g, width, height, t);
  }

  private drawConfetti(g: Graphics, width: number, height: number, t: number): void {
    if (t < 0.28 || t > 0.98) return;
    const colors = [rgba(255, 220, 62), rgba(255, 97, 97), rgba(97, 196, 255), rgba(132, 255, 148), rgba(255, 145, 55)];
    for (let i = 0; i < 34; i += 1) {
      const side = i % 2 === 0 ? -1 : 1;
      const seed = i * 37;
      const burstT = clamp((t - 0.28) / 0.7, 0, 1);
      const angle = (-0.9 + (seed % 18) * 0.1) * side;
      const speed = 70 + (seed % 90);
      const x = side * (32 + (seed % 36)) + Math.cos(angle) * speed * burstT;
      const y = 10 + Math.sin(angle) * speed * burstT - 70 * burstT * burstT + ((seed % 40) - 20);
      g.fillColor = colors[i % colors.length];
      g.rect(x, y, 5, 8);
      g.fill();
    }
  }

  private drawPenaltyIntro(g: Graphics, width: number, height: number): void {
    const intro = findNode(this.ensureHudNode(), 'HudPenaltyIntro');
    const count = findNode(this.ensureHudNode(), 'HudPenaltyCount');
    const elapsed = this.goalCelebrationElapsed;
    g.fillColor = rgba(0, 0, 0, 166);
    g.rect(-width / 2, -height / 2, width, height);
    g.fill();
    if (intro) {
      intro.active = true;
      intro.setPosition(0, 72);
      intro.getComponent(UITransform)?.setContentSize(260, 38);
      const label = intro.getComponent(Label);
      if (label) {
        label.string = '即将进入点球大战';
        label.fontSize = 24;
        label.color = rgba(255, 246, 220);
      }
    }
    if (!count) return;
    count.active = elapsed >= 1;
    const label = count.getComponent(Label);
    if (!label || elapsed < 1) return;
    const countdownElapsed = clamp(elapsed - 1, 0, 5);
    const number = Math.max(1, 5 - Math.floor(countdownElapsed));
    const phase = countdownElapsed % 1;
    const scale = 1.35 - 0.35 * easeOutCubic(phase);
    count.setScale(scale, scale, 1);
    count.setPosition(0, -4);
    count.getComponent(UITransform)?.setContentSize(150, 120);
    label.string = `${number}`;
    label.fontSize = 92;
    label.isBold = true;
    label.color = rgba(255, 246, 178);
    g.fillColor = rgba(42, 32, 8, 155);
    g.roundRect(-46 * scale + 6, -56 * scale - 5, 92 * scale, 112 * scale, 10);
    g.fill();
  }

  private drawPenaltyKickCountdown(g: Graphics): void {
    if (!this.penaltyShootout || this.matchEnded || this.goalCelebrationRemaining > 0 || this.penaltyAttackDelay <= 0 || this.penaltyTurn !== 'home') {
      if (this.penaltyShootout && this.goalCelebrationRemaining <= 0) this.hidePenaltyIntroLabels();
      return;
    }
    const width = this.canvas.getComponent(UITransform)?.contentSize.width || 390;
    const height = this.canvas.getComponent(UITransform)?.contentSize.height || 844;
    const intro = findNode(this.ensureHudNode(), 'HudPenaltyIntro');
    const count = findNode(this.ensureHudNode(), 'HudPenaltyCount');
    g.fillColor = rgba(0, 0, 0, 132);
    g.rect(-width / 2, -height / 2, width, height);
    g.fill();
    if (intro) {
      intro.active = true;
      intro.setPosition(0, 72);
      intro.getComponent(UITransform)?.setContentSize(240, 38);
      const label = intro.getComponent(Label);
      if (label) {
        label.string = '距离罚点还有';
        label.fontSize = 24;
        label.color = rgba(255, 246, 220);
      }
    }
    if (!count) return;
    const number = Math.max(1, Math.ceil(this.penaltyAttackDelay));
    const phase = 1 - (this.penaltyAttackDelay % 1 || 1);
    const scale = 1.35 - 0.35 * easeOutCubic(phase);
    count.active = true;
    count.setScale(scale, scale, 1);
    count.setPosition(0, -4);
    count.getComponent(UITransform)?.setContentSize(150, 120);
    const label = count.getComponent(Label);
    if (!label) return;
    label.string = `${number}`;
    label.fontSize = 92;
    label.isBold = true;
    label.color = rgba(255, 246, 178);
    g.fillColor = rgba(42, 32, 8, 155);
    g.roundRect(-46 * scale + 6, -56 * scale - 5, 92 * scale, 112 * scale, 10);
    g.fill();
  }

  private drawVictorySettlement(g: Graphics): void {
    const titleNode = findNode(this.ensureHudNode(), 'HudVictoryTitle');
    const scoreNode = findNode(this.ensureHudNode(), 'HudVictoryScore');
    if (!this.matchEnded || !this.victorySide || !titleNode || !scoreNode) {
      if (titleNode) titleNode.active = false;
      if (scoreNode) scoreNode.active = false;
      this.clearVictoryRuntimeNodes();
      return;
    }
    const width = this.canvas.getComponent(UITransform)?.contentSize.width || 390;
    const height = this.canvas.getComponent(UITransform)?.contentSize.height || 844;
    g.fillColor = rgba(2, 8, 18, 204);
    g.rect(-width / 2, -height / 2, width, height);
    g.fill();
    const isWin = this.victorySide === 'home';
    g.fillColor = isWin ? rgba(238, 77, 77, 204) : rgba(74, 135, 232, 204);
    g.roundRect(-160, -238, 320, 488, 8);
    g.fill();
    g.strokeColor = rgba(255, 255, 255, 235);
    g.lineWidth = 3;
    g.roundRect(-160, -238, 320, 488, 8);
    g.stroke();
    titleNode.active = true;
    scoreNode.active = true;
    titleNode.setPosition(0, 190);
    scoreNode.setPosition(0, 152);
    const title = titleNode.getComponent(Label);
    const score = scoreNode.getComponent(Label);
    if (title) title.string = isWin ? '胜利' : '失败';
    if (score) score.string = this.finalScoreText();
    this.drawVictoryTimeline(g);
    this.ensureVictoryDetails();
  }

  private drawVictoryOverlay(g: Graphics): void {
    if (!this.matchEnded || !this.victorySide) return;
    const width = this.canvas.getComponent(UITransform)?.contentSize.width || 390;
    const height = this.canvas.getComponent(UITransform)?.contentSize.height || 844;
    g.fillColor = rgba(0, 0, 0, 82);
    g.rect(-width / 2, -height / 2, width, height);
    g.fill();
  }

  private drawPenaltyScoreboard(g: Graphics): void {
    if (!this.penaltyShootout) return;
    const rowW = 112;
    const rowH = 24;
    const x = -rowW / 2;
    const topY = this.pitchTopY() + 48;
    this.drawPenaltyScoreRow(g, x, topY, 'home', rowW, rowH);
    this.drawPenaltyScoreRow(g, x, topY - rowH - 3, 'away', rowW, rowH);
  }

  private syncLegacyScoreLabels(): void {
    this.removeLegacyBottomScoreboard();
    this.setLegacyScoreLabel('TextMode', true, `${this.score.home} : ${this.score.away}`);
  }

  private setLegacyScoreLabel(name: string, visible: boolean, value: string): void {
    const node = findNode(this.canvas, name);
    const label = node?.getComponent(Label);
    if (!node || !label) return;
    node.active = visible;
    label.enabled = visible;
    label.string = visible ? value : '';
    label.color = visible ? rgba(245, 249, 255) : rgba(245, 249, 255, 0);
    if (visible) node.setPosition(0, name === 'TextMode' ? 386 : 356);
    else node.setPosition(0, -9999);
  }

  private removeLegacyBottomScoreboard(): void {
    const node = findNode(this.canvas, 'TextScore');
    if (!node) return;
    node.active = false;
    const label = node.getComponent(Label);
    if (label) {
      label.enabled = false;
      label.string = '';
      label.color = rgba(245, 249, 255, 0);
    }
    node.setPosition(0, -9999);
    node.destroy();
  }

  private drawPenaltyScoreRow(g: Graphics, x: number, y: number, side: TeamSide, width: number, height: number): void {
    g.fillColor = rgba(14, 43, 88, 232);
    g.roundRect(x, y - height / 2, width, height, 4);
    g.fill();
    g.strokeColor = side === 'home' ? rgba(255, 80, 80, 235) : rgba(80, 150, 255, 235);
    g.lineWidth = 2;
    g.roundRect(x, y - height / 2, width, height, 4);
    g.stroke();
    drawGenericMatchAvatar(g, x + 15, y, 7.5, side);
    const marks = this.penaltyMarks.filter((mark) => mark.side === side);
    for (let i = 0; i < PENALTY_SHOOTOUT_ROUNDS; i += 1) {
      const mark = marks[i];
      g.fillColor = mark ? (mark.made ? rgba(65, 212, 96, 245) : rgba(236, 66, 72, 245)) : rgba(7, 22, 48, 245);
      g.circle(x + 31 + i * 16, y, 5.5);
      g.fill();
      g.strokeColor = rgba(255, 255, 255, 190);
      g.lineWidth = 1;
      g.circle(x + 31 + i * 16, y, 5.5);
      g.stroke();
    }
  }

  private finalScoreText(): string {
    if (this.singleMatchSettlement?.scoreText) return this.singleMatchSettlement.scoreText;
    if (!this.penaltyShootout) return `${this.score.home} : ${this.score.away}`;
    return `${this.score.home + this.penaltyScore.home}（${this.penaltyScore.home}）：${this.score.away + this.penaltyScore.away}（${this.penaltyScore.away}）`;
  }

  private hideGoalLabels(): void {
    const hud = this.ensureHudNode();
    const leftLabel = findNode(hud, 'HudGoalLeft');
    const rightLabel = findNode(hud, 'HudGoalRight');
    if (leftLabel) leftLabel.active = false;
    if (rightLabel) rightLabel.active = false;
    this.hidePenaltyIntroLabels();
  }

  private hidePenaltyIntroLabels(): void {
    const hud = this.ensureHudNode();
    const intro = findNode(hud, 'HudPenaltyIntro');
    const count = findNode(hud, 'HudPenaltyCount');
    if (intro) intro.active = false;
    if (count) {
      count.active = false;
      count.setScale(1, 1, 1);
    }
  }

  private endMatchByScore(): void {
    this.clearDragAim();
    if (this.score.home === this.score.away) {
      this.startPenaltyIntro();
      return;
    }
    this.victorySide = this.score.home > this.score.away ? 'home' : 'away';
    this.celebrationKind = 'matchEnd';
    this.goalCelebrationRemaining = GOAL_CELEBRATION_SECONDS;
    this.goalCelebrationElapsed = 0;
  }

  private startPenaltyIntro(): void {
    this.celebrationKind = 'penaltyIntro';
    this.goalCelebrationRemaining = PENALTY_INTRO_SECONDS;
    this.goalCelebrationElapsed = 0;
    this.pendingPenaltyIntro = true;
  }

  private enterPenaltyShootout(): void {
    this.penaltyShootout = true;
    this.pendingPenaltyIntro = false;
    this.penaltySuddenDeath = false;
    this.penaltyShotIndex = 0;
    this.penaltyTurn = 'home';
    this.penaltyScore = { home: 0, away: 0 };
    this.penaltyMarks = [];
    this.setupPenaltyKick('home');
  }

  private setupPenaltyKick(attackingSide: TeamSide): void {
    this.clearDragAim();
    this.penaltyTurn = attackingSide;
    this.turn = attackingSide;
    this.turnRemaining = TURN_SECONDS;
    this.aiCooldown = 0.25;
    this.penaltyAttackDelay = PENALTY_ATTACK_DELAY;
    this.penaltyAttackerReady = false;
    this.penaltyShotTaken = false;
    this.penaltyKeeperMoved = false;
    this.penaltyKeeperPendingDirection = 0;
    this.penaltyKeeperSwipeStart = null;
    this.activeCurves.clear();
    const ballPosition = this.penaltyBallPosition();
    const attackerPosition = this.penaltyAttackerPosition();
    const keeperPosition = this.penaltyKeeperPosition();
    const offscreenPosition = this.penaltyOffscreenPosition();
    this.ball = makeBall(ballPosition.x, ballPosition.y);
    this.ballSpinDeg = 0;
    const defendingSide = attackingSide === 'home' ? 'away' : 'home';
    this.currentPenaltyKickerId = this.nextPenaltyKickerId(attackingSide);
    this.currentPenaltyKeeperId = this.penaltyKeeperId(defendingSide);
    for (const player of this.players) {
      player.vx = 0;
      player.vy = 0;
      if (player.id === this.currentPenaltyKickerId) {
        player.x = attackerPosition.x;
        player.y = attackerPosition.y;
      } else if (player.id === this.currentPenaltyKeeperId) {
        player.x = keeperPosition.x;
        player.y = keeperPosition.y;
      } else {
        player.x = offscreenPosition.x;
        player.y = offscreenPosition.y;
      }
    }
    this.resolveAllCollisions();
    this.refreshPenaltyPlayerVisibility();
    if (this.mode === 'ai' && defendingSide === 'away') {
      this.requestServerPenaltyKeeperMove();
    }
  }

  private updatePenaltyShootout(dt: number): void {
    if (!this.penaltyShootout || this.matchEnded || this.goalCelebrationRemaining > 0) return;
    if (this.penaltyAttackDelay > 0) {
      this.penaltyAttackDelay = Math.max(0, this.penaltyAttackDelay - dt);
      if (this.penaltyAttackDelay <= 0) this.penaltyAttackerReady = true;
    }
    if (this.penaltyShotTaken && this.isSettled()) this.registerPenaltyMiss();
  }

  private registerPenaltyGoal(side: TeamSide): void {
    if (!this.penaltyShootout || side !== this.penaltyTurn) return;
    this.penaltyScore[side] += 1;
    this.stopBallInGoal();
    this.penaltyMarks.push({ side, made: true });
    this.goalScorer = side;
    this.goalCelebrationRemaining = GOAL_CELEBRATION_SECONDS;
    this.goalCelebrationElapsed = 0;
    this.celebrationKind = 'goal';
    this.clearDragAim();
    this.penaltyShotTaken = false;
    this.singleMatchValidationPending = false;
    const actorId = this.currentPenaltyKickerId || `${side}-1`;
    this.emitMatchEvent({ type: 'goal', side, actorId, matchSecond: -1, penalty: true, ownGoal: false });
  }

  private registerPenaltyMiss(): void {
    if (!this.penaltyShootout || !this.penaltyShotTaken || this.goalCelebrationRemaining > 0) return;
    this.penaltyMarks.push({ side: this.penaltyTurn, made: false });
    this.penaltyShotTaken = false;
    this.advancePenaltyKick();
  }

  private advancePenaltyKick(): void {
    if (!this.penaltyShootout) return;
    this.penaltyShotIndex += 1;
    if (this.shouldEndPenaltyShootout()) {
      this.victorySide = this.penaltyScore.home > this.penaltyScore.away ? 'home' : 'away';
      this.celebrationKind = 'matchEnd';
      this.goalCelebrationRemaining = GOAL_CELEBRATION_SECONDS;
      this.goalCelebrationElapsed = 0;
      this.turnRemaining = 0;
      return;
    }
    if (!this.penaltySuddenDeath && this.penaltyShotIndex >= PENALTY_SHOOTOUT_ROUNDS * 2) {
      this.penaltySuddenDeath = true;
      this.penaltyShotIndex = 0;
      this.penaltyMarks = [];
    }
    this.setupPenaltyKick(this.penaltyShotIndex % 2 === 0 ? 'home' : 'away');
  }

  private shouldEndPenaltyShootout(): boolean {
    if (!this.penaltySuddenDeath) {
      const homeTaken = Math.ceil(this.penaltyShotIndex / 2);
      const awayTaken = Math.floor(this.penaltyShotIndex / 2);
      const homeLeft = PENALTY_SHOOTOUT_ROUNDS - homeTaken;
      const awayLeft = PENALTY_SHOOTOUT_ROUNDS - awayTaken;
      if (this.penaltyScore.home > this.penaltyScore.away + awayLeft) return true;
      if (this.penaltyScore.away > this.penaltyScore.home + homeLeft) return true;
      return this.penaltyShotIndex >= PENALTY_SHOOTOUT_ROUNDS * 2 && this.penaltyScore.home !== this.penaltyScore.away;
    }
    return this.penaltyShotIndex > 0 && this.penaltyShotIndex % 2 === 0 && this.penaltyScore.home !== this.penaltyScore.away;
  }

  private nextPenaltyKickerId(side: TeamSide): string {
    const takenBySide = this.penaltyMarks.filter((mark) => mark.side === side).length;
    const round = this.penaltySuddenDeath ? takenBySide : takenBySide % PENALTY_SHOOTOUT_ROUNDS;
    return `${side}-${round % 5 + 1}`;
  }

  private penaltyBallPosition(): Vec2 {
    return new Vec2(0, this.goalLineY - 118);
  }

  private penaltyAttackerPosition(): Vec2 {
    return new Vec2(0, this.penaltyBallPosition().y - 56);
  }

  private penaltyKeeperPosition(): Vec2 {
    return new Vec2(0, this.goalLineY - 12);
  }

  private penaltyOffscreenPosition(): Vec2 {
    return new Vec2(PENALTY_OFFSCREEN, PENALTY_OFFSCREEN);
  }

  private refreshPenaltyPlayerVisibility(): void {
    for (const player of this.players) {
      const node = findNode(this.canvas, `Player_${player.id}`);
      if (node) node.active = true;
    }
  }

  private penaltyKeeperId(side: TeamSide): string {
    return `${side}-1`;
  }

  private movePenaltyKeeper(side: TeamSide, direction: -1 | 1): void {
    const keeper = this.players.find((p) => p.id === this.penaltyKeeperId(side));
    if (!keeper) return;
    keeper.x = clamp(keeper.x + direction * PENALTY_KEEPER_MOVE, -GOAL_HALF_WIDTH + keeper.radius, GOAL_HALF_WIDTH - keeper.radius);
  }

  private applyPenaltyKeeperMove(): void {
    if (this.penaltyKeeperMoved || this.penaltyKeeperPendingDirection === 0) return;
    const keeper = this.players.find((p) => p.id === this.currentPenaltyKeeperId);
    if (!keeper) return;
    keeper.x = clamp(keeper.x + this.penaltyKeeperPendingDirection * PENALTY_KEEPER_MOVE, -GOAL_HALF_WIDTH + keeper.radius, GOAL_HALF_WIDTH - keeper.radius);
    this.penaltyKeeperMoved = true;
  }

  private stopBallInGoal(): void {
    this.ball.vx = 0;
    this.ball.vy = 0;
    this.activeCurves.delete(this.ball.id);
  }

  private ensureVictoryDetails(): void {
    const hud = this.ensureHudNode();
    if (this.mode === 'ai' && this.singleMatchServerReady && !this.singleMatchSettlement) return;
    if (this.mode === 'online' && !this.singleMatchSettlement) return;
    if (findNode(hud, 'VictoryReturnButton')) return;
    const best = this.singleMatchSettlement?.bestPlayer || null;
    this.createHudLabel(hud, 'VictoryBestTitle', '本场最佳球员', 0, 108, 16, rgba(255, 246, 178), Label.HorizontalAlign.CENTER);
    const avatar = new Node('VictoryBestAvatar');
    avatar.layer = hud.layer;
    hud.addChild(avatar);
    avatar.setPosition(-88, 68);
    avatar.addComponent(UITransform).setContentSize(38, 38);
    const avatarG = avatar.addComponent(Graphics);
    drawGenericMatchAvatar(avatarG, 0, 0, 15, best?.side || this.victorySide || 'home');
    this.createHudLabel(hud, 'VictoryBestName', best?.playerName || '-', -24, 68, 16, rgba(255, 255, 255), Label.HorizontalAlign.CENTER);
    this.createHudLabel(hud, 'VictoryBestGoals', `${best?.goals || 0} 球`, 72, 68, 16, rgba(255, 255, 255), Label.HorizontalAlign.CENTER);
    this.createTimelineLabels(hud);
    this.createVictoryReturnButton(hud);
  }

  private createTimelineLabels(hud: Node): void {
    for (const record of this.settlementGoals()) {
      const y = this.timelineY(record.matchSecond < 0 ? MATCH_SECONDS : record.matchSecond);
      const x = record.side === 'home' ? -82 : 82;
      const align = record.side === 'home' ? Label.HorizontalAlign.RIGHT : Label.HorizontalAlign.LEFT;
      const timeText = record.matchSecond < 0 ? '点球' : formatClock(record.matchSecond);
      const ownGoalText = record.ownGoal ? '（乌龙）' : '';
      this.createHudLabel(hud, `VictoryGoal_${record.order}`, `${timeText}  ${record.playerName}${ownGoalText}`, x, y, 13, rgba(255, 255, 255), align)
        .node.getComponent(UITransform)?.setContentSize(126, 20);
    }
    this.createHudLabel(hud, 'VictoryTimelineStart', '0:00', 0, this.timelineTopY() + 18, 12, rgba(255, 255, 255), Label.HorizontalAlign.CENTER)
      .node.getComponent(UITransform)?.setContentSize(60, 18);
    this.createHudLabel(hud, 'VictoryTimelineEnd', formatClock(MATCH_SECONDS), 0, this.timelineBottomY() - 18, 12, rgba(255, 255, 255), Label.HorizontalAlign.CENTER)
      .node.getComponent(UITransform)?.setContentSize(60, 18);
  }

  private drawVictoryTimeline(g: Graphics): void {
    const startY = this.timelineTopY();
    const endY = this.timelineBottomY();
    g.strokeColor = rgba(255, 255, 255, 170);
    g.lineWidth = 2;
    g.moveTo(0, startY);
    g.lineTo(0, endY);
    g.stroke();
    g.fillColor = rgba(255, 255, 255, 220);
    g.circle(0, startY, 4);
    g.fill();
    g.circle(0, endY, 4);
    g.fill();
    for (const record of this.settlementGoals()) {
      const y = this.timelineY(record.matchSecond < 0 ? MATCH_SECONDS : record.matchSecond);
      const sideX = record.side === 'home' ? -24 : 24;
      g.fillColor = record.side === 'home' ? rgba(255, 110, 90, 240) : rgba(90, 154, 255, 240);
      g.circle(0, y, 4);
      g.fill();
      g.strokeColor = rgba(255, 255, 255, 150);
      g.lineWidth = 1.5;
      g.moveTo(0, y);
      g.lineTo(sideX, y);
      g.stroke();
    }
  }

  private settlementGoals(): MatchSettlement['goals'] {
    return (this.singleMatchSettlement?.goals || []).filter((goal) => !goal.penalty);
  }

  private timelineTopY(): number {
    return 28;
  }

  private timelineBottomY(): number {
    return -142;
  }

  private timelineY(elapsedSeconds: number): number {
    return this.timelineTopY() - clamp(elapsedSeconds / MATCH_SECONDS, 0, 1) * (this.timelineTopY() - this.timelineBottomY());
  }

  private createVictoryReturnButton(hud: Node): void {
    const button = new Node('VictoryReturnButton');
    button.layer = hud.layer;
    hud.addChild(button);
    button.setPosition(0, -194);
    button.addComponent(UITransform).setContentSize(128, 42);
    const g = button.addComponent(Graphics);
    g.fillColor = rgba(255, 255, 255, 228);
    g.roundRect(-64, -21, 128, 42, 8);
    g.fill();
    this.createHudLabel(button, 'VictoryReturnLabel', '返回', 0, 0, 18, rgba(24, 38, 58), Label.HorizontalAlign.CENTER);
    button.on(Node.EventType.TOUCH_END, () => director.loadScene('Home'));
  }

  private clearVictoryRuntimeNodes(): void {
    const hud = this.ensureHudNode();
    for (const child of [...hud.children]) {
      if (child.name.startsWith('Victory')) child.destroy();
    }
  }

  private drawHudPlayer(g: Graphics, x: number, y: number, side: TeamSide, ratio: number, active: boolean): void {
    const isHome = side === 'home';
    const baseColor = isHome ? rgba(224, 45, 45, 232) : rgba(45, 108, 224, 232);
    const avatarColor = isHome ? rgba(238, 77, 77) : rgba(74, 135, 232);
    const scale = active ? 1.08 : 1;
    const panelWidth = 132 * scale;
    const panelHeight = 30 * scale;
    const barHeight = 8 * scale;
    const barY = y;
    const panelBottom = barY + barHeight;
    const panelLeft = isHome ? x : x - panelWidth;
    const panelRight = isHome ? x + panelWidth : x;
    if (active) this.strokeHudTrapezoidGlow(g, panelLeft, panelRight, panelBottom, panelHeight, side);
    this.fillHudTrapezoid(g, panelLeft, panelRight, panelBottom, panelHeight, side);

    const avatarX = isHome ? panelLeft + 25 * scale : panelRight - 25 * scale;
    const avatarY = panelBottom + 15;
    g.fillColor = avatarColor;
    g.circle(avatarX, avatarY, 13 * scale);
    g.fill();
    g.strokeColor = rgba(255, 255, 255, 220);
    g.lineWidth = active ? 3 : 2;
    g.circle(avatarX, avatarY, 13 * scale);
    g.stroke();
    drawGenericMatchAvatar(g, avatarX, avatarY + 1, 8.5 * scale, side);

    const panelSlant = 24;
    const barSlant = panelSlant * (barHeight / panelHeight);
    const barWidth = panelWidth + barSlant;
    const barX = isHome ? panelLeft : panelRight - barWidth;
    this.fillTurnBarShape(g, barX, barY, barWidth, barHeight, barSlant, side, rgba(0, 0, 0, 175));
    const fillWidth = barWidth * clamp(ratio, 0, 1);
    const fillX = isHome ? barX : barX + (barWidth - fillWidth);
    this.fillStripedTurnBar(g, fillX, barY, fillWidth, barHeight, barSlant, side);
    g.strokeColor = rgba(255, 255, 255, 235);
    g.lineWidth = 1;
    this.traceTurnBarShape(g, barX, barY, barWidth, barHeight, barSlant, side);
    g.stroke();
  }

  private fillHudTrapezoid(g: Graphics, left: number, right: number, bottom: number, height: number, side: TeamSide): void {
    const slant = 24;
    const top = bottom + height;
    g.fillColor = side === 'home' ? rgba(224, 45, 45, 232) : rgba(45, 108, 224, 232);
    if (side === 'home') {
      g.moveTo(left, bottom);
      g.lineTo(right, bottom);
      g.lineTo(right - slant, top);
      g.lineTo(left, top);
    } else {
      g.moveTo(left, bottom);
      g.lineTo(right, bottom);
      g.lineTo(right, top);
      g.lineTo(left + slant, top);
    }
    g.close();
    g.fill();
    g.strokeColor = rgba(255, 255, 255, 230);
    g.lineWidth = 2;
    if (side === 'home') {
      g.moveTo(left, bottom);
      g.lineTo(right, bottom);
      g.lineTo(right - slant, top);
      g.lineTo(left, top);
    } else {
      g.moveTo(left, bottom);
      g.lineTo(right, bottom);
      g.lineTo(right, top);
      g.lineTo(left + slant, top);
    }
    g.close();
    g.stroke();
  }

  private strokeHudTrapezoidGlow(g: Graphics, left: number, right: number, bottom: number, height: number, side: TeamSide): void {
    const glowColor = side === 'home' ? rgba(255, 92, 92, 120) : rgba(96, 162, 255, 120);
    this.strokeHudTrapezoid(g, left, right, bottom, height, side, glowColor, 10);
    this.strokeHudTrapezoid(g, left, right, bottom, height, side, glowColor, 5);
  }

  private strokeHudTrapezoid(g: Graphics, left: number, right: number, bottom: number, height: number, side: TeamSide, color: Color, width: number): void {
    const slant = 24;
    const top = bottom + height;
    g.strokeColor = color;
    g.lineWidth = width;
    if (side === 'home') {
      g.moveTo(left, bottom);
      g.lineTo(right, bottom);
      g.lineTo(right - slant, top);
      g.lineTo(left, top);
    } else {
      g.moveTo(left, bottom);
      g.lineTo(right, bottom);
      g.lineTo(right, top);
      g.lineTo(left + slant, top);
    }
    g.close();
    g.stroke();
  }

  private fillTurnBarShape(g: Graphics, x: number, y: number, width: number, height: number, slant: number, side: TeamSide, color: Color): void {
    g.fillColor = color;
    this.traceTurnBarShape(g, x, y, width, height, slant, side);
    g.fill();
  }

  private traceTurnBarShape(g: Graphics, x: number, y: number, width: number, height: number, slant: number, side: TeamSide): void {
    if (side === 'home') {
      g.moveTo(x, y);
      g.lineTo(x + width, y);
      g.lineTo(x + width - slant, y + height);
      g.lineTo(x, y + height);
    } else {
      g.moveTo(x, y);
      g.lineTo(x + width, y);
      g.lineTo(x + width, y + height);
      g.lineTo(x + slant, y + height);
    }
    g.close();
  }

  private fillStripedTurnBar(g: Graphics, x: number, y: number, width: number, height: number, slant: number, side: TeamSide): void {
    if (width <= 0) return;
    const teamColor = side === 'home' ? rgba(232, 54, 54, 255) : rgba(54, 122, 232, 255);
    this.fillTurnBarShape(g, x, y, width, height, slant, side, teamColor);
    const stripe = 14;
    const stripeWidth = 7;
    for (let sx = -slant - stripe; sx < width + slant; sx += stripe) {
      g.fillColor = rgba(255, 255, 255, 255);
      if (side === 'home') {
        this.fillClippedBarStripe(g, x, y, width, height, sx, stripeWidth, -slant, 0, width - slant);
      } else {
        this.fillClippedBarStripe(g, x, y, width, height, sx, stripeWidth, slant, slant, width);
      }
    }
  }

  private fillClippedBarStripe(
    g: Graphics,
    x: number,
    y: number,
    barWidth: number,
    height: number,
    stripeX: number,
    stripeWidth: number,
    topOffset: number,
    topMin: number,
    topMax: number,
  ): void {
    const bottomLeft = clamp(stripeX, 0, barWidth);
    const bottomRight = clamp(stripeX + stripeWidth, 0, barWidth);
    const topLeft = clamp(stripeX + topOffset, topMin, topMax);
    const topRight = clamp(stripeX + stripeWidth + topOffset, topMin, topMax);
    if (bottomRight <= bottomLeft && topRight <= topLeft) return;
    g.moveTo(x + bottomLeft, y);
    g.lineTo(x + bottomRight, y);
    g.lineTo(x + topRight, y + height);
    g.lineTo(x + topLeft, y + height);
    g.close();
    g.fill();
  }

  private pitchTopY(): number {
    const pitch = this.pitchNode;
    const pitchHeight = pitch?.getComponent(UITransform)?.contentSize.height || this.fieldHeight;
    return (pitch?.position.y || 0) + pitchHeight / 2;
  }

  private ensureHudNode(): Node {
    let hud = findNode(this.canvas, 'RuntimeMatchHud');
    if (!hud) {
      hud = new Node('RuntimeMatchHud');
      hud.layer = this.canvas.layer;
      this.canvas.addChild(hud);
      const size = this.canvas.getComponent(UITransform)?.contentSize;
      hud.addComponent(UITransform).setContentSize(size?.width || 390, size?.height || 844);
      hud.addComponent(Graphics);
      hud.setPosition(0, 0);
    }
    return hud;
  }

  private createHudLabel(parent: Node, name: string, text: string, x: number, y: number, fontSize: number, color: Color, align: number): Label {
    const node = new Node(name);
    node.layer = parent.layer;
    parent.addChild(node);
    node.setPosition(x, y);
    node.addComponent(UITransform).setContentSize(118, 24);
    const label = node.addComponent(Label);
    label.string = text;
    label.fontSize = fontSize;
    label.lineHeight = fontSize + 4;
    label.cacheMode = Label.CacheMode.NONE;
    label.horizontalAlign = align;
    label.verticalAlign = Label.VerticalAlign.CENTER;
    label.color = color;
    return label;
  }

  private drawAimIndicator(): void {
    if (!this.dragActor || !this.dragStart || !this.dragNow) {
      this.aimGraphics?.clear();
      return;
    }
    const dx = this.dragStart.x - this.dragNow.x;
    const dy = this.dragStart.y - this.dragNow.y;
    const rawLen = Math.sqrt(dx * dx + dy * dy);
    const len = Math.min(rawLen, MAX_DRAG_DISTANCE);
    const g = this.getAimGraphics();
    if (!g || rawLen <= this.dragActor.radius) {
      this.aimGraphics?.clear();
      return;
    }
    const power = clamp((len - this.dragActor.radius) / (MAX_DRAG_DISTANCE - this.dragActor.radius), 0, 1);
    const scaledLayers = clamp(power * AIM_LAYER_COUNT, 0, AIM_LAYER_COUNT);
    const layerCount = Math.max(1, Math.ceil(scaledLayers));
    const outerLayerFraction = scaledLayers % 1 || 1;
    const innerLongRadius = this.dragActor.radius + 0.5;
    const innerShortRadius = this.dragActor.radius + 0.5;
    const outerLongRadius = innerLongRadius + (layerCount - 1 + outerLayerFraction) * AIM_LAYER_LONG_WIDTH;
    const curveAngleRad = this.curveAngleFromSecondTouch(rawLen);
    const nx = dx / (rawLen || 1);
    const ny = dy / (rawLen || 1);

    g.clear();
    g.node.setPosition(this.dragActor.x, this.dragActor.y);
    g.node.angle = 0;
    for (let layer = layerCount; layer >= 1; layer--) {
      const widthRatio = layer === layerCount ? outerLayerFraction : 1;
      const longRadius = innerLongRadius + (layer - 1 + widthRatio) * AIM_LAYER_LONG_WIDTH;
      const shortRadius = innerShortRadius + (longRadius - innerLongRadius) * AIM_LAYER_RATIO;
      const t = (AIM_LAYER_COUNT - layerCount + layer - 1) / (AIM_LAYER_COUNT - 1);
      g.fillColor = rgba(
        255,
        Math.round(88 + 88 * t),
        Math.round(16 + 56 * t),
        Math.round(170 - 70 * t),
      );
      this.fillRotatedEllipse(g, 0, 0, longRadius, shortRadius, nx, ny);
      g.fill();
    }

    const start = this.dragActor.radius + 8;
    const lineEnd = outerLongRadius * 2;
    const dotSpacing = 15;
    const path = this.buildReflectedAimPath(start, lineEnd, curveAngleRad, nx, ny);
    if (Math.abs(curveAngleRad) > 0.03) {
      this.drawAimDots(g, path, dotSpacing);
      return;
    }
    this.drawAimDots(g, path, dotSpacing);
  }

  private curveAngleFromSecondTouch(rawLen: number): number {
    if (!this.dragActor || !this.dragStart || !this.dragNow || rawLen <= this.dragActor.radius) return 0;
    const signedOffset = this.curveCurrentOffset;
    if (Math.abs(signedOffset) <= CURVE_INPUT_DEADZONE) return 0;
    const curve = clamp((Math.abs(signedOffset) - CURVE_INPUT_DEADZONE) / Math.max(1, rawLen * 0.45), 0, 1);
    return signedOffset >= 0 ? curve * MAX_CURVE_ANGLE : -curve * MAX_CURVE_ANGLE;
  }

  private updateCurveOffsetFromTouch(): void {
    if (!this.dragStart || !this.dragNow || !this.curveTouchStart || !this.curveTouchPoint) return;
    const dx = this.dragStart.x - this.dragNow.x;
    const dy = this.dragStart.y - this.dragNow.y;
    const rawLen = Math.sqrt(dx * dx + dy * dy);
    if (rawLen <= this.dragActor!.radius) return;
    const ux = (this.dragStart.x - this.dragNow.x) / rawLen;
    const uy = (this.dragStart.y - this.dragNow.y) / rawLen;
    const perpX = -uy;
    const perpY = ux;
    const sx = this.curveTouchPoint.x - this.curveTouchStart.x;
    const sy = this.curveTouchPoint.y - this.curveTouchStart.y;
    this.curveCurrentOffset = this.curveBaseOffset + sx * perpX + sy * perpY;
  }

  private curveDistanceForShot(power: number): number {
    const aimRadius = this.dragActor ? this.dragActor.radius + power * (MAX_DRAG_DISTANCE - this.dragActor.radius) : MAX_DRAG_DISTANCE;
    return Math.max(CURVE_MIN_DISTANCE, aimRadius * 2);
  }

  private buildReflectedAimPath(start: number, end: number, angleRad: number, nx: number, ny: number): Vec2[] {
    if (!this.dragActor) return [];
    if (Math.abs(angleRad) < 0.03) return this.buildStraightReflectedAimPath(start, end, nx, ny);
    const step = 5;
    const path: Vec2[] = [];
    let previousIdeal = localAimPoint(start, end, angleRad);
    let simulated = new Vec2(
      this.dragActor.x + previousIdeal.x * nx - previousIdeal.y * ny,
      this.dragActor.y + previousIdeal.x * ny + previousIdeal.y * nx,
    );
    const firstAdvance = this.advanceAimSegment(new Vec2(this.dragActor.x, this.dragActor.y), simulated.x - this.dragActor.x, simulated.y - this.dragActor.y, true);
    simulated = firstAdvance.point;
    path.push(new Vec2(simulated.x - this.dragActor.x, simulated.y - this.dragActor.y));
    let reflected = firstAdvance.reflected;
    let reflectDirX = firstAdvance.nextVx;
    let reflectDirY = firstAdvance.nextVy;
    for (let d = start; d <= end; d += step) {
      let worldDx: number;
      let worldDy: number;
      if (reflected) {
        const dirLen = Math.sqrt(reflectDirX * reflectDirX + reflectDirY * reflectDirY) || 1;
        worldDx = reflectDirX / dirLen * step;
        worldDy = reflectDirY / dirLen * step;
      } else {
        const ideal = localAimPoint(Math.min(d, end), end, angleRad);
        const localDx = ideal.x - previousIdeal.x;
        const localDy = ideal.y - previousIdeal.y;
        worldDx = localDx * nx - localDy * ny;
        worldDy = localDx * ny + localDy * nx;
        previousIdeal = ideal;
      }
      const advanced = this.advanceAimSegment(simulated, worldDx, worldDy, true);
      simulated = advanced.point;
      reflected = reflected || advanced.reflected;
      reflectDirX = advanced.nextVx;
      reflectDirY = advanced.nextVy;
      path.push(new Vec2(simulated.x - this.dragActor.x, simulated.y - this.dragActor.y));
    }
    return path;
  }

  private buildStraightReflectedAimPath(start: number, end: number, nx: number, ny: number): Vec2[] {
    if (!this.dragActor) return [];
    const path: Vec2[] = [];
    const step = 5;
    let current = new Vec2(this.dragActor.x + nx * start, this.dragActor.y + ny * start);
    current = this.clampAimPoint(current);
    path.push(new Vec2(current.x - this.dragActor.x, current.y - this.dragActor.y));
    let vx = nx * step;
    let vy = ny * step;
    for (let d = start + step; d <= end; d += step) {
      const advanced = this.advanceAimSegment(current, vx, vy, true);
      current = advanced.point;
      vx = advanced.nextVx;
      vy = advanced.nextVy;
      path.push(new Vec2(current.x - this.dragActor.x, current.y - this.dragActor.y));
    }
    return path;
  }

  private advanceAimSegment(from: Vec2, dx: number, dy: number, allowGoalMouth: boolean): { point: Vec2; nextVx: number; nextVy: number; reflected: boolean } {
    if (!this.dragActor) return { point: new Vec2(from.x + dx, from.y + dy), nextVx: dx, nextVy: dy, reflected: false };
    let x = from.x;
    let y = from.y;
    let vx = dx;
    let vy = dy;
    let nextVx = dx;
    let nextVy = dy;
    let reflectedAny = false;
    for (let i = 0; i < 4; i += 1) {
      const hit = this.firstAimBoundaryHit(x, y, vx, vy, allowGoalMouth);
      if (!hit) {
        x += vx;
        y += vy;
        break;
      }
      const hitX = x + vx * hit.t;
      const hitY = y + vy * hit.t;
      const remaining = 1 - hit.t;
      x = hitX;
      y = hitY;
      if (hit.axis === 'x') {
        vx = -vx;
        nextVx = -nextVx;
      } else {
        vy = -vy;
        nextVy = -nextVy;
      }
      vx *= remaining;
      vy *= remaining;
      reflectedAny = true;
    }
    const point = this.clampAimPoint(new Vec2(x, y));
    return { point, nextVx, nextVy, reflected: reflectedAny };
  }

  private firstAimBoundaryHit(x: number, y: number, vx: number, vy: number, allowGoalMouth: boolean): { t: number; axis: 'x' | 'y' } | null {
    if (!this.dragActor) return null;
    const radius = this.dragActor.radius;
    const sideBounds = this.aimBounds(x, radius, allowGoalMouth);
    let bestT = Number.POSITIVE_INFINITY;
    let bestAxis: 'x' | 'y' | null = null;
    if (vx < 0) {
      const t = (sideBounds.left - x) / vx;
      if (t >= 0 && t <= 1 && t < bestT) {
        bestT = t;
        bestAxis = 'x';
      }
    } else if (vx > 0) {
      const t = (sideBounds.right - x) / vx;
      if (t >= 0 && t <= 1 && t < bestT) {
        bestT = t;
        bestAxis = 'x';
      }
    }
    if (vy < 0) {
      const t = this.firstVerticalBoundaryTime(x, y, vx, vy, radius, false, allowGoalMouth);
      if (t !== null && t < bestT) {
        bestT = t;
        bestAxis = 'y';
      }
    } else if (vy > 0) {
      const t = this.firstVerticalBoundaryTime(x, y, vx, vy, radius, true, allowGoalMouth);
      if (t !== null && t < bestT) {
        bestT = t;
        bestAxis = 'y';
      }
    }
    return bestAxis ? { t: Math.max(0, Math.min(1, bestT)), axis: bestAxis } : null;
  }

  private firstVerticalBoundaryTime(x: number, y: number, vx: number, vy: number, radius: number, topSide: boolean, allowGoalMouth: boolean): number | null {
    const goalLine = topSide ? this.goalLineY - radius : -this.goalLineY + radius;
    const backLine = topSide ? this.fieldHeight / 2 : -this.fieldHeight / 2;
    const candidates: Array<{ t: number; isBackLine: boolean }> = [];
    const goalT = (goalLine - y) / vy;
    if (goalT >= 0 && goalT <= 1) candidates.push({ t: goalT, isBackLine: false });
    const backT = (backLine - y) / vy;
    if (backT >= 0 && backT <= 1) candidates.push({ t: backT, isBackLine: true });
    candidates.sort((a, b) => a.t - b.t);
    for (const candidate of candidates) {
      const t = candidate.t;
      const hitX = x + vx * t;
      const canEnterGoal = allowGoalMouth && Math.abs(hitX) <= GOAL_HALF_WIDTH - radius;
      if (canEnterGoal && !candidate.isBackLine) continue;
      return t;
    }
    return null;
  }

  private aimBounds(x: number, radius: number, allowGoalMouth: boolean): { left: number; right: number; top: number; bottom: number } {
    const left = -this.fieldWidth / 2 + WALL_INSET + radius;
    const right = this.fieldWidth / 2 - WALL_INSET - radius;
    const insideGoalMouth = allowGoalMouth && Math.abs(x) <= GOAL_HALF_WIDTH - radius;
    return {
      left,
      right,
      top: insideGoalMouth ? this.fieldHeight / 2 : this.goalLineY - radius,
      bottom: insideGoalMouth ? -this.fieldHeight / 2 : -this.goalLineY + radius,
    };
  }

  private clampAimPoint(point: Vec2): Vec2 {
    if (!this.dragActor) return point;
    const bounds = this.aimBounds(point.x, this.dragActor.radius, true);
    return new Vec2(clamp(point.x, bounds.left, bounds.right), clamp(point.y, bounds.bottom, bounds.top));
  }

  private drawAimDots(g: Graphics, path: Vec2[], spacing: number): void {
    if (path.length < 2) return;
    const totalLength = pathLength(path);
    let traveled = 0;
    let distanceToNextDot = 0;
    let last = path[0];
    for (let i = 1; i < path.length; i += 1) {
      const current = path[i];
      let segmentDx = current.x - last.x;
      let segmentDy = current.y - last.y;
      let segmentLength = Math.sqrt(segmentDx * segmentDx + segmentDy * segmentDy);
      while (segmentLength > 0.001) {
        const take = Math.min(segmentLength, distanceToNextDot);
        const t = take / segmentLength;
        const next = new Vec2(last.x + segmentDx * t, last.y + segmentDy * t);
        last = next;
        segmentLength -= take;
        segmentDx = current.x - last.x;
        segmentDy = current.y - last.y;
        if (distanceToNextDot <= take + 0.001) {
          traveled += take;
          this.drawAimDot(g, last.x, last.y, traveled, totalLength);
          distanceToNextDot = spacing;
        } else {
          traveled += take;
          distanceToNextDot -= take;
        }
      }
      last = current;
    }
  }

  private drawAimDot(g: Graphics, x: number, y: number, traveled: number, totalLength: number): void {
    const t = totalLength > 0 ? clamp(traveled / totalLength, 0, 1) : 0;
    const radius = 4.5 - 2.2 * t;
    g.fillColor = rgba(255, 255, 255, 255);
    g.strokeColor = rgba(0, 0, 0, 210);
    g.lineWidth = 1.2;
    g.circle(x, y, radius);
    g.fill();
    g.stroke();
  }

  private fillRotatedEllipse(g: Graphics, cx: number, cy: number, longRadius: number, shortRadius: number, nx: number, ny: number): void {
    const segments = 56;
    for (let i = 0; i <= segments; i += 1) {
      const angle = (i / segments) * Math.PI * 2;
      const localX = Math.cos(angle) * longRadius;
      const localY = Math.sin(angle) * shortRadius;
      const x = cx + localX * nx - localY * ny;
      const y = cy + localX * ny + localY * nx;
      if (i === 0) g.moveTo(x, y);
      else g.lineTo(x, y);
    }
    g.close();
  }

  private matchLineup(side: TeamSide): Array<RosterPlayer | null> {
    if (this.replayMode || this.usesServerLineup()) {
      return side === 'home' ? this.singleMatchHomeLineup : this.singleMatchAwayLineup;
    }
    return side === 'home' ? getLineupPlayers() : [];
  }

  private usesServerLineup(): boolean {
    return (this.mode === 'ai' && this.singleMatchServerReady) || (this.mode === 'online' && !!this.onlineMatch);
  }

  private applyOnlineMatchData(): void {
    if (!this.onlineMatch) return;
    this.activeMatchId = this.onlineMatch.matchId || MATCH_ID;
    this.onlineInitialTurn = this.onlineMatch.initialTurn === 'away' ? 'away' : 'home';
    this.singleMatchHomeFormationId = this.onlineMatch.homeFormationId || '';
    this.singleMatchAwayFormationId = this.onlineMatch.awayFormationId || '';
    this.singleMatchHomeLineup = normalizeLineup(this.onlineMatch.homeLineup);
    this.singleMatchAwayLineup = normalizeLineup(this.onlineMatch.awayLineup);
    this.onlineInitialSnapshot = this.onlineMatch.snapshot ? this.snapshotInLocalField(this.onlineMatch.snapshot) : null;
  }

  private onlineInitialLocalTurn(): TeamSide {
    if (this.mode !== 'online') return 'home';
    return this.onlineInitialTurn;
  }

  private resetOnlineObjectsFromInitialSnapshot(startingTurn: TeamSide): boolean {
    if (!this.onlineInitialSnapshot) return false;
    const template = this.onlineInitialSnapshot;
    this.clearDragAim();
    this.activeCurves.clear();
    this.physicsAccumulator = 0;
    this.ball = { ...template.ball, vx: 0, vy: 0 };
    this.ballSpinDeg = 0;
    this.players = (template.players || []).map((player) => ({ ...player, vx: 0, vy: 0 }));
    this.turn = startingTurn;
    this.resolveAllCollisions();
    this.syncNodes();
    return true;
  }

  private applyServerClock(matchRemaining: number, turnRemaining: number, turn: TeamSide, controlEnabled: boolean): void {
    if (this.mode !== 'online') return;
    this.matchRemaining = Math.max(0, matchRemaining);
    this.turnRemaining = Math.max(0, turnRemaining);
    if (!this.penaltyShootout && controlEnabled) this.turn = turn;
    this.onlineControlEnabled = controlEnabled && turn === 'home' && this.isSettled() && this.goalCelebrationRemaining <= 0 && !this.matchEnded;
  }

  private hideRuntimeMatchObjects(): void {
    for (let index = 1; index <= 5; index += 1) {
      const home = findNode(this.canvas, `Player_home-${index}`);
      const away = findNode(this.canvas, `Player_away-${index}`);
      if (home) home.active = false;
      if (away) away.active = false;
    }
    const ball = findNode(this.canvas, 'Ball');
    if (ball) ball.active = false;
  }

  private flushSingleMatchSettlementValidation(): void {
    if (this.mode !== 'ai' || this.matchEnded || !this.singleMatchServerReady || !this.singleMatchValidationPending || this.singleMatchValidationInFlight) return;
    if (!this.isSettled()) return;
    this.singleMatchValidationInFlight = true;
    const snapshot = this.createSnapshot();
    void validateSingleMatchSnapshot(this.activeMatchId, snapshot, 'settled')
      .then((response) => {
        if (!response.ok || !response.valid) {
          this.forceServerForfeit(response.message || '服务端校验失败');
          return;
        }
        this.singleMatchValidationPending = false;
      })
      .catch(() => this.forceServerForfeit('无法向后端提交停止快照'))
      .then(() => {
        this.singleMatchValidationInFlight = false;
      });
  }

  private syncSingleMatchKickoffReset(): void {
    if (this.mode !== 'ai' || !this.singleMatchServerReady) return;
    void validateSingleMatchSnapshot(this.activeMatchId, this.createSnapshot(), 'kickoff-reset').catch(() => undefined);
  }

  private requestServerPenaltyKeeperMove(): void {
    if (!this.singleMatchServerReady || this.singleMatchAiKeeperInFlight) return;
    this.singleMatchAiKeeperInFlight = true;
    void requestSingleMatchAiKeeper(this.activeMatchId)
      .then((response) => {
        if (response.ok) this.penaltyKeeperPendingDirection = response.direction;
      })
      .catch(() => undefined)
      .then(() => {
        this.singleMatchAiKeeperInFlight = false;
      });
  }

  private flushSingleMatchFinish(): void {
    if (this.mode !== 'ai' || !this.singleMatchServerReady || !this.matchEnded || !this.victorySide || this.singleMatchFinishSent) return;
    this.singleMatchFinishSent = true;
    const duration = Math.max(0, Math.round(MATCH_SECONDS - this.matchRemaining));
    const result = this.victorySide === 'home' ? 'win' : 'lose';
    const localScoreText = this.penaltyShootout
      ? `${this.score.home + this.penaltyScore.home}（${this.penaltyScore.home}）：${this.score.away + this.penaltyScore.away}（${this.penaltyScore.away}）`
      : `${this.score.home} : ${this.score.away}`;
    void finishSingleMatch(this.activeMatchId, duration, { ...this.score }, result, localScoreText)
      .then((response) => {
        if (response.settlement) {
          this.singleMatchSettlement = response.settlement;
          this.clearVictoryRuntimeNodes();
        }
      })
      .catch(() => undefined);
  }

  private flushOnlineMatchSettlement(): void {
    if (this.mode !== 'online' || !this.matchEnded || !this.victorySide || this.singleMatchSettlement || this.onlineSettlementInFlight || !this.onlineMatch?.requestId) return;
    const now = Date.now();
    if (now < this.onlineSettlementNextRetryAt) return;
    this.onlineSettlementInFlight = true;
    void fetchOnlineSettlement(this.activeMatchId, this.onlineMatch.requestId)
      .then((response) => {
        if (response.ok && response.settlement) {
          this.singleMatchSettlement = response.settlement;
          this.clearVictoryRuntimeNodes();
          return;
        }
        this.onlineSettlementNextRetryAt = Date.now() + 1000;
      })
      .catch(() => {
        this.onlineSettlementNextRetryAt = Date.now() + 1000;
      })
      .then(() => {
        this.onlineSettlementInFlight = false;
      });
  }

  private forceServerForfeit(message: string, finalScore: ScoreState | null = null): void {
    void message;
    if (this.matchEnded) return;
    if (this.mode === 'online') {
      this.queueOnlineFinish('away', finalScore);
      return;
    }
    this.clearDragAim();
    this.goalCelebrationRemaining = 0;
    this.goalCelebrationElapsed = 0;
    this.victorySide = 'away';
    this.matchEnded = true;
    this.turnRemaining = 0;
    if (this.score.away <= this.score.home) this.score.away = this.score.home + 1;
    if (this.mode !== 'online') this.emitMatchEvent({ type: 'match-end', side: 'away' });
  }

  private forceServerVictory(message: string, finalScore: ScoreState | null = null): void {
    void message;
    if (this.matchEnded) return;
    if (this.mode === 'online') {
      this.queueOnlineFinish('home', finalScore);
      return;
    }
    this.clearDragAim();
    this.goalCelebrationRemaining = 0;
    this.goalCelebrationElapsed = 0;
    this.victorySide = 'home';
    this.matchEnded = true;
    this.turnRemaining = 0;
    if (this.score.home <= this.score.away) this.score.home = this.score.away + 1;
    if (this.mode !== 'online') this.emitMatchEvent({ type: 'match-end', side: 'home' });
  }

  private queueOnlineFinish(winner: TeamSide, finalScore: ScoreState | null): void {
    this.pendingOnlineFinishSide = winner;
    if (finalScore) this.pendingOnlineFinalScore = { ...finalScore };
    this.onlineControlEnabled = false;
    this.clearDragAim();
    if (this.goalCelebrationRemaining > 0 || !this.isSettled()) return;
    this.startOnlineFinishAnimation();
  }

  private startOnlineFinishAnimation(): void {
    const winner = this.pendingOnlineFinishSide;
    if (!winner || this.matchEnded) return;
    if (this.pendingOnlineFinalScore) {
      this.score = { ...this.pendingOnlineFinalScore };
    } else if (winner === 'home' && this.score.home <= this.score.away) {
      this.score.home = this.score.away + 1;
    } else if (winner === 'away' && this.score.away <= this.score.home) {
      this.score.away = this.score.home + 1;
    }
    this.pendingOnlineFinishSide = null;
    this.pendingOnlineFinalScore = null;
    this.victorySide = winner;
    this.celebrationKind = 'matchEnd';
    this.goalCelebrationRemaining = GOAL_CELEBRATION_SECONDS;
    this.goalCelebrationElapsed = 0;
    this.turnRemaining = 0;
    this.clearDragAim();
  }

  private createFastSettlementPreview(): MatchSettlementPreview | null {
    if (this.penaltyShootout) return null;
    const players: PlayerDiskState[] = this.players.map((player) => ({ ...player }));
    const ball: BallState = { ...this.ball };
    const curves = new Map<string, CurveMotion>();
    this.activeCurves.forEach((curve, id) => curves.set(id, { ...curve }));
    const score = { ...this.score };
    let tick = this.tickIndex;
    const maxSteps = Math.round(18 / FIXED_PHYSICS_DT);
    for (let step = 0; step < maxSteps; step += 1) {
      const bodies: DiscBodyState[] = [...players, ball];
      for (const body of bodies) this.integrateFastBody(body, FIXED_PHYSICS_DT, curves);
      this.resolveFastCollisions(bodies, curves);
      const goalSide = this.detectFastGoal(ball);
      tick += 1;
      if (goalSide) {
        score[goalSide] += 1;
        ball.vx = 0;
        ball.vy = 0;
        curves.delete(ball.id);
        const actorId = this.lastShotActorId || `${goalSide}-1`;
        return {
          event: this.createMatchEventPayload({
            type: 'goal',
            side: goalSide,
            actorId,
            matchSecond: Math.round(MATCH_SECONDS - this.matchRemaining),
            penalty: false,
            ownGoal: !!this.lastShotActorId && !this.lastShotActorId.startsWith(goalSide),
          }),
        };
      }
      if (step > 12 && this.fastBodiesSettled(bodies)) break;
    }
    return {
      snapshot: {
        matchId: this.activeMatchId,
        mode: this.mode,
        fieldWidth: this.fieldWidth,
        fieldHeight: this.fieldHeight,
        tick,
        turn: this.turn,
        score,
        players,
        ball,
      },
    };
  }

  private integrateFastBody(body: DiscBodyState, dt: number, curves: Map<string, CurveMotion>): void {
    const speedBeforeDamping = Math.sqrt(body.vx * body.vx + body.vy * body.vy);
    this.applyFastCurveMotion(body, dt, speedBeforeDamping, curves);
    body.x += body.vx * dt;
    body.y += body.vy * dt;
    const damping = Math.exp(-this.effectiveFriction(body, speedBeforeDamping) * dt);
    body.vx *= damping;
    body.vy *= damping;
    const stopSpeed = body.kind === 'ball' ? BALL_STOP_SPEED : PLAYER_STOP_SPEED;
    if (Math.sqrt(body.vx * body.vx + body.vy * body.vy) < stopSpeed) {
      body.vx = 0;
      body.vy = 0;
      curves.delete(body.id);
    }
  }

  private applyFastCurveMotion(body: DiscBodyState, dt: number, speed: number, curves: Map<string, CurveMotion>): void {
    if (body.kind !== 'player' || speed <= 0) return;
    const curve = curves.get(body.id);
    if (!curve) return;
    const travel = Math.min(speed * dt, curve.remainingDistance);
    if (travel <= 0) {
      curves.delete(body.id);
      return;
    }
    const angleStep = curve.remainingAngle * (travel / curve.remainingDistance);
    const cos = Math.cos(angleStep);
    const sin = Math.sin(angleStep);
    const vx = body.vx;
    const vy = body.vy;
    body.vx = vx * cos - vy * sin;
    body.vy = vx * sin + vy * cos;
    curve.remainingAngle -= angleStep;
    curve.remainingDistance -= travel;
    if (Math.abs(curve.remainingAngle) < 0.01 || curve.remainingDistance <= 1) curves.delete(body.id);
  }

  private resolveFastCollisions(bodies: DiscBodyState[], curves: Map<string, CurveMotion>): void {
    for (let iteration = 0; iteration < SOLVER_ITERATIONS; iteration += 1) {
      for (const body of bodies) this.collideFastArena(body, curves);
      for (let i = 0; i < bodies.length; i += 1) {
        for (let j = i + 1; j < bodies.length; j += 1) this.collideFastBodies(bodies[i], bodies[j], curves);
      }
    }
  }

  private collideFastArena(body: DiscBodyState, curves: Map<string, CurveMotion>): void {
    const left = -this.fieldWidth / 2 + WALL_INSET + body.radius;
    const right = this.fieldWidth / 2 - WALL_INSET - body.radius;
    let collided = false;
    if (body.x < left) {
      body.x = left;
      body.vx = Math.abs(body.vx) * this.wallRestitution(body);
      collided = true;
    }
    if (body.x > right) {
      body.x = right;
      body.vx = -Math.abs(body.vx) * this.wallRestitution(body);
      collided = true;
    }
    const topLimit = this.bodyInsideGoalMouth(body) ? this.fieldHeight / 2 - body.radius : this.goalLineY - body.radius;
    const bottomLimit = this.bodyInsideGoalMouth(body) ? -this.fieldHeight / 2 + body.radius : -this.goalLineY + body.radius;
    if (body.y > topLimit) {
      body.y = topLimit;
      body.vy = -Math.abs(body.vy) * this.wallRestitution(body);
      collided = true;
    }
    if (body.y < bottomLimit) {
      body.y = bottomLimit;
      body.vy = Math.abs(body.vy) * this.wallRestitution(body);
      collided = true;
    }
    if (this.collideFastCornerCushions(body)) collided = true;
    if (collided) curves.delete(body.id);
    if (body.kind === 'ball') {
      const top = this.goalLineY;
      const bottom = -this.goalLineY;
      this.collideFastGoalPost(body, -GOAL_HALF_WIDTH, top);
      this.collideFastGoalPost(body, GOAL_HALF_WIDTH, top);
      this.collideFastGoalPost(body, -GOAL_HALF_WIDTH, bottom);
      this.collideFastGoalPost(body, GOAL_HALF_WIDTH, bottom);
    }
  }

  private collideFastGoalPost(body: DiscBodyState, x: number, y: number): void {
    const postRadius = 5;
    const dx = body.x - x;
    const dy = body.y - y;
    const min = body.radius + postRadius;
    const dSq = dx * dx + dy * dy;
    if (dSq >= min * min) return;
    const d = Math.sqrt(dSq) || 0.0001;
    const nx = dx / d;
    const ny = dy / d;
    body.x += nx * (min - d);
    body.y += ny * (min - d);
    const vn = body.vx * nx + body.vy * ny;
    if (vn < 0) {
      const bounce = 1 + this.wallRestitution(body);
      body.vx -= bounce * vn * nx;
      body.vy -= bounce * vn * ny;
    }
  }

  private collideFastCornerCushions(body: DiscBodyState): boolean {
    let collided = false;
    const halfW = this.fieldWidth / 2;
    const top = this.goalLineY;
    const bottom = -this.goalLineY;
    const corners = [
      { x: -halfW, y: top, sx: -1, sy: 1 },
      { x: halfW, y: top, sx: 1, sy: 1 },
      { x: -halfW, y: bottom, sx: -1, sy: -1 },
      { x: halfW, y: bottom, sx: 1, sy: -1 },
    ];
    for (const corner of corners) {
      const dx = body.x - corner.x;
      const dy = body.y - corner.y;
      if (dx * corner.sx > 0 || dy * corner.sy > 0) continue;
      const min = CORNER_CUSHION_RADIUS + body.radius;
      const dSq = dx * dx + dy * dy;
      if (dSq >= min * min) continue;
      const d = Math.sqrt(dSq) || 0.0001;
      const nx = dx / d;
      const ny = dy / d;
      body.x += nx * (min - d);
      body.y += ny * (min - d);
      const vn = body.vx * nx + body.vy * ny;
      if (vn < 0) {
        const bounce = 1 + CORNER_CUSHION_RESTITUTION;
        body.vx -= bounce * vn * nx;
        body.vy -= bounce * vn * ny;
      }
      collided = true;
    }
    return collided;
  }

  private collideFastBodies(a: DiscBodyState, b: DiscBodyState, curves: Map<string, CurveMotion>): void {
    let dx = b.x - a.x;
    let dy = b.y - a.y;
    let d = Math.sqrt(dx * dx + dy * dy);
    const min = a.radius + b.radius;
    if (d >= min) return;
    if (d < 0.0001) {
      d = 0.0001;
      dx = 1;
      dy = 0;
    }
    const nx = dx / d;
    const ny = dy / d;
    const invA = 1 / a.mass;
    const invB = 1 / b.mass;
    const invTotal = invA + invB;
    const correction = (min - d) / invTotal;
    a.x -= nx * correction * invA;
    a.y -= ny * correction * invA;
    b.x += nx * correction * invB;
    b.y += ny * correction * invB;
    curves.delete(a.id);
    curves.delete(b.id);
    const relVx = b.vx - a.vx;
    const relVy = b.vy - a.vy;
    const relNormalSpeed = relVx * nx + relVy * ny;
    if (relNormalSpeed > 0) return;
    const restitution = this.collisionRestitution(a, b);
    const impulse = (-(1 + restitution) * relNormalSpeed) / invTotal;
    a.vx -= impulse * invA * nx;
    a.vy -= impulse * invA * ny;
    b.vx += impulse * invB * nx;
    b.vy += impulse * invB * ny;
  }

  private detectFastGoal(ball: BallState): TeamSide | null {
    if (Math.abs(ball.x) > GOAL_HALF_WIDTH - ball.radius) return null;
    if (ball.y > this.goalLineY + ball.radius) return 'home';
    if (ball.y < -this.goalLineY - ball.radius) return 'away';
    return null;
  }

  private fastBodiesSettled(bodies: DiscBodyState[]): boolean {
    return bodies.every((body) => Math.abs(body.vx) + Math.abs(body.vy) < 1);
  }

  dispose(): void {
    if (this.mode === 'ai' && !this.replayMode && this.singleMatchServerReady && !this.singleMatchFinishSent && this.activeMatchId !== MATCH_ID) {
      void abandonSingleMatch(this.activeMatchId).catch(() => undefined);
    }
    this.transport.disconnect();
    this.clearDragAim();
    this.fieldGraphics = null;
    if (this.aimGraphics?.node?.isValid) this.aimGraphics.node.destroy();
    this.aimGraphics = null;
  }

  private clearDragAim(): void {
    this.dragActor = null;
    this.dragStart = null;
    this.dragNow = null;
    this.powerTouchId = null;
    this.curveTouchId = null;
    this.curveTouchStart = null;
    this.curveTouchPoint = null;
    this.curveBaseOffset = 0;
    this.curveCurrentOffset = 0;
    this.aimGraphics?.clear();
  }

  private isSettled(): boolean {
    return this.bodies.every((b) => Math.abs(b.vx) + Math.abs(b.vy) < 1);
  }

  private createSnapshot(): MatchSnapshot {
    return {
      matchId: this.activeMatchId,
      mode: this.mode,
      fieldWidth: this.fieldWidth,
      fieldHeight: this.fieldHeight,
      tick: this.tickIndex,
      turn: this.turn,
      score: { ...this.score },
      players: this.players.map((p) => ({ ...p })),
      ball: { ...this.ball },
    };
  }

  private applySnapshot(snapshot: MatchSnapshot): void {
    const localSnapshot = this.snapshotInLocalField(snapshot);
    if (localSnapshot.matchId !== this.activeMatchId && localSnapshot.matchId !== MATCH_ID) return;
    this.tickIndex = Math.max(this.tickIndex, localSnapshot.tick);
    this.turn = localSnapshot.turn;
    this.score = { ...localSnapshot.score };
    for (const incoming of localSnapshot.players) {
      const current = this.players.find((p) => p.id === incoming.id);
      if (current) Object.assign(current, incoming);
      else this.players.push({ ...incoming });
    }
    this.ball = { ...localSnapshot.ball };
    this.activeCurves.clear();
    this.physicsAccumulator = 0;
    this.syncNodes();
  }

  private snapshotInLocalField(snapshot: MatchSnapshot): MatchSnapshot {
    const localWidth = this.fieldWidth;
    const localHeight = this.fieldHeight;
    const sourceWidth = snapshot.fieldWidth > 0 ? snapshot.fieldWidth : localWidth;
    const sourceHeight = snapshot.fieldHeight > 0 ? snapshot.fieldHeight : localHeight;
    const scaleX = localWidth / sourceWidth;
    const scaleY = localHeight / sourceHeight;
    const scaleBody = <T extends DiscBodyState>(body: T): T => ({
      ...body,
      x: body.x * scaleX,
      y: body.y * scaleY,
      vx: body.vx * scaleX,
      vy: body.vy * scaleY,
    }) as T;
    return {
      ...cloneSnapshot(snapshot),
      fieldWidth: localWidth,
      fieldHeight: localHeight,
      players: (snapshot.players || []).map((player) => scaleBody(player)),
      ball: scaleBody(snapshot.ball),
    };
  }

  private emitMatchEvent(event: Pick<MatchEvent, 'type' | 'side' | 'actorId' | 'matchSecond' | 'penalty' | 'ownGoal'>): void {
    if (this.replayMode) return;
    if (this.mode === 'online' && event.type === 'shoot') return;
    if (this.mode === 'online' && event.type === 'match-end') return;
    const payload = this.createMatchEventPayload(event);
    void this.transport.submitMatchEvent(payload).catch(() => undefined);
    if (this.mode === 'ai' && this.singleMatchServerReady) {
      void sendSingleMatchEvent(this.activeMatchId, payload).catch(() => undefined);
    }
  }

  private createMatchEventPayload(event: Pick<MatchEvent, 'type' | 'side' | 'actorId' | 'matchSecond' | 'penalty' | 'ownGoal'>): MatchEvent {
    return {
      eventId: nextId(event.type),
      matchId: this.activeMatchId,
      tick: this.tickIndex,
      score: { ...this.score },
      clientTick: Date.now(),
      ...event,
    };
  }

  private strokeLine(g: Graphics, x1: number, y1: number, x2: number, y2: number, c: Color, width: number): void {
    g.strokeColor = c;
    g.lineWidth = width;
    g.moveTo(x1, y1);
    g.lineTo(x2, y2);
    g.stroke();
  }

  private strokeRect(g: Graphics, x: number, y: number, w: number, h: number, c: Color, width: number): void {
    g.strokeColor = c;
    g.lineWidth = width;
    g.rect(x, y, w, h);
    g.stroke();
  }

  private wallRestitution(b: DiscBodyState): number {
    return b.kind === 'ball' ? 0.86 : 0.58;
  }

  private bodyInsideGoalMouth(b: DiscBodyState): boolean {
    return Math.abs(b.x) <= GOAL_HALF_WIDTH - b.radius;
  }

  private collisionRestitution(a: DiscBodyState, b: DiscBodyState): number {
    if (a.kind === 'player' && b.kind === 'player') return 0.98;
    if (a.kind !== b.kind) return 0.88;
    return Math.min(a.restitution, b.restitution);
  }

  private layoutGoalWalls(): void {
    const wallWidth = (this.fieldWidth - GOAL_HALF_WIDTH * 2) / 2;
    const leftX = -GOAL_HALF_WIDTH - wallWidth / 2;
    const rightX = GOAL_HALF_WIDTH + wallWidth / 2;
    this.layoutBlock('TopWallLeft', leftX, this.goalLineY + GOAL_DEPTH / 2, wallWidth, GOAL_DEPTH);
    this.layoutBlock('TopWallRight', rightX, this.goalLineY + GOAL_DEPTH / 2, wallWidth, GOAL_DEPTH);
    this.layoutBlock('BottomWallLeft', leftX, -this.goalLineY - GOAL_DEPTH / 2, wallWidth, GOAL_DEPTH);
    this.layoutBlock('BottomWallRight', rightX, -this.goalLineY - GOAL_DEPTH / 2, wallWidth, GOAL_DEPTH);
  }

  private layoutBlock(name: string, x: number, y: number, w: number, h: number): void {
    const node = findNode(this.canvas, name);
    if (!node) return;
    node.setPosition(x, y);
    node.getComponent(UITransform)?.setContentSize(w, h);
  }

  private drawGoalSideBlocks(g: Graphics, left: number, right: number, top: number, bottom: number, outerTop: number, outerBottom: number): void {
    const block = rgba(24, 43, 55, 255);
    const blockLight = rgba(42, 68, 78, 120);
    g.fillColor = block;
    g.rect(left, top, -GOAL_HALF_WIDTH - left, outerTop - top);
    g.fill();
    g.rect(GOAL_HALF_WIDTH, top, right - GOAL_HALF_WIDTH, outerTop - top);
    g.fill();
    g.rect(left, outerBottom, -GOAL_HALF_WIDTH - left, bottom - outerBottom);
    g.fill();
    g.rect(GOAL_HALF_WIDTH, outerBottom, right - GOAL_HALF_WIDTH, bottom - outerBottom);
    g.fill();

    g.fillColor = blockLight;
    g.rect(left, top, -GOAL_HALF_WIDTH - left, 4);
    g.fill();
    g.rect(GOAL_HALF_WIDTH, top, right - GOAL_HALF_WIDTH, 4);
    g.fill();
  }

  private drawPenaltyAreas(g: Graphics, top: number, bottom: number, c: Color): void {
    const w = PENALTY_HALF_WIDTH;
    const d = PENALTY_DEPTH;
    this.strokeLine(g, -w, top, -w, top - d, c, 2);
    this.strokeLine(g, w, top, w, top - d, c, 2);
    this.strokeLine(g, -w, top - d, w, top - d, c, 2);
    this.strokeLine(g, -w, bottom, -w, bottom + d, c, 2);
    this.strokeLine(g, w, bottom, w, bottom + d, c, 2);
    this.strokeLine(g, -w, bottom + d, w, bottom + d, c, 2);
  }

  private drawGoalNet(g: Graphics, x: number, y: number, w: number, h: number, direction: 1 | -1): void {
    const net = rgba(255, 255, 255, 130);
    const backNet = rgba(255, 255, 255, 92);
    for (let offset = 14; offset < w; offset += 14) {
      this.strokeLine(g, x + offset, y, x + offset, y + h, net, 2);
    }
    for (let offset = 10; offset < h; offset += 10) {
      this.strokeLine(g, x, y + offset, x + w, y + offset, net, 2);
    }
    const backY = direction > 0 ? y + h : y;
    this.strokeLine(g, x, backY, x + w, backY, backNet, 2);
  }

  private drawFenceAndGoals(g: Graphics, left: number, right: number, top: number, bottom: number, outerTop: number, outerBottom: number): void {
    const wall = rgba(252, 255, 248, 248);
    const awayBlue = rgba(54, 137, 244, 255);
    const homeRed = rgba(238, 66, 70, 255);
    const goalLine = rgba(255, 255, 255, 255);
    const wallWidth = 9;
    const goalLineWidth = 8;
    const awayBarWidth = 9;
    const awayPostWidth = 7;
    const homeBarWidth = 9;

    this.fillHorizontalBar(g, left - wallWidth / 2, right + wallWidth / 2, outerTop, wallWidth, wall);
    this.fillHorizontalBar(g, left - wallWidth / 2, right + wallWidth / 2, outerBottom, wallWidth, wall);
    this.fillVerticalBar(g, left, outerBottom - wallWidth / 2, outerTop + wallWidth / 2, wallWidth, wall);
    this.fillVerticalBar(g, right, outerBottom - wallWidth / 2, outerTop + wallWidth / 2, wallWidth, wall);

    this.drawGoalNet(g, -GOAL_HALF_WIDTH, top + 18, GOAL_HALF_WIDTH * 2, GOAL_DEPTH - 20, 1);
    this.drawGoalNet(g, -GOAL_HALF_WIDTH, bottom - GOAL_DEPTH + 2, GOAL_HALF_WIDTH * 2, GOAL_DEPTH - 4, -1);

    this.fillHorizontalBar(g, left - goalLineWidth / 2, right + goalLineWidth / 2, top, goalLineWidth, goalLine);
    this.fillHorizontalBar(g, left - goalLineWidth / 2, right + goalLineWidth / 2, bottom, goalLineWidth, goalLine);

    this.fillVerticalBar(g, -GOAL_HALF_WIDTH, top, top + 14, awayPostWidth, awayBlue);
    this.fillVerticalBar(g, GOAL_HALF_WIDTH, top, top + 14, awayPostWidth, awayBlue);
    this.fillHorizontalBar(g, -GOAL_HALF_WIDTH - awayPostWidth / 2, GOAL_HALF_WIDTH + awayPostWidth / 2, top + 13, awayBarWidth, awayBlue);

    this.fillHorizontalBar(g, -GOAL_HALF_WIDTH, GOAL_HALF_WIDTH, bottom, homeBarWidth, homeRed);
  }

  private fillHorizontalBar(g: Graphics, x1: number, x2: number, y: number, height: number, c: Color): void {
    const x = Math.min(x1, x2);
    g.fillColor = c;
    g.rect(x, y - height / 2, Math.abs(x2 - x1), height);
    g.fill();
  }

  private fillVerticalBar(g: Graphics, x: number, y1: number, y2: number, width: number, c: Color): void {
    const y = Math.min(y1, y2);
    g.fillColor = c;
    g.rect(x - width / 2, y, width, Math.abs(y2 - y1));
    g.fill();
  }

  private drawCornerCushions(g: Graphics, left: number, right: number, top: number, bottom: number): void {
    const corners = [
      { x: left, y: top, start: -Math.PI / 2, end: 0, sx: -1, sy: 1 },
      { x: right, y: top, start: Math.PI, end: Math.PI * 1.5, sx: 1, sy: 1 },
      { x: left, y: bottom, start: 0, end: Math.PI / 2, sx: -1, sy: -1 },
      { x: right, y: bottom, start: Math.PI / 2, end: Math.PI, sx: 1, sy: -1 },
    ];
    for (const corner of corners) {
      const isAwaySide = corner.sy > 0;
      const cushion = isAwaySide ? rgba(72, 148, 245, 218) : rgba(238, 77, 77, 218);
      const spring = isAwaySide ? rgba(42, 128, 246, 245) : rgba(238, 58, 64, 245);
      const rim = isAwaySide ? rgba(30, 88, 190, 230) : rgba(164, 42, 48, 230);
      fillQuarterCircle(g, corner.x, corner.y, CORNER_CUSHION_RADIUS, corner.start, corner.end, cushion);
      this.strokeArcSegment(g, corner.x, corner.y, CORNER_CUSHION_RADIUS, corner.start, corner.end, rim, 2);
      this.drawCushionSprings(g, corner.x, corner.y, corner.sx, corner.sy, spring);
    }
  }

  private strokeArcSegment(g: Graphics, x: number, y: number, radius: number, start: number, end: number, c: Color, width: number): void {
    const steps = 12;
    g.strokeColor = c;
    g.lineWidth = width;
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const angle = start + (end - start) * t;
      const px = x + Math.cos(angle) * radius;
      const py = y + Math.sin(angle) * radius;
      if (i === 0) g.moveTo(px, py);
      else g.lineTo(px, py);
    }
    g.stroke();
  }

  private drawCushionSprings(g: Graphics, x: number, y: number, sx: number, sy: number, c: Color): void {
    const ix = -sx;
    const iy = -sy;
    if (sy > 0) {
      this.strokeZigZag(g, x + ix * 8, y + iy * 24, x + ix * 31, y + iy * 11, rgba(19, 66, 152, 132), 2, 4);
      this.strokeZigZag(g, x + ix * 13, y + iy * 34, x + ix * 31, y + iy * 17, rgba(19, 66, 152, 108), 1.7, 3);
    }
    this.strokeZigZag(g, x + ix * 8, y + iy * 21, x + ix * 31, y + iy * 8, c, 1.8, 4);
    this.strokeZigZag(g, x + ix * 13, y + iy * 31, x + ix * 31, y + iy * 14, c, 1.5, 3);
  }

  private strokeZigZag(g: Graphics, x1: number, y1: number, x2: number, y2: number, c: Color, width: number, steps: number): void {
    const dx = x2 - x1;
    const dy = y2 - y1;
    const len = Math.sqrt(dx * dx + dy * dy) || 1;
    const nx = -dy / len;
    const ny = dx / len;
    g.strokeColor = c;
    g.lineWidth = width;
    g.moveTo(x1, y1);
    for (let i = 1; i < steps; i++) {
      const t = i / steps;
      const amp = i % 2 === 0 ? -2.6 : 2.6;
      g.lineTo(x1 + dx * t + nx * amp, y1 + dy * t + ny * amp);
    }
    g.lineTo(x2, y2);
    g.stroke();
  }

  private drawGrassStripes(g: Graphics, x: number, y: number, w: number, h: number): void {
    const stripeHeight = 54;
    for (let yy = y, index = 0; yy < y + h; yy += stripeHeight, index++) {
      g.fillColor = index % 2 === 0 ? rgba(98, 205, 112, 120) : rgba(185, 218, 82, 92);
      g.rect(x, yy, w, Math.min(stripeHeight, y + h - yy));
      g.fill();
    }
  }

  private toPitchPoint(event: EventTouch): Vec2 {
    const pitch = this.pitchNode;
    const ui = event.getUILocation();
    const local = pitch?.getComponent(UITransform)?.convertToNodeSpaceAR(new Vec3(ui.x, ui.y));
    return new Vec2(local?.x || 0, local?.y || 0);
  }

  private touchToPitchPoint(touch: Touch): Vec2 {
    const pitch = this.pitchNode;
    const ui = touch.getUILocation();
    const local = pitch?.getComponent(UITransform)?.convertToNodeSpaceAR(new Vec3(ui.x, ui.y));
    return new Vec2(local?.x || 0, local?.y || 0);
  }

  private getFieldGraphics(): Graphics | null {
    const pitch = this.pitchNode;
    if (!pitch) return null;
    this.fieldGraphics = ensureGraphicsLayer(pitch, 'RuntimeFieldLines', 4);
    return this.fieldGraphics;
  }

  private getAimGraphics(): Graphics | null {
    const pitch = this.pitchNode;
    if (!pitch) return null;
    this.aimGraphics = ensureGraphicsLayer(pitch, 'RuntimeAimGuide', this.getAimLayerIndex(pitch));
    return this.aimGraphics;
  }

  private getAimLayerIndex(pitch: Node): number {
    const index = pitch.children.findIndex((child) => child.name.startsWith('Player_'));
    return index >= 0 ? index : pitch.children.length;
  }

  private get bodies(): DiscBodyState[] {
    if (this.penaltyShootout) {
      const activeIds = new Set([this.currentPenaltyKickerId, this.currentPenaltyKeeperId]);
      return [...this.players.filter((player) => activeIds.has(player.id)), this.ball];
    }
    return [...this.players, this.ball];
  }

  private get pitchNode(): Node | null {
    return findNode(this.canvas, 'Pitch');
  }

  private get fieldWidth(): number {
    return this.pitchNode?.getComponent(UITransform)?.contentSize.width || 362;
  }

  private get fieldHeight(): number {
    return this.pitchNode?.getComponent(UITransform)?.contentSize.height || 650;
  }

  private get goalLineY(): number {
    return this.fieldHeight / 2 - GOAL_DEPTH;
  }
}


function normalizeLineup(players: RosterPlayer[] | null | undefined): Array<RosterPlayer | null> {
  const lineup: Array<RosterPlayer | null> = [];
  for (let index = 0; index < 5; index += 1) {
    lineup.push(players?.[index] || null);
  }
  return lineup;
}

function makePlayer(id: string, side: TeamSide, x: number, y: number): PlayerDiskState {
  return {
    id,
    kind: 'player',
    side,
    x,
    y,
    vx: 0,
    vy: 0,
    radius: PLAYER_RADIUS,
    mass: PLAYER_MASS,
    friction: PLAYER_FRICTION,
    restitution: PLAYER_RESTITUTION,
  };
}

function makeBall(x: number, y: number): BallState {
  return {
    id: 'ball',
    kind: 'ball',
    x,
    y,
    vx: 0,
    vy: 0,
    radius: BALL_RADIUS,
    mass: BALL_MASS,
    friction: BALL_FRICTION,
    restitution: BALL_RESTITUTION,
  };
}

function drawDiscNode(node: Node, radius: number, fill: Color, stroke: Color, numberText = '', side: TeamSide = 'home', player: RosterPlayer | null = null): void {
  void numberText;
  const sprite = node.getComponent(Sprite);
  if (sprite) sprite.enabled = false;
  const transform = node.getComponent(UITransform) || node.addComponent(UITransform);
  transform.setContentSize(radius * 2, radius * 2 + 8);
  const g = node.getComponent(Graphics) || node.addComponent(Graphics);
  g.clear();
  g.fillColor = fill;
  g.circle(0, 0, radius);
  g.fill();
  g.strokeColor = stroke;
  g.lineWidth = 2;
  g.circle(0, 0, radius - 1);
  g.stroke();
  g.fillColor = rgba(255, 255, 255, 42);
  g.circle(-radius * 0.32, radius * 0.32, radius * 0.38);
  g.fill();
  if (player) {
    drawMatchAvatar(g, 0, 1, radius * 0.68, player);
  } else {
    drawGenericMatchAvatar(g, 0, 1, radius * 0.68, side);
  }
  setDiscNumberLabel(node, radius, '');
}

function playerNumber(id: string): string {
  return id.slice(id.lastIndexOf('-') + 1);
}

function playerSlotIndex(id: string): number {
  const value = Number(playerNumber(id));
  return Number.isFinite(value) ? value - 1 : 0;
}

function matchTeamDiscColor(side: TeamSide): Color {
  return side === 'home' ? rgba(238, 77, 77) : rgba(74, 135, 232);
}

function drawMatchAvatar(g: Graphics, x: number, y: number, radius: number, player: RosterPlayer): void {
  const skin = [
    rgba(246, 198, 146),
    rgba(236, 170, 120),
    rgba(225, 150, 104),
    rgba(248, 210, 164),
  ][player.avatarSeed % 4];
  const hair = [
    rgba(32, 28, 30),
    rgba(82, 50, 31),
    rgba(224, 190, 88),
    rgba(18, 39, 64),
  ][player.avatarSeed % 4];
  g.fillColor = rgba(255, 255, 255, 214);
  g.circle(x, y, radius + 1.6);
  g.fill();
  g.fillColor = skin;
  g.circle(x, y, radius);
  g.fill();
  g.fillColor = hair;
  g.moveTo(x - radius, y + radius * 0.2);
  g.bezierCurveTo(x - radius * 0.7, y + radius * 1.12, x + radius * 0.7, y + radius * 1.12, x + radius, y + radius * 0.15);
  g.lineTo(x + radius, y + radius * 0.52);
  g.bezierCurveTo(x + radius * 0.35, y + radius * 0.92, x - radius * 0.35, y + radius * 0.92, x - radius, y + radius * 0.52);
  g.close();
  g.fill();
  drawMatchFace(g, x, y, radius);
}

function drawGenericMatchAvatar(g: Graphics, x: number, y: number, radius: number, side: TeamSide): void {
  g.fillColor = rgba(255, 255, 255, 205);
  g.circle(x, y, radius + 1.6);
  g.fill();
  g.fillColor = side === 'home' ? rgba(248, 203, 160) : rgba(225, 190, 144);
  g.circle(x, y, radius);
  g.fill();
  g.fillColor = side === 'home' ? rgba(92, 46, 35) : rgba(22, 43, 72);
  g.moveTo(x - radius, y + radius * 0.1);
  g.bezierCurveTo(x - radius * 0.42, y + radius, x + radius * 0.42, y + radius, x + radius, y + radius * 0.1);
  g.lineTo(x + radius, y + radius * 0.52);
  g.bezierCurveTo(x + radius * 0.25, y + radius * 0.78, x - radius * 0.25, y + radius * 0.78, x - radius, y + radius * 0.52);
  g.close();
  g.fill();
  drawMatchFace(g, x, y, radius);
}

function drawMatchFace(g: Graphics, x: number, y: number, radius: number): void {
  g.fillColor = rgba(31, 38, 48, 240);
  g.circle(x - radius * 0.35, y - radius * 0.08, Math.max(1.2, radius * 0.1));
  g.fill();
  g.circle(x + radius * 0.35, y - radius * 0.08, Math.max(1.2, radius * 0.1));
  g.fill();
  g.strokeColor = rgba(115, 55, 48, 190);
  g.lineWidth = 1;
  g.moveTo(x - radius * 0.25, y - radius * 0.45);
  g.lineTo(x + radius * 0.25, y - radius * 0.45);
  g.stroke();
}

function setDiscNumberLabel(node: Node, radius: number, value: string): void {
  let labelNode = node.getChildByName('NumberLabel');
  if (!labelNode) {
    labelNode = new Node('NumberLabel');
    node.addChild(labelNode);
    labelNode.layer = node.layer;
    labelNode.addComponent(UITransform);
    labelNode.addComponent(Label);
  }
  labelNode.setPosition(0, 0);
  const transform = labelNode.getComponent(UITransform) || labelNode.addComponent(UITransform);
  transform.setContentSize(radius * 2, radius * 2);
  const label = labelNode.getComponent(Label) || labelNode.addComponent(Label);
  label.string = value;
  label.fontSize = value.length > 1 ? 11 : 15;
  label.lineHeight = value.length > 1 ? 13 : 17;
  label.isBold = true;
  label.cacheMode = Label.CacheMode.NONE;
  label.overflow = Label.Overflow.NONE;
  label.enableWrapText = false;
  label.horizontalAlign = Label.HorizontalAlign.CENTER;
  label.verticalAlign = Label.VerticalAlign.CENTER;
  label.color = rgba(255, 255, 255, 245);
}

function drawBallNode(node: Node, radius: number): void {
  const sprite = node.getComponent(Sprite);
  if (sprite) sprite.enabled = false;
  const transform = node.getComponent(UITransform) || node.addComponent(UITransform);
  transform.setContentSize(radius * 2, radius * 2);
  const g = node.getComponent(Graphics) || node.addComponent(Graphics);
  g.clear();
  g.fillColor = rgba(248, 248, 238);
  g.circle(0, 0, radius - 1.2);
  g.fill();

  const black = rgba(20, 24, 30, 242);
  fillRegularPolygon(g, 0, 0, radius * 0.33, 5, -Math.PI / 2, black);
  const outerPatches: BallPatch[] = [
    { angle: -Math.PI / 2, inner: 0.48, mid: 0.64, outer: 0.88, innerW: 0.07, midW: 0.19, outerW: 0.26 },
    { angle: -Math.PI / 2 + Math.PI * 2 / 5 + 0.08, inner: 0.51, mid: 0.68, outer: 0.9, innerW: 0.06, midW: 0.16, outerW: 0.22 },
    { angle: -Math.PI / 2 + Math.PI * 4 / 5 - 0.05, inner: 0.46, mid: 0.61, outer: 0.86, innerW: 0.08, midW: 0.2, outerW: 0.29 },
    { angle: -Math.PI / 2 + Math.PI * 6 / 5 + 0.11, inner: 0.53, mid: 0.69, outer: 0.91, innerW: 0.05, midW: 0.15, outerW: 0.21 },
    { angle: -Math.PI / 2 + Math.PI * 8 / 5 - 0.09, inner: 0.47, mid: 0.65, outer: 0.89, innerW: 0.07, midW: 0.21, outerW: 0.25 },
  ];
  for (const patch of outerPatches) {
    fillEdgePatch(g, radius, patch, black);

    const angle = patch.angle;
    g.strokeColor = rgba(20, 24, 30, 118);
    g.lineWidth = 0.65;
    g.moveTo(Math.cos(angle) * radius * 0.33, Math.sin(angle) * radius * 0.33);
    g.lineTo(Math.cos(angle) * radius * patch.inner, Math.sin(angle) * radius * patch.inner);
    g.stroke();
    const sideAngle = angle + Math.PI / 5;
    g.moveTo(Math.cos(sideAngle) * radius * 0.28, Math.sin(sideAngle) * radius * 0.28);
    g.lineTo(Math.cos(sideAngle) * radius * 0.52, Math.sin(sideAngle) * radius * 0.52);
    g.stroke();
  }

  g.strokeColor = rgba(20, 24, 30, 245);
  g.lineWidth = 1.2;
  g.circle(0, 0, radius - 0.8);
  g.stroke();
}

interface BallPatch {
  angle: number;
  inner: number;
  mid: number;
  outer: number;
  innerW: number;
  midW: number;
  outerW: number;
}

function fillEdgePatch(g: Graphics, radius: number, patch: BallPatch, c: Color): void {
  const ux = Math.cos(patch.angle);
  const uy = Math.sin(patch.angle);
  const tx = -uy;
  const ty = ux;
  const point = (r: number, w: number): { x: number; y: number } => ({
    x: ux * radius * r + tx * radius * w,
    y: uy * radius * r + ty * radius * w,
  });

  fillPolygon(g, [
    point(patch.outer, -patch.outerW),
    point(patch.outer, patch.outerW * 0.86),
    point(patch.mid, patch.midW),
    point(patch.inner, 0),
    point(patch.mid, -patch.midW * 0.78),
  ], c);
}

function fillPolygon(g: Graphics, points: Array<{ x: number; y: number }>, c: Color): void {
  if (points.length === 0) return;
  g.fillColor = c;
  g.moveTo(points[0].x, points[0].y);
  for (let i = 1; i < points.length; i++) {
    g.lineTo(points[i].x, points[i].y);
  }
  g.close();
  g.fill();
}

function fillQuarterCircle(g: Graphics, x: number, y: number, radius: number, start: number, end: number, c: Color): void {
  g.fillColor = c;
  g.moveTo(x, y);
  const steps = 12;
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const angle = start + (end - start) * t;
    g.lineTo(x + Math.cos(angle) * radius, y + Math.sin(angle) * radius);
  }
  g.close();
  g.fill();
}

function fillRegularPolygon(g: Graphics, x: number, y: number, radius: number, sides: number, rotation: number, c: Color): void {
  g.fillColor = c;
  for (let i = 0; i < sides; i++) {
    const angle = rotation + i * Math.PI * 2 / sides;
    const px = x + Math.cos(angle) * radius;
    const py = y + Math.sin(angle) * radius;
    if (i === 0) g.moveTo(px, py);
    else g.lineTo(px, py);
  }
  g.close();
  g.fill();
}

function ensureGraphicsLayer(parent: Node, name: string, siblingIndex: number): Graphics {
  let layer = parent.getChildByName(name);
  if (!layer) {
    layer = new Node(name);
    parent.addChild(layer);
    layer.addComponent(UITransform);
    layer.layer = parent.layer;
    layer.setPosition(0, 0);
    layer.setSiblingIndex(Math.min(Math.max(siblingIndex, 0), parent.children.length - 1));
  }
  const parentSize = parent.getComponent(UITransform)?.contentSize;
  const transform = layer.getComponent(UITransform) || layer.addComponent(UITransform);
  transform.setContentSize(parentSize?.width || 362, parentSize?.height || 650);
  return layer.getComponent(Graphics) || layer.addComponent(Graphics);
}


function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function nextId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.floor(Math.random() * 100000)}`;
}

function distSq(ax: number, ay: number, bx: number, by: number): number {
  const dx = ax - bx;
  const dy = ay - by;
  return dx * dx + dy * dy;
}

function pathLength(path: Vec2[]): number {
  let total = 0;
  for (let i = 1; i < path.length; i += 1) {
    const dx = path[i].x - path[i - 1].x;
    const dy = path[i].y - path[i - 1].y;
    total += Math.sqrt(dx * dx + dy * dy);
  }
  return total;
}

function formatClock(seconds: number): string {
  const clamped = Math.max(0, Math.ceil(seconds));
  const minutes = Math.floor(clamped / 60);
  const rest = clamped % 60;
  return `${minutes}:${rest < 10 ? '0' : ''}${rest}`;
}

function parseReplayScoreText(scoreText: string): ScoreState {
  const parts = `${scoreText || ''}`.replace(/：/g, ':').split(':');
  if (parts.length < 2) return { home: 0, away: 0 };
  return {
    home: leadingScoreNumber(parts[0]),
    away: leadingScoreNumber(parts[1]),
  };
}

function leadingScoreNumber(text: string): number {
  const match = `${text || ''}`.match(/\d+/);
  return match ? Number(match[0]) : 0;
}

function cloneSnapshot(snapshot: MatchSnapshot): MatchSnapshot {
  return {
    ...snapshot,
    score: { ...snapshot.score },
    players: (snapshot.players || []).map((player) => ({ ...player })),
    ball: { ...snapshot.ball },
  };
}

function easeOutCubic(t: number): number {
  const p = clamp(t, 0, 1) - 1;
  return p * p * p + 1;
}

function curvePointAtArcDistance(distance: number, arcDistance: number, angleRad: number): { x: number; y: number } {
  if (Math.abs(angleRad) < 0.001 || arcDistance <= 0) return { x: distance, y: 0 };
  const t = clamp(distance / arcDistance, 0, 1);
  const radius = arcDistance / (2 * angleRad);
  const theta = angleRad - angleRad * 2 * t;
  return {
    x: radius * (Math.sin(angleRad) - Math.sin(theta)),
    y: radius * (Math.cos(theta) - Math.cos(angleRad)),
  };
}

function localAimPoint(distance: number, arcDistance: number, angleRad: number): Vec2 {
  const point = curvePointAtArcDistance(distance, arcDistance, angleRad);
  return new Vec2(point.x, point.y);
}
