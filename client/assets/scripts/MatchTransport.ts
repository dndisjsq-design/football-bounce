import { MatchClockState, MatchEvent, MatchMode, MatchSnapshot, ScoreState, ShootCommand, TeamSide } from './MatchTypes';
import type { MatchFieldSize, OnlineAction, OnlineClock, OnlineMatchmakingResponse } from './services/OnlineMatchService';
import { fetchOnlineActions, fetchOnlineClock, submitOnlineResult, submitOnlineShoot } from './services/OnlineMatchService';

interface PendingResultState {
  submitted: boolean;
}

export interface MatchSettlementPreview {
  snapshot?: MatchSnapshot | null;
  event?: MatchEvent | null;
}

export interface MatchTransport {
  readonly mode: MatchMode;
  connect(matchId: string): Promise<void>;
  submitShoot(command: ShootCommand, settlement?: MatchSettlementPreview | null): Promise<void>;
  submitSnapshot(snapshot: MatchSnapshot, commandId?: string): Promise<void>;
  submitMatchEvent(event: MatchEvent, commandId?: string): Promise<void>;
  onRemoteShoot(handler: (command: ShootCommand) => boolean | MatchSettlementPreview): void;
  onSnapshot(handler: (snapshot: MatchSnapshot) => void): void;
  onClock(handler: (clock: MatchClockState) => void): void;
  onServerForfeit(handler: (message: string, finalScore?: ScoreState | null) => void): void;
  onServerVictory(handler: (message: string, finalScore?: ScoreState | null) => void): void;
  setFieldSizeProvider(provider: (() => MatchFieldSize) | null): void;
  disconnect(): void;
}

export class LocalMatchTransport implements MatchTransport {
  readonly mode: MatchMode = 'ai';
  private shootHandler: ((command: ShootCommand) => boolean | MatchSettlementPreview) | null = null;
  private snapshotHandler: ((snapshot: MatchSnapshot) => void) | null = null;

  async connect(_matchId: string): Promise<void> {
    return Promise.resolve();
  }

  async submitShoot(_command: ShootCommand, _settlement: MatchSettlementPreview | null = null): Promise<void> {
    return Promise.resolve();
  }

  async submitSnapshot(_snapshot: MatchSnapshot, _commandId = ''): Promise<void> {
    return Promise.resolve();
  }

  async submitMatchEvent(_event: MatchEvent, _commandId = ''): Promise<void> {
    return Promise.resolve();
  }

  onRemoteShoot(handler: (command: ShootCommand) => boolean | MatchSettlementPreview): void {
    this.shootHandler = handler;
  }

  onSnapshot(handler: (snapshot: MatchSnapshot) => void): void {
    this.snapshotHandler = handler;
  }

  onClock(_handler: (clock: MatchClockState) => void): void {
    return;
  }

  onServerForfeit(_handler: (message: string, finalScore?: ScoreState | null) => void): void {
    return;
  }

  onServerVictory(_handler: (message: string, finalScore?: ScoreState | null) => void): void {
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
  private shootHandler: ((command: ShootCommand) => boolean | MatchSettlementPreview) | null = null;
  private snapshotHandler: ((snapshot: MatchSnapshot) => void) | null = null;
  private clockHandler: ((clock: MatchClockState) => void) | null = null;
  private forfeitHandler: ((message: string, finalScore?: ScoreState | null) => void) | null = null;
  private victoryHandler: ((message: string, finalScore?: ScoreState | null) => void) | null = null;
  private matchId = '';
  private requestId = '';
  private sinceSeq = 0;
  private polling = false;
  private clockTimer: ReturnType<typeof setInterval> | null = null;
  private pendingResults = new Map<string, PendingResultState>();
  private pollFailureCount = 0;
  private clockFailureCount = 0;
  private fieldSizeProvider: (() => MatchFieldSize) | null = null;

  constructor(match: OnlineMatchmakingResponse | null = null) {
    this.requestId = match?.requestId || '';
  }

  async connect(matchId: string): Promise<void> {
    this.matchId = matchId;
    this.disconnect();
    this.sinceSeq = 0;
    this.polling = true;
    this.clockTimer = setInterval(() => {
      void this.fetchServerClock();
    }, 200);
    void this.pollRemoteActionsLoop();
    await this.fetchServerClock();
  }

  async submitShoot(command: ShootCommand, settlement: MatchSettlementPreview | null = null): Promise<void> {
    if (!this.matchId || !this.requestId) return;
    this.pendingResults.set(command.commandId, { submitted: false });
    try {
      const sizedCommand = this.commandWithFieldSize(command);
      const response = await submitOnlineShoot(this.matchId, this.requestId, sizedCommand);
      if (!response.ok) {
        this.pendingResults.delete(command.commandId);
        this.triggerForfeit(response.message || '服务端拒绝本次操作');
        return;
      }
      if (settlement?.event) {
        void this.submitMatchEvent(settlement.event, command.commandId);
      } else if (settlement?.snapshot) {
        void this.submitSnapshot(settlement.snapshot, command.commandId);
      }
    } catch {
      this.pendingResults.delete(command.commandId);
      this.triggerForfeit('用户操作无法发送到后端');
    }
  }

  async submitSnapshot(snapshot: MatchSnapshot, commandId = ''): Promise<void> {
    if (!this.matchId || !this.requestId || this.pendingResults.size === 0) return;
    const pending = this.pendingResultEntry(commandId);
    if (!pending) return;
    const [resolvedCommandId, state] = pending;
    const localSettled = isSettledSnapshot(snapshot);
    if (!localSettled) return;
    state.submitted = true;
    try {
      const response = await submitOnlineResult(this.matchId, this.requestId, resolvedCommandId, snapshot, null, this.currentFieldSize());
      this.applyClock(response.clock || null);
      if (!response.ok) {
        this.handleServerMatchEnd(response.message || '服务端校验失败', response.winnerNetworkSide || null, response.loserNetworkSide || null, response.finalScore || null);
        return;
      }
      if (!response.valid) {
        state.submitted = false;
        return;
      }
      if (!response.confirmed) {
        this.pendingResults.delete(resolvedCommandId);
        return;
      }
      this.pendingResults.delete(resolvedCommandId);
      if (response.winnerNetworkSide || response.loserNetworkSide) {
        this.handleServerMatchEnd(response.message || '比赛结束', response.winnerNetworkSide || null, response.loserNetworkSide || null, response.finalScore || null);
      }
    } catch {
      state.submitted = false;
    }
  }

  async submitMatchEvent(_event: MatchEvent, commandId = ''): Promise<void> {
    if (!this.matchId || !this.requestId) return;
    const pending = this.pendingResultEntry(commandId);
    if (_event.type === 'goal' && !pending) return;
    const resolvedCommandId = pending ? pending[0] : _event.eventId;
    const state = pending ? pending[1] : null;
    if (state) state.submitted = true;
    try {
      const response = await submitOnlineResult(this.matchId, this.requestId, resolvedCommandId, null, _event, this.currentFieldSize());
      this.applyClock(response.clock || null);
      if (!response.ok) {
        this.handleServerMatchEnd(response.message || '服务端进球校验失败', response.winnerNetworkSide || null, response.loserNetworkSide || null, response.finalScore || null);
        return;
      }
      if (!response.valid) {
        if (state) state.submitted = false;
        return;
      }
      if (state) this.pendingResults.delete(resolvedCommandId);
      if (response.winnerNetworkSide || response.loserNetworkSide) {
        this.handleServerMatchEnd(response.message || '比赛结束', response.winnerNetworkSide || null, response.loserNetworkSide || null, response.finalScore || null);
      }
    } catch {
      if (state) state.submitted = false;
    }
  }

  onRemoteShoot(handler: (command: ShootCommand) => boolean | MatchSettlementPreview): void {
    this.shootHandler = handler;
  }

  onSnapshot(handler: (snapshot: MatchSnapshot) => void): void {
    this.snapshotHandler = handler;
  }

  onClock(handler: (clock: MatchClockState) => void): void {
    this.clockHandler = handler;
  }

  onServerForfeit(handler: (message: string, finalScore?: ScoreState | null) => void): void {
    this.forfeitHandler = handler;
  }

  onServerVictory(handler: (message: string, finalScore?: ScoreState | null) => void): void {
    this.victoryHandler = handler;
  }

  setFieldSizeProvider(provider: (() => MatchFieldSize) | null): void {
    this.fieldSizeProvider = provider;
  }

  disconnect(): void {
    this.polling = false;
    if (this.clockTimer) clearInterval(this.clockTimer);
    this.clockTimer = null;
    this.pendingResults.clear();
    this.pollFailureCount = 0;
    this.clockFailureCount = 0;
  }

  simulateRemoteShoot(command: ShootCommand): void {
    this.shootHandler?.(command);
  }

  simulateServerSnapshot(snapshot: MatchSnapshot): void {
    this.snapshotHandler?.(snapshot);
  }

  private async pollRemoteActionsLoop(): Promise<void> {
    while (this.polling) {
      await this.pollRemoteActions();
    }
  }

  private async pollRemoteActions(): Promise<void> {
    if (!this.polling || !this.matchId || !this.requestId) return;
    const response = await fetchOnlineActions(this.matchId, this.requestId, this.sinceSeq, this.currentFieldSize()).catch(() => null);
    if (!response) {
      this.pollFailureCount += 1;
      if (this.pollFailureCount >= 40) this.triggerForfeit('联机连接中断');
      return;
    }
    this.pollFailureCount = 0;
    if (!response.ok) {
      this.handleServerMatchEnd(response.message || '联机同步失败', response.winnerNetworkSide || null, response.loserNetworkSide || null, response.finalScore || null);
      return;
    }
    let consumedSeq = this.sinceSeq;
    for (const action of response.actions || []) {
      if (action.actorRequestId === this.requestId) {
        consumedSeq = Math.max(consumedSeq, action.seq);
        continue;
      }
      this.pendingResults.set(action.command.commandId, { submitted: false });
      const settlement = this.shootHandler?.(this.remoteCommandFromServer(action));
      if (!settlement) {
        this.pendingResults.delete(action.command.commandId);
        break;
      }
      if (typeof settlement === 'object') {
        if (settlement.event) {
          void this.submitMatchEvent(settlement.event, action.command.commandId);
        } else if (settlement.snapshot) {
          void this.submitSnapshot(settlement.snapshot, action.command.commandId);
        }
      }
      consumedSeq = Math.max(consumedSeq, action.seq);
    }
    this.sinceSeq = consumedSeq;
  }

  private async fetchServerClock(): Promise<void> {
    if (!this.polling || !this.matchId || !this.requestId) return;
    const response = await fetchOnlineClock(this.matchId, this.requestId, this.currentFieldSize()).catch(() => null);
    if (!response) {
      this.clockFailureCount += 1;
      if (this.clockFailureCount >= 40) this.triggerForfeit('联机时钟连接中断');
      return;
    }
    this.clockFailureCount = 0;
    if (!response.ok) {
      this.handleServerMatchEnd(response.message || '联机时钟同步失败', response.winnerNetworkSide || null, response.loserNetworkSide || null, response.finalScore || null);
      return;
    }
    this.applyClock(response.clock || null);
  }

  private pendingResultEntry(commandId: string): [string, PendingResultState] | null {
    const id = commandId || '';
    if (id) {
      const state = this.pendingResults.get(id);
      if (!state || state.submitted) return null;
      return [id, state];
    }
    return Array.from(this.pendingResults.entries()).find(([, state]) => !state.submitted) || null;
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

  private applyClock(clock: OnlineClock | null): void {
    if (!clock) return;
    this.clockHandler?.({
      serverTimeMillis: clock.serverTimeMillis,
      matchRemainingSeconds: clock.matchRemainingSeconds,
      turnRemainingSeconds: clock.turnRemainingSeconds,
      turn: clock.turnNetworkSide === 'away' ? 'away' : 'home',
      controlEnabled: clock.controlEnabled === true,
    });
  }

  private triggerForfeit(message: string, finalScore: ScoreState | null = null): void {
    this.disconnect();
    this.forfeitHandler?.(message, finalScore);
  }

  private triggerVictory(message: string, finalScore: ScoreState | null = null): void {
    this.disconnect();
    this.victoryHandler?.(message, finalScore);
  }

  private handleServerMatchEnd(message: string, winnerNetworkSide: TeamSide | null, loserNetworkSide: TeamSide | null, finalScore: ScoreState | null): void {
    if (winnerNetworkSide === 'home' || loserNetworkSide === 'away') {
      this.triggerVictory(message, finalScore);
      return;
    }
    if (winnerNetworkSide === 'away' || loserNetworkSide === 'home') {
      this.triggerForfeit(message, finalScore);
      return;
    }
    this.triggerForfeit(message, finalScore);
  }
}

function isSettledSnapshot(snapshot: MatchSnapshot): boolean {
  const bodies = [snapshot.ball, ...(snapshot.players || [])];
  return bodies.every((body) => Math.abs(body.vx) + Math.abs(body.vy) < 1);
}
