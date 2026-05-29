import { MatchEvent, MatchMode, MatchSnapshot, ShootCommand } from './MatchTypes';

export interface MatchTransport {
  readonly mode: MatchMode;
  connect(matchId: string): Promise<void>;
  submitShoot(command: ShootCommand): Promise<void>;
  submitSnapshot(snapshot: MatchSnapshot): Promise<void>;
  submitMatchEvent(event: MatchEvent): Promise<void>;
  onRemoteShoot(handler: (command: ShootCommand) => void): void;
  onSnapshot(handler: (snapshot: MatchSnapshot) => void): void;
}

export class LocalMatchTransport implements MatchTransport {
  readonly mode: MatchMode = 'ai';
  private shootHandler: ((command: ShootCommand) => void) | null = null;
  private snapshotHandler: ((snapshot: MatchSnapshot) => void) | null = null;

  async connect(_matchId: string): Promise<void> {
    return Promise.resolve();
  }

  async submitShoot(_command: ShootCommand): Promise<void> {
    return Promise.resolve();
  }

  async submitSnapshot(_snapshot: MatchSnapshot): Promise<void> {
    return Promise.resolve();
  }

  async submitMatchEvent(_event: MatchEvent): Promise<void> {
    return Promise.resolve();
  }

  onRemoteShoot(handler: (command: ShootCommand) => void): void {
    this.shootHandler = handler;
  }

  onSnapshot(handler: (snapshot: MatchSnapshot) => void): void {
    this.snapshotHandler = handler;
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
  private shootHandler: ((command: ShootCommand) => void) | null = null;
  private snapshotHandler: ((snapshot: MatchSnapshot) => void) | null = null;

  async connect(_matchId: string): Promise<void> {
    // Reserved for Socket.IO/ws connection.
    return Promise.resolve();
  }

  async submitShoot(_command: ShootCommand): Promise<void> {
    // Reserved for server-authoritative validation and broadcast.
    return Promise.resolve();
  }

  async submitSnapshot(_snapshot: MatchSnapshot): Promise<void> {
    // Reserved for server-side replay, anti-cheat and reconnect snapshots.
    return Promise.resolve();
  }

  async submitMatchEvent(_event: MatchEvent): Promise<void> {
    // Reserved for persistence: goals, match result, rewards and analytics.
    return Promise.resolve();
  }

  onRemoteShoot(handler: (command: ShootCommand) => void): void {
    this.shootHandler = handler;
  }

  onSnapshot(handler: (snapshot: MatchSnapshot) => void): void {
    this.snapshotHandler = handler;
  }

  simulateRemoteShoot(command: ShootCommand): void {
    this.shootHandler?.(command);
  }

  simulateServerSnapshot(snapshot: MatchSnapshot): void {
    this.snapshotHandler?.(snapshot);
  }
}
