import { MatchClockState, MatchEvent, MatchMode, MatchSnapshot, ScoreState, ShootCommand, TeamSide } from './MatchTypes';
import type { MatchFieldSize, OnlineAction, OnlineClock, OnlineMatchmakingResponse } from './services/OnlineMatchService';
import { checkOnlineFinish, fetchOnlineClock, fetchOnlineOpponentAction, fetchOnlineScore, requestOnlineTurn, submitOnlineReady, submitOnlineShoot } from './services/OnlineMatchService';
import type { PlayerPhysicsProfile } from './services/PlayerRosterService';
import type { MatchSettlement } from './services/SingleMatchService';

export interface MatchTransport {
  readonly mode: MatchMode;
  connect(matchId: string): Promise<void>;
  submitShoot(command: ShootCommand): Promise<void>;
  submitMatchEvent(event: MatchEvent, commandId?: string): Promise<void>;
  requestTurnPermission(): void;
  requestGoalScore(): void;
  requestFinishCheck(): void;
  onRemoteShoot(handler: (command: ShootCommand) => boolean): void;
  onSnapshot(handler: (snapshot: MatchSnapshot) => void): void;
  onClock(handler: (clock: MatchClockState) => void): void;
  onScore(handler: (score: ScoreState) => void): void;
  onPlayerPhysics(handler: (homePhysics: PlayerPhysicsProfile[], awayPhysics: PlayerPhysicsProfile[]) => void): void;
  onServerForfeit(handler: (message: string, settlement?: MatchSettlement | null) => void): void;
  onServerVictory(handler: (message: string, settlement?: MatchSettlement | null) => void): void;
  setFieldSizeProvider(provider: (() => MatchFieldSize) | null): void;
  disconnect(): void;
}

export class LocalMatchTransport implements MatchTransport {
  readonly mode: MatchMode = 'ai';
  private shootHandler: ((command: ShootCommand) => boolean) | null = null;
  private snapshotHandler: ((snapshot: MatchSnapshot) => void) | null = null;

  async connect(_matchId: string): Promise<void> {
    return Promise.resolve();
  }

  async submitShoot(_command: ShootCommand): Promise<void> {
    return Promise.resolve();
  }

  async submitMatchEvent(_event: MatchEvent, _commandId = ''): Promise<void> {
    return Promise.resolve();
  }

  requestTurnPermission(): void {
    return;
  }

  requestGoalScore(): void {
    return;
  }

  requestFinishCheck(): void {
    return;
  }

  onRemoteShoot(handler: (command: ShootCommand) => boolean): void {
    this.shootHandler = handler;
  }

  onSnapshot(handler: (snapshot: MatchSnapshot) => void): void {
    this.snapshotHandler = handler;
  }

  onClock(_handler: (clock: MatchClockState) => void): void {
    return;
  }

  onScore(_handler: (score: ScoreState) => void): void {
    return;
  }

  onPlayerPhysics(_handler: (homePhysics: PlayerPhysicsProfile[], awayPhysics: PlayerPhysicsProfile[]) => void): void {
    return;
  }

  onServerForfeit(_handler: (message: string, settlement?: MatchSettlement | null) => void): void {
    return;
  }

  onServerVictory(_handler: (message: string, settlement?: MatchSettlement | null) => void): void {
    return;
  }

  setFieldSizeProvider(_provider: (() => MatchFieldSize) | null): void {
    return;
  }

  disconnect(): void {
    return;
  }

  pushSnapshot(snapshot: MatchSnapshot): void {
    this.snapshotHandler?.(snapshot);
  }

  simulateRemoteShoot(command: ShootCommand): void {
    this.shootHandler?.(command);
  }
}

export class OnlineMatchTransport implements MatchTransport {
  readonly mode: MatchMode = 'online';
  private shootHandler: ((command: ShootCommand) => boolean) | null = null;
  private snapshotHandler: ((snapshot: MatchSnapshot) => void) | null = null;
  private clockHandler: ((clock: MatchClockState) => void) | null = null;
  private scoreHandler: ((score: ScoreState) => void) | null = null;
  private playerPhysicsHandler: ((homePhysics: PlayerPhysicsProfile[], awayPhysics: PlayerPhysicsProfile[]) => void) | null = null;
  private forfeitHandler: ((message: string, settlement?: MatchSettlement | null) => void) | null = null;
  private victoryHandler: ((message: string, settlement?: MatchSettlement | null) => void) | null = null;
  private matchId = '';
  private requestId = '';
  private polling = false;
  private clockTimer: ReturnType<typeof setInterval> | null = null;
  private clockFailureCount = 0;
  private fieldSizeProvider: (() => MatchFieldSize) | null = null;
  private latestClock: OnlineClock | null = null;
  private lastServerTurn: TeamSide = 'home';
  private serverControlEnabled = false;
  private turnPermissionGranted = false;
  private turnRequestInFlight = false;
  private scoreRequestInFlight = false;
  private finishCheckInFlight = false;
  private finishCheckResolved = false;
  private finishCheckNextRetryAt = 0;
  private opponentActionTimer: ReturnType<typeof setInterval> | null = null;
  private opponentActionRequestInFlight = false;
  private lastActionSeq = 0;

  constructor(match: OnlineMatchmakingResponse | null = null) {
    this.requestId = match?.requestId || '';
  }

  async connect(matchId: string): Promise<void> {
    try {
      this.disconnect();
      this.matchId = matchId;
      await this.waitUntilReady();
      this.polling = true;
      this.clockTimer = setInterval(() => {
        void this.fetchServerClock();
      }, 200);
      await this.fetchServerClock();
      void this.requestTurnPermission();
    } catch (error) {
      throw error;
    }
  }

  async submitShoot(command: ShootCommand): Promise<void> {
    if (!this.matchId || !this.requestId) return;
    this.turnPermissionGranted = false;
    try {
      const sizedCommand = this.commandWithFieldSize(command);
      const response = await this.submitOnlineShootWithRetry(sizedCommand);
      if (!response.ok) {
        if ((response.message || '').indexOf('比赛已结束') < 0) this.triggerForfeit(response.message || '服务端拒绝本次操作', null);
        return;
      }
      this.lastActionSeq = Math.max(this.lastActionSeq, response.nextSeq || this.lastActionSeq);
      this.applyClock(response.clock || null, false, false);
    } catch {
      this.triggerForfeit('操作请求无响应', null);
      return;
    }
  }

  async submitMatchEvent(_event: MatchEvent, commandId = ''): Promise<void> {
    void _event;
    void commandId;
    return Promise.resolve();
  }

  onRemoteShoot(handler: (command: ShootCommand) => boolean): void {
    this.shootHandler = handler;
  }

  onSnapshot(handler: (snapshot: MatchSnapshot) => void): void {
    this.snapshotHandler = handler;
  }

  onClock(handler: (clock: MatchClockState) => void): void {
    this.clockHandler = handler;
  }

  onScore(handler: (score: ScoreState) => void): void {
    this.scoreHandler = handler;
  }

  onPlayerPhysics(handler: (homePhysics: PlayerPhysicsProfile[], awayPhysics: PlayerPhysicsProfile[]) => void): void {
    this.playerPhysicsHandler = handler;
  }

  onServerForfeit(handler: (message: string, settlement?: MatchSettlement | null) => void): void {
    this.forfeitHandler = handler;
  }

  onServerVictory(handler: (message: string, settlement?: MatchSettlement | null) => void): void {
    this.victoryHandler = handler;
  }

  setFieldSizeProvider(provider: (() => MatchFieldSize) | null): void {
    this.fieldSizeProvider = provider;
  }

  disconnect(): void {
    this.polling = false;
    if (this.clockTimer) clearInterval(this.clockTimer);
    this.stopOpponentActionPolling();
    this.clockTimer = null;
    this.clockFailureCount = 0;
    this.latestClock = null;
    this.lastServerTurn = 'home';
    this.serverControlEnabled = false;
    this.turnPermissionGranted = false;
    this.turnRequestInFlight = false;
    this.scoreRequestInFlight = false;
    this.finishCheckInFlight = false;
    this.finishCheckResolved = false;
    this.finishCheckNextRetryAt = 0;
    this.opponentActionRequestInFlight = false;
    this.lastActionSeq = 0;
  }

  simulateRemoteShoot(command: ShootCommand): void {
    this.shootHandler?.(command);
  }

  simulateServerSnapshot(snapshot: MatchSnapshot): void {
    this.snapshotHandler?.(snapshot);
  }

  private async waitUntilReady(): Promise<void> {
    for (let attempt = 0; attempt < 8; attempt += 1) {
      const response = await submitOnlineReady(this.matchId, this.requestId, this.currentFieldSize()).catch(() => null);
      if (!response) {
        await this.delay(500);
        continue;
      }
      if (!response.ok) throw new Error(response.message || '进入比赛失败');
      if (response.clock) this.applyClock(response.clock, false, false);
      if (response.snapshot) this.snapshotHandler?.(response.snapshot);
      if (response.started) return;
      await this.delay(500);
    }
    throw new Error('等待对手进入比赛超时');
  }

  private async fetchServerClock(): Promise<void> {
    if (!this.polling || !this.matchId || !this.requestId) return;
    const response = await fetchOnlineClock(this.matchId, this.requestId).catch(() => null);
    if (!response) {
      this.clockFailureCount += 1;
      return;
    }
    this.clockFailureCount = 0;
    if (!response.ok) {
      return;
    }
    this.applyClock(response.clock || null, true);
  }

  requestTurnPermission(): void {
    void this.fetchTurnPermission();
  }

  requestGoalScore(): void {
    void this.fetchGoalScore();
  }

  requestFinishCheck(): void {
    void this.fetchFinishCheck();
  }

  private async fetchTurnPermission(): Promise<void> {
    if (this.turnRequestInFlight || !this.matchId || !this.requestId) return;
    this.turnRequestInFlight = true;
    try {
      const response = await requestOnlineTurn(this.matchId, this.requestId, this.currentFieldSize());
      if (!response.ok) {
        return;
      }
      if (!response.canControl && response.message === '等待场上静止') {
        if (response.clock) this.applyClock(response.clock, false, false);
        return;
      }
      this.lastServerTurn = response.canControl === true ? 'home' : 'away';
      this.serverControlEnabled = response.canControl === true;
      this.turnPermissionGranted = response.canControl === true;
      this.applyClock(response.clock || null, false, response.canControl === true);
      if (response.canControl) {
        this.stopOpponentActionPolling();
        this.applyPlayerPhysics(response.homePhysics, response.awayPhysics);
      } else if (response.message === '不是你的回合') {
        this.startOpponentActionPolling();
      }
    } catch {
      return;
    } finally {
      this.turnRequestInFlight = false;
    }
  }

  private startOpponentActionPolling(): void {
    if (!this.polling || this.opponentActionTimer) return;
    void this.fetchOpponentAction();
    this.opponentActionTimer = setInterval(() => {
      void this.fetchOpponentAction();
    }, 250);
  }

  private stopOpponentActionPolling(): void {
    if (this.opponentActionTimer) clearInterval(this.opponentActionTimer);
    this.opponentActionTimer = null;
  }

  private async fetchOpponentAction(): Promise<void> {
    if (this.opponentActionRequestInFlight || !this.matchId || !this.requestId || this.finishCheckResolved) return;
    this.opponentActionRequestInFlight = true;
    try {
      const response = await fetchOnlineOpponentAction(this.matchId, this.requestId, this.lastActionSeq, this.currentFieldSize());
      if (!response.ok) {
        if ((response.message || '').indexOf('比赛已结束') >= 0) this.requestFinishCheck();
        return;
      }
      this.applyClock(response.clock || null, false, false);
      this.lastActionSeq = Math.max(this.lastActionSeq, response.nextSeq || this.lastActionSeq);
      const action = response.actions && response.actions.length > 0 ? response.actions[0] : null;
      if (!action) return;
      this.stopOpponentActionPolling();
      this.lastActionSeq = Math.max(this.lastActionSeq, action.seq || this.lastActionSeq);
      this.shootHandler?.(this.remoteCommandFromServer(action));
    } catch {
      return;
    } finally {
      this.opponentActionRequestInFlight = false;
    }
  }

  private async fetchGoalScore(): Promise<void> {
    if (this.scoreRequestInFlight || !this.matchId || !this.requestId) return;
    this.scoreRequestInFlight = true;
    try {
      const response = await fetchOnlineScore(this.matchId, this.requestId);
      if (response.ok && response.score) {
        this.scoreHandler?.(response.score);
        if (response.score.home >= 3 || response.score.away >= 3) this.requestFinishCheck();
      }
    } catch {
      return;
    } finally {
      this.scoreRequestInFlight = false;
    }
  }

  private async fetchFinishCheck(): Promise<void> {
    if (this.finishCheckResolved || this.finishCheckInFlight || !this.matchId || !this.requestId) return;
    const now = Date.now();
    if (now < this.finishCheckNextRetryAt) return;
    this.finishCheckInFlight = true;
    try {
      const response = await checkOnlineFinish(this.matchId, this.requestId);
      if (!response.ok || !response.canEnd || !response.settlement) {
        this.finishCheckNextRetryAt = Date.now() + 1000;
        return;
      }
      this.finishCheckResolved = true;
      this.handleServerSettlement(response.message || '比赛结束', response.settlement);
    } catch {
      this.finishCheckNextRetryAt = Date.now() + 1000;
    } finally {
      this.finishCheckInFlight = false;
    }
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  private remoteCommandFromServer(action: OnlineAction): ShootCommand {
    const command = action.command;
    return {
      ...command,
      matchId: this.matchId,
    };
  }

  private currentFieldSize(): MatchFieldSize | null {
    if (!this.fieldSizeProvider) return null;
    const size = this.fieldSizeProvider();
    if (!size || size.fieldWidth <= 0 || size.fieldHeight <= 0) return null;
    return size;
  }

  private commandWithFieldSize(command: ShootCommand): ShootCommand {
    const size = this.currentFieldSize();
    if (!size) return command;
    return {
      ...command,
      fieldWidth: size.fieldWidth,
      fieldHeight: size.fieldHeight,
    };
  }

  private async submitOnlineShootWithRetry(command: ShootCommand) {
    let lastError: unknown = null;
    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        return await submitOnlineShoot(this.matchId, this.requestId, command);
      } catch (error) {
        lastError = error;
      }
    }
    throw lastError;
  }

  private applyClock(clock: OnlineClock | null, allowTurnRequest = true, confirmedControl = false): void {
    if (!clock) return;
    this.latestClock = clock;
    if (allowTurnRequest && clock.matchRemainingSeconds <= 0.05) this.requestFinishCheck();
    const localControlUnlocked = this.serverControlEnabled === true && this.lastServerTurn === 'home';
    if (confirmedControl && localControlUnlocked) this.turnPermissionGranted = true;
    this.clockHandler?.({
      serverTimeMillis: clock.serverTimeMillis,
      matchRemainingSeconds: clock.matchRemainingSeconds,
      turnRemainingSeconds: clock.turnRemainingSeconds,
      turn: this.lastServerTurn,
      controlEnabled: localControlUnlocked && this.turnPermissionGranted,
    });
  }

  private applyPlayerPhysics(homePhysics: PlayerPhysicsProfile[] | null | undefined, awayPhysics: PlayerPhysicsProfile[] | null | undefined): void {
    if ((!homePhysics || homePhysics.length === 0) && (!awayPhysics || awayPhysics.length === 0)) return;
    this.playerPhysicsHandler?.(homePhysics || [], awayPhysics || []);
  }

  private triggerForfeit(message: string, settlement: MatchSettlement | null = null): void {
    this.disconnect();
    this.forfeitHandler?.(message, settlement);
  }

  private triggerVictory(message: string, settlement: MatchSettlement | null = null): void {
    this.disconnect();
    this.victoryHandler?.(message, settlement);
  }

  private handleServerSettlement(message: string, settlement: MatchSettlement): void {
    if (settlement.winnerSide === 'home') this.triggerVictory(message, settlement);
    else this.triggerForfeit(message, settlement);
  }
}
