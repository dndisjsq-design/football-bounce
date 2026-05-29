import { Color, EventTouch, Graphics, Label, Node, Sprite, Touch, UITransform, Vec2, Vec3 } from 'cc';
import { MatchTransport } from '../MatchTransport';
import { BallState, DiscBodyState, MatchEvent, MatchMode, MatchSnapshot, PlayerDiskState, ShootCommand, TeamSide } from '../MatchTypes';
import { getMatchFormationPoints } from '../services/FormationService';
import { RosterPlayer, getLineupPlayers } from '../services/PlayerRosterService';
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
  private activeCurves = new Map<string, CurveMotion>();
  private aiCooldown = 0.8;
  private tickIndex = 0;
  private ballSpinDeg = 0;
  private fieldGraphics: Graphics | null = null;
  private aimGraphics: Graphics | null = null;
  private appliedCommandIds = new Set<string>();

  constructor(canvas: Node, mode: MatchMode, transport: MatchTransport) {
    this.canvas = canvas;
    this.mode = mode;
    this.transport = transport;
  }

  start(): void {
    const title = findNode(this.canvas, 'TextMode')?.getComponent(Label);
    if (title) title.string = this.mode === 'ai' ? '单机人机' : '真人联机';
    this.transport.onRemoteShoot((command) => this.applyShoot(command));
    this.transport.onSnapshot((snapshot) => this.applySnapshot(snapshot));
    void this.transport.connect(MATCH_ID).catch(() => undefined);
    this.resetObjects();
    this.prepareMatchRenderer();
    this.attachPlayerInput();
    this.syncNodes();
  }

  tick(dt: number): void {
    this.step(dt);
    if (this.mode === 'ai' && this.turn === 'away' && this.isSettled()) {
      this.aiCooldown -= dt;
      if (this.aiCooldown <= 0) {
        this.aiCooldown = 0.8;
        this.fireAi();
      }
    }
    this.tickIndex += 1;
    if (this.tickIndex % 12 === 0) void this.transport.submitSnapshot(this.createSnapshot()).catch(() => undefined);
    this.syncNodes();
  }

  private resetObjects(): void {
    const fw = this.fieldWidth;
    const fh = this.fieldHeight;
    this.turn = 'home';
    this.dragActor = null;
    this.dragStart = null;
    this.dragNow = null;
    this.powerTouchId = null;
    this.curveTouchId = null;
    this.curveTouchStart = null;
    this.curveTouchPoint = null;
    this.activeCurves.clear();
    this.ball = makeBall(0, 0);
    this.ballSpinDeg = 0;
    const homePoints = getMatchFormationPoints('home', fw, fh);
    const awayPoints = getMatchFormationPoints('away', fw, fh);
    this.players = [
      ...homePoints.map((point, index) => makePlayer(`home-${index + 1}`, 'home', point.x, point.y)),
      ...awayPoints.map((point, index) => makePlayer(`away-${index + 1}`, 'away', point.x, point.y)),
    ];
    this.resolveAllCollisions();
  }

  private prepareMatchRenderer(): void {
    this.hideLegacyPitchHints();
    this.layoutGoalWalls();
    this.drawPitchLines();
    const homeLineup = getLineupPlayers();
    for (const p of this.players) {
      const node = findNode(this.canvas, `Player_${p.id}`);
      const lineupPlayer = p.side === 'home' ? homeLineup[playerSlotIndex(p.id)] || null : null;
      if (node) {
        drawDiscNode(
          node,
          p.radius,
          lineupPlayer ? matchRarityColor(lineupPlayer.rarity) : p.side === 'home' ? rgba(238, 77, 77) : rgba(74, 135, 232),
          rgba(255, 255, 255, 215),
          '',
          p.side,
          lineupPlayer,
        );
      }
    }
    const ballNode = findNode(this.canvas, 'Ball');
    if (ballNode) drawBallNode(ballNode, this.ball.radius);
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
        const current = this.players.find((p) => p.id === playerId);
        if (!current || current.side !== 'home' || this.turn !== 'home' || !this.isSettled()) return;
        this.dragActor = current;
        this.dragStart = new Vec2(current.x, current.y);
        this.powerTouchId = event.touch?.getID() ?? null;
        this.curveTouchId = null;
        this.curveTouchStart = null;
        this.curveTouchPoint = null;
        this.updateDragTouches(event);
      });
      node.on(Node.EventType.TOUCH_MOVE, (event: EventTouch) => {
        this.updateDragTouches(event);
      });
      node.on(Node.EventType.TOUCH_END, (event: EventTouch) => this.handleDragTouchEnd(event));
      node.on(Node.EventType.TOUCH_CANCEL, (event: EventTouch) => this.handleDragTouchEnd(event));
    }
    const pitch = this.pitchNode;
    pitch?.on(Node.EventType.TOUCH_START, (event: EventTouch) => this.updateDragTouches(event));
    pitch?.on(Node.EventType.TOUCH_MOVE, (event: EventTouch) => this.updateDragTouches(event));
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
      return;
    }
    const curveTouch = curveTouches.find((touch) => touch.getID() === this.curveTouchId) || curveTouches[0];
    const curvePoint = this.touchToPitchPoint(curveTouch);
    if (this.curveTouchId !== curveTouch.getID()) {
      this.curveTouchId = curveTouch.getID();
      this.curveTouchStart = new Vec2(curvePoint.x, curvePoint.y);
    }
    this.curveTouchPoint = curvePoint;
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
    }
    this.updateDragTouches(event);
  }

  private releaseShot(): void {
    if (!this.dragActor || !this.dragStart || !this.dragNow) {
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
        matchId: MATCH_ID,
        actorId: this.dragActor.id,
        side: this.turn,
        angleRad: Math.atan2(dy, dx),
        power,
        curveAngleRad,
        curveDistance,
        clientTick: Date.now(),
      });
    }
    this.clearDragAim();
  }

  private submitShoot(command: ShootCommand): void {
    this.applyShoot(command);
    void this.transport.submitShoot(command).catch(() => undefined);
  }

  private applyShoot(command: ShootCommand): void {
    if (this.appliedCommandIds.has(command.commandId)) return;
    const actor = this.players.find((p) => p.id === command.actorId);
    if (!actor || actor.side !== command.side || command.side !== this.turn || !this.isSettled()) return;
    this.appliedCommandIds.add(command.commandId);
    const curveAngle = clamp(command.curveAngleRad || 0, -MAX_CURVE_ANGLE, MAX_CURVE_ANGLE);
    const curveDistance = Math.max(0, command.curveDistance || 0);
    const hasCurve = Math.abs(curveAngle) > 0.03 && curveDistance > CURVE_MIN_DISTANCE;
    const shotAngle = command.angleRad + (hasCurve ? curveAngle : 0);
    const speed = PLAYER_SHOT_SPEED * clamp(command.power, 0, 1);
    actor.vx = Math.cos(shotAngle) * speed;
    actor.vy = Math.sin(shotAngle) * speed;
    if (hasCurve) {
      this.activeCurves.set(actor.id, {
        remainingAngle: -curveAngle * 2,
        remainingDistance: curveDistance,
      });
    } else {
      this.activeCurves.delete(actor.id);
    }
    this.turn = this.turn === 'home' ? 'away' : 'home';
    this.emitMatchEvent({ type: 'shoot', side: command.side, actorId: actor.id });
  }

  private fireAi(): void {
    const candidates = this.players.filter((p) => p.side === 'away');
    let best = candidates[0];
    for (const p of candidates) {
      if (distSq(p.x, p.y, this.ball.x, this.ball.y) < distSq(best.x, best.y, this.ball.x, this.ball.y)) best = p;
    }
    this.submitShoot({
      commandId: nextId('ai-shoot'),
      matchId: MATCH_ID,
      actorId: best.id,
      side: 'away',
      angleRad: Math.atan2(this.ball.y - best.y, this.ball.x - best.x),
      power: 0.68,
      curveAngleRad: 0,
      curveDistance: 0,
      clientTick: Date.now(),
    });
  }

  private step(dt: number): void {
    const subSteps = Math.max(1, Math.ceil(dt / (1 / 120)));
    const subDt = dt / subSteps;
    for (let i = 0; i < subSteps; i++) {
      for (const b of this.bodies) this.integrateBody(b, subDt);
      this.resolveAllCollisions();
      this.checkGoal();
    }
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
    if (Math.abs(this.ball.x) > GOAL_HALF_WIDTH - this.ball.radius) return;
    if (this.ball.y > this.goalLineY + this.ball.radius) this.registerGoal('home');
    if (this.ball.y < -this.goalLineY - this.ball.radius) this.registerGoal('away');
  }

  private registerGoal(side: TeamSide): void {
    this.score[side] += 1;
    this.emitMatchEvent({ type: 'goal', side });
    this.resetObjects();
  }

  private syncNodes(): void {
    const ballNode = findNode(this.canvas, 'Ball');
    if (ballNode) {
      ballNode.setPosition(this.ball.x, this.ball.y);
      ballNode.angle = this.ballSpinDeg;
    }
    for (const p of this.players) findNode(this.canvas, `Player_${p.id}`)?.setPosition(p.x, p.y);
    const scoreLabel = findNode(this.canvas, 'TextScore')?.getComponent(Label);
    if (scoreLabel) scoreLabel.string = `${this.score.away} : ${this.score.home}`;
    const turnLabel = findNode(this.canvas, 'TextTurn')?.getComponent(Label);
    if (turnLabel) turnLabel.string = this.turn === 'home' ? '我方回合' : '对方回合';
    this.drawAimIndicator();
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
    g.node.angle = Math.atan2(ny, nx) * 180 / Math.PI;
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
      g.ellipse(0, 0, longRadius, shortRadius);
      g.fill();
    }

    const start = this.dragActor.radius + 8;
    const lineEnd = outerLongRadius * 2;
    const dashLength = 9;
    const gap = 7;
    if (Math.abs(curveAngleRad) > 0.03) {
      this.strokeCurvedAimLine(g, start, lineEnd, curveAngleRad, dashLength, gap);
      return;
    }
    for (let d = start, index = 0; d < lineEnd; d += dashLength + gap, index++) {
      const next = Math.min(d + dashLength, lineEnd);
      const alpha = Math.max(48, 250 - index * 26);
      this.strokeLine(
        g,
        d,
        0,
        next,
        0,
        rgba(255, 255, 255, alpha),
        3,
      );
    }
  }

  private curveAngleFromSecondTouch(rawLen: number): number {
    if (!this.dragActor || !this.dragStart || !this.dragNow || !this.curveTouchStart || !this.curveTouchPoint || rawLen <= this.dragActor.radius) return 0;
    const ux = (this.dragStart.x - this.dragNow.x) / rawLen;
    const uy = (this.dragStart.y - this.dragNow.y) / rawLen;
    const perpX = -uy;
    const perpY = ux;
    const sx = this.curveTouchPoint.x - this.curveTouchStart.x;
    const sy = this.curveTouchPoint.y - this.curveTouchStart.y;
    const signedOffset = sx * perpX + sy * perpY;
    const curve = clamp((Math.abs(signedOffset) - CURVE_INPUT_DEADZONE) / Math.max(1, rawLen * 0.45), 0, 1);
    return signedOffset >= 0 ? curve * MAX_CURVE_ANGLE : -curve * MAX_CURVE_ANGLE;
  }

  private curveDistanceForShot(power: number): number {
    const aimRadius = this.dragActor ? this.dragActor.radius + power * (MAX_DRAG_DISTANCE - this.dragActor.radius) : MAX_DRAG_DISTANCE;
    return Math.max(CURVE_MIN_DISTANCE, aimRadius * 2);
  }

  private strokeCurvedAimLine(g: Graphics, start: number, end: number, angleRad: number, dashLength: number, gap: number): void {
    for (let d = start, index = 0; d < end; d += dashLength + gap, index++) {
      const next = Math.min(d + dashLength, end);
      const from = curvePointAtArcDistance(d, end, angleRad);
      const to = curvePointAtArcDistance(next, end, angleRad);
      const alpha = Math.max(48, 250 - index * 24);
      this.strokeLine(g, from.x, from.y, to.x, to.y, rgba(255, 255, 255, alpha), 3);
    }
  }

  dispose(): void {
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
    this.aimGraphics?.clear();
  }

  private isSettled(): boolean {
    return this.bodies.every((b) => Math.abs(b.vx) + Math.abs(b.vy) < 1);
  }

  private createSnapshot(): MatchSnapshot {
    return {
      matchId: MATCH_ID,
      mode: this.mode,
      tick: this.tickIndex,
      turn: this.turn,
      score: { ...this.score },
      players: this.players.map((p) => ({ ...p })),
      ball: { ...this.ball },
    };
  }

  private applySnapshot(snapshot: MatchSnapshot): void {
    if (snapshot.matchId !== MATCH_ID) return;
    this.tickIndex = Math.max(this.tickIndex, snapshot.tick);
    this.turn = snapshot.turn;
    this.score = { ...snapshot.score };
    for (const incoming of snapshot.players) {
      const current = this.players.find((p) => p.id === incoming.id);
      if (current) Object.assign(current, incoming);
      else this.players.push({ ...incoming });
    }
    this.ball = { ...snapshot.ball };
    this.activeCurves.clear();
    this.syncNodes();
  }

  private emitMatchEvent(event: Pick<MatchEvent, 'type' | 'side' | 'actorId'>): void {
    void this.transport.submitMatchEvent({
      eventId: nextId(event.type),
      matchId: MATCH_ID,
      tick: this.tickIndex,
      score: { ...this.score },
      clientTick: Date.now(),
      ...event,
    }).catch(() => undefined);
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

function matchRarityColor(rarity: RosterPlayer['rarity']): Color {
  if (rarity === 'red') return rgba(190, 42, 51);
  if (rarity === 'orange') return rgba(205, 111, 27);
  if (rarity === 'purple') return rgba(111, 65, 185);
  return rgba(45, 107, 188);
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
