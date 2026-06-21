import { Button, Color, director, EventTouch, Graphics, Label, Mask, MaskType, Node, Sprite, UITransform } from 'cc';
import { MatchMode } from '../MatchTypes';
import { getCurrentUserSummary, logoutCurrentDevice, onUserSummaryChange } from '../services/AuthService';
import type { UserSummary } from '../services/AuthService';
import { MatchRecordSummary, fetchRecentMatchRecords, setSelectedReplayMatchId } from '../services/MatchRecordService';
import { OnlineMatchmakingResponse, cancelOnlineMatch, createMatchmakingRequestId, fetchOnlineMatchStatus, joinOnlineMatch, setSelectedOnlineMatch } from '../services/OnlineMatchService';
import { getCurrentCoins } from '../services/WalletService';
import { findNode, onTap, rgba } from '../utils/CocosNodeUtils';

const HEADER_COIN_X = 108;
const HEADER_COIN_Y = 393;
const MATCH_RECORD_PAGE_SIZE = 10;
const MATCH_RECORD_ROW_HEIGHT = 94;
const MATCH_RECORD_ROW_GAP = 12;
const MATCH_RECORD_VIEWPORT_HEIGHT = 610;
const MATCH_RECORD_VIEWPORT_WIDTH = 348;

interface MatchRecordOverlayState {
  overlay: Node;
  viewport: Node;
  statusLabel: Label | null;
  records: MatchRecordSummary[];
  rows: Node[];
  offset: number;
  startY: number;
  startOffset: number;
  loading: boolean;
  hasMore: boolean;
  rowHeight: number;
  rowGap: number;
  viewportHeight: number;
}

export function bindHomeScene(root: Node, selectMatchMode: (mode: MatchMode) => void): void {
  bindTabs(root, 'home');
  bindMatchRecordButton(root);
  bindOnlineMatchButton(root, selectMatchMode);
  onTap(root, 'ButtonAI', () => {
    selectMatchMode('ai');
    director.loadScene('Match');
  });
}

export function bindProfileScene(root: Node): void {
  bindTabs(root, 'profile');
  onTap(root, 'ButtonLogout', () => {
    logoutCurrentDevice();
    director.loadScene('Login');
  });
}

export function bindTabs(root: Node, active: string): void {
  bindTopProfile(root);
  onTap(root, 'TabHome', () => active !== 'home' && director.loadScene('Home'));
  onTap(root, 'TabPlayers', () => active !== 'players' && director.loadScene('Players'));
  onTap(root, 'TabShop', () => active !== 'shop' && director.loadScene('Shop'));
  onTap(root, 'TabProfile', () => active !== 'profile' && director.loadScene('Profile'));
}

function bindTopProfile(root: Node): void {
  hideBrandTitle(root);
  const summary = getCurrentUserSummary();
  const nameLabel = findNode(root, 'TextAccount')?.getComponent(Label);
  if (nameLabel) nameLabel.string = displayName(summary);
  bindHeaderCoins(root, summary);
  const unsubscribe = onUserSummaryChange((next) => {
    if (!root.isValid) {
      unsubscribe();
      return;
    }
    const currentNameLabel = findNode(root, 'TextAccount')?.getComponent(Label);
    if (currentNameLabel) currentNameLabel.string = displayName(next);
    bindHeaderCoins(root, next);
  });
  const avatar = findNode(root, 'TopAvatar');
  if (!avatar) return;
  const sprite = avatar.getComponent(Sprite);
  if (sprite) sprite.enabled = false;
  const g = avatar.getComponent(Graphics) || avatar.addComponent(Graphics);
  g.clear();
  g.fillColor = rgba(255, 212, 84);
  g.circle(0, 0, 17);
  g.fill();
  g.strokeColor = rgba(255, 255, 255, 220);
  g.lineWidth = 2;
  g.circle(0, 0, 16);
  g.stroke();
}

function displayName(summary: UserSummary): string {
  return summary.displayName || summary.username || 'visiter';
}

function hideBrandTitle(root: Node): void {
  for (const name of ['TextBrandShadow', 'TextGameTitle']) {
    const node = findNode(root, name);
    if (!node) continue;
    const label = node.getComponent(Label);
    if (label) label.string = '';
    node.active = false;
  }
}

function bindHeaderCoins(root: Node, summary = getCurrentUserSummary()): void {
  const node = findNode(root, 'TextCoins') || findNode(root, 'TextShopCoins') || createHeaderCoinNode(root);
  node.active = true;
  node.setPosition(HEADER_COIN_X, HEADER_COIN_Y);
  const transform = node.getComponent(UITransform) || node.addComponent(UITransform);
  transform.setContentSize(150, 34);
  const label = node.getComponent(Label) || node.addComponent(Label);
  label.string = `金币 ${typeof summary.coins === 'number' ? summary.coins : getCurrentCoins()}`;
  label.fontSize = 17;
  label.lineHeight = 23;
  label.isBold = true;
  label.cacheMode = Label.CacheMode.NONE;
  label.horizontalAlign = Label.HorizontalAlign.CENTER;
  label.verticalAlign = Label.VerticalAlign.CENTER;
  label.overflow = Label.Overflow.SHRINK;
  label.enableWrapText = false;
  label.color = rgba(255, 237, 96);
}

function createHeaderCoinNode(root: Node): Node {
  const node = new Node('TextHeaderCoinsRuntime');
  node.layer = root.layer;
  root.addChild(node);
  return node;
}

function bindOnlineMatchButton(root: Node, selectMatchMode: (mode: MatchMode) => void): void {
  const button = findNode(root, 'ButtonOnline');
  if (!button) return;
  const buttonComponent = button.getComponent(Button);
  if (buttonComponent) buttonComponent.interactable = true;
  button.off(Node.EventType.TOUCH_END);
  onTap(root, 'ButtonOnline', () => showMatchmakingOverlay(root, selectMatchMode));
}

function showMatchmakingOverlay(root: Node, selectMatchMode: (mode: MatchMode) => void): void {
  const old = findNode(root, 'OnlineMatchmakingOverlay');
  if (old) old.destroy();
  const overlay = new Node('OnlineMatchmakingOverlay');
  overlay.layer = root.layer;
  root.addChild(overlay);
  const size = root.getComponent(UITransform)?.contentSize;
  const width = size?.width || 390;
  const height = size?.height || 844;
  overlay.addComponent(UITransform).setContentSize(width, height);
  overlay.setPosition(0, 0);
  const bg = overlay.addComponent(Graphics);
  drawMatchmakingBackground(bg, width, height);
  const leftSlot = createMatchmakingSlot(overlay, 'MatchmakingLeftSlot', -width * 0.25, 66, 148, 250, rgba(238, 77, 77));
  const rightSlot = createMatchmakingSlot(overlay, 'MatchmakingRightSlot', width * 0.25, 66, 148, 250, rgba(74, 135, 232));
  const statusLabel = createRuntimeLabel(overlay, 'MatchmakingStatus', '匹配中', 0, -255, 22, rgba(255, 255, 255), Label.HorizontalAlign.CENTER, 220, 34);
  statusLabel.isBold = true;
  const spinner = createSpinner(overlay, 0, -196);
  const back = createMatchmakingBackButton(overlay, -width / 2 + 54, height / 2 - 48);
  const requestId = createMatchmakingRequestId();
  let active = true;
  let spinnerAngle = 0;
  let pollTimer: ReturnType<typeof setInterval> | null = null;
  let spinTimer: ReturnType<typeof setInterval> | null = setInterval(() => {
    if (!active || !spinner.isValid) return;
    spinnerAngle = (spinnerAngle - 26) % 360;
    spinner.setRotationFromEuler(0, 0, spinnerAngle);
  }, 50);

  const cleanup = () => {
    active = false;
    if (pollTimer) clearInterval(pollTimer);
    if (spinTimer) clearInterval(spinTimer);
    pollTimer = null;
    spinTimer = null;
  };
  const handle = (response: OnlineMatchmakingResponse) => {
    if (!active || !overlay.isValid) return;
    renderMatchmakingSlots(leftSlot, rightSlot, response);
    if (!response.ok || response.status === 'ERROR') {
      statusLabel.string = response.message || '匹配失败';
      spinner.active = false;
      cleanup();
      return;
    }
    if (response.status === 'MATCHED' && response.matchId) {
      cleanup();
      spinner.active = false;
      statusLabel.string = '匹配成功';
      setSelectedOnlineMatch(response);
      setTimeout(() => {
        if (!overlay.isValid) return;
        selectMatchMode('online');
        director.loadScene('Match');
      }, 2000);
      return;
    }
    if (response.status === 'EXPIRED') {
      statusLabel.string = '匹配超时';
      spinner.active = false;
      cleanup();
      return;
    }
    if (response.status === 'CANCELLED') {
      cleanup();
      if (overlay.isValid) overlay.destroy();
      return;
    }
    statusLabel.string = response.message || '匹配中';
  };
  back.on(Node.EventType.TOUCH_END, () => {
    cleanup();
    void cancelOnlineMatch(requestId).catch(() => undefined);
    overlay.destroy();
  });
  void joinOnlineMatch(requestId)
    .then((response) => {
      handle(response);
      if (!active || response.status === 'MATCHED') return;
      pollTimer = setInterval(() => {
        void fetchOnlineMatchStatus(requestId).then(handle).catch(() => {
          if (statusLabel.isValid) statusLabel.string = '等待后端连接';
        });
      }, 800);
    })
    .catch((error: Error) => {
      statusLabel.string = error.message || '无法连接后端';
      spinner.active = false;
      cleanup();
    });
}

function drawMatchmakingBackground(g: Graphics, width: number, height: number): void {
  g.clear();
  g.fillColor = rgba(190, 34, 46, 255);
  g.rect(-width / 2, -height / 2, width / 2, height);
  g.fill();
  g.fillColor = rgba(28, 89, 196, 255);
  g.rect(0, -height / 2, width / 2, height);
  g.fill();
  g.fillColor = rgba(255, 255, 255, 42);
  g.rect(-1.5, -height / 2, 3, height);
  g.fill();
  g.fillColor = rgba(7, 18, 42, 72);
  g.rect(-width / 2, -height / 2, width, height);
  g.fill();
  createRuntimeLabel(g.node, 'MatchmakingTitle', '真人联机', 0, height / 2 - 72, 30, rgba(255, 255, 255), Label.HorizontalAlign.CENTER, 240, 42).isBold = true;
}

function createMatchmakingSlot(parent: Node, name: string, x: number, y: number, width: number, height: number, color: Color): Node {
  const slot = new Node(name);
  slot.layer = parent.layer;
  parent.addChild(slot);
  slot.setPosition(x, y);
  slot.addComponent(UITransform).setContentSize(width, height);
  const g = slot.addComponent(Graphics);
  g.fillColor = rgba(255, 255, 255, 28);
  g.roundRect(-width / 2, -height / 2, width, height, 8);
  g.fill();
  g.strokeColor = color;
  g.lineWidth = 2;
  g.roundRect(-width / 2, -height / 2, width, height, 8);
  g.stroke();
  return slot;
}

function renderMatchmakingSlots(leftSlot: Node, rightSlot: Node, response: OnlineMatchmakingResponse): void {
  renderMatchmakingPlayer(leftSlot, response.leftPlayer || null, rgba(238, 77, 77), '等待玩家');
  renderMatchmakingPlayer(rightSlot, response.rightPlayer || null, rgba(74, 135, 232), '等待对手');
}

function renderMatchmakingPlayer(slot: Node, player: OnlineMatchmakingResponse['leftPlayer'] | null, color: Color, emptyText: string): void {
  slot.removeAllChildren();
  const g = slot.getComponent(Graphics) || slot.addComponent(Graphics);
  g.clear();
  const transform = slot.getComponent(UITransform);
  const width = transform?.contentSize.width || 148;
  const height = transform?.contentSize.height || 250;
  g.fillColor = rgba(255, 255, 255, 30);
  g.roundRect(-width / 2, -height / 2, width, height, 8);
  g.fill();
  g.strokeColor = color;
  g.lineWidth = 2.2;
  g.roundRect(-width / 2, -height / 2, width, height, 8);
  g.stroke();
  if (!player) {
    createRuntimeLabel(slot, 'EmptyPlayer', emptyText, 0, 0, 18, rgba(231, 238, 255), Label.HorizontalAlign.CENTER, 120, 28);
    return;
  }
  drawMatchmakingAvatar(g, 0, 44, 37, color);
  const name = player.displayName || player.username || '玩家';
  createRuntimeLabel(slot, 'PlayerName', name, 0, -24, 18, rgba(255, 255, 255), Label.HorizontalAlign.CENTER, 124, 30).isBold = true;
}

function drawMatchmakingAvatar(g: Graphics, x: number, y: number, radius: number, color: Color): void {
  g.fillColor = rgba(255, 255, 255, 235);
  g.circle(x, y, radius + 5);
  g.fill();
  g.fillColor = color;
  g.circle(x, y, radius);
  g.fill();
  g.fillColor = rgba(255, 224, 176, 255);
  g.circle(x, y + 4, radius * 0.56);
  g.fill();
  g.fillColor = rgba(32, 40, 54, 235);
  g.circle(x - radius * 0.19, y + 6, 3);
  g.circle(x + radius * 0.19, y + 6, 3);
  g.fill();
}

function createSpinner(parent: Node, x: number, y: number): Node {
  const node = new Node('MatchmakingSpinner');
  node.layer = parent.layer;
  parent.addChild(node);
  node.setPosition(x, y);
  node.addComponent(UITransform).setContentSize(58, 58);
  const g = node.addComponent(Graphics);
  g.strokeColor = rgba(255, 255, 255, 238);
  g.lineWidth = 5;
  const radius = 22;
  for (let i = 0; i < 22; i += 1) {
    const start = -Math.PI * 0.15 + i * Math.PI * 1.42 / 22;
    const end = start + Math.PI * 0.035;
    const alpha = 80 + i * 7;
    g.strokeColor = rgba(255, 255, 255, alpha);
    g.moveTo(Math.cos(start) * radius, Math.sin(start) * radius);
    g.lineTo(Math.cos(end) * radius, Math.sin(end) * radius);
    g.stroke();
  }
  return node;
}

function createMatchmakingBackButton(parent: Node, x: number, y: number): Node {
  const button = new Node('MatchmakingBack');
  button.layer = parent.layer;
  parent.addChild(button);
  button.setPosition(x, y);
  button.addComponent(UITransform).setContentSize(72, 38);
  const g = button.addComponent(Graphics);
  g.fillColor = rgba(255, 255, 255, 235);
  g.roundRect(-36, -19, 72, 38, 5);
  g.fill();
  createRuntimeLabel(button, 'BackLabel', '返回', 0, 0, 15, rgba(32, 44, 64), Label.HorizontalAlign.CENTER, 58, 22).isBold = true;
  return button;
}

function bindMatchRecordButton(root: Node): void {
  const old = findNode(root, 'ButtonMatchRecordsRuntime');
  if (old) old.destroy();
  const button = new Node('ButtonMatchRecordsRuntime');
  button.layer = root.layer;
  root.addChild(button);
  button.setPosition(162, 318);
  button.addComponent(UITransform).setContentSize(42, 42);
  const g = button.addComponent(Graphics);
  drawRecordBookIcon(g, 0, 0, 34, 34);
  button.on(Node.EventType.TOUCH_END, () => showMatchRecordOverlay(root));
}

function drawRecordBookIcon(g: Graphics, x: number, y: number, w: number, h: number): void {
  g.clear();
  g.fillColor = rgba(255, 204, 64, 255);
  g.roundRect(x - w / 2, y - h / 2, w, h, 5);
  g.fill();
  g.strokeColor = rgba(40, 55, 78, 255);
  g.lineWidth = 2;
  g.roundRect(x - w / 2, y - h / 2, w, h, 5);
  g.stroke();
  g.fillColor = rgba(255, 239, 174, 255);
  g.rect(x - w / 2 + 8, y - h / 2 + 4, w - 12, h - 8);
  g.fill();
  g.strokeColor = rgba(44, 68, 94, 220);
  g.lineWidth = 1.5;
  g.moveTo(x - w / 2 + 8, y + h / 2 - 8);
  g.lineTo(x + w / 2 - 5, y + h / 2 - 8);
  g.moveTo(x - w / 2 + 8, y + h / 2 - 15);
  g.lineTo(x + w / 2 - 8, y + h / 2 - 15);
  g.moveTo(x - w / 2 + 8, y + h / 2 - 22);
  g.lineTo(x + w / 2 - 10, y + h / 2 - 22);
  g.stroke();
  g.fillColor = rgba(222, 89, 74, 255);
  g.rect(x - w / 2 + 2, y - h / 2 + 4, 6, h - 8);
  g.fill();
}

function showMatchRecordOverlay(root: Node): void {
  const old = findNode(root, 'MatchRecordOverlay');
  if (old) old.destroy();
  const overlay = new Node('MatchRecordOverlay');
  overlay.layer = root.layer;
  root.addChild(overlay);
  const size = root.getComponent(UITransform)?.contentSize;
  const width = size?.width || 390;
  const height = size?.height || 844;
  overlay.addComponent(UITransform).setContentSize(width, height);
  overlay.setPosition(0, 0);
  const bg = overlay.addComponent(Graphics);
  bg.fillColor = rgba(8, 24, 55, 245);
  bg.rect(-width / 2, -height / 2, width, height);
  bg.fill();
  drawOverlayHeader(overlay, width, height);
  const message = createRuntimeLabel(overlay, 'MatchRecordLoading', '加载中...', 0, 250, 16, rgba(226, 240, 255), Label.HorizontalAlign.CENTER, 260, 28);
  const viewport = new Node('MatchRecordViewport');
  viewport.layer = overlay.layer;
  overlay.addChild(viewport);
  viewport.setPosition(0, 0);
  viewport.addComponent(UITransform).setContentSize(MATCH_RECORD_VIEWPORT_WIDTH, MATCH_RECORD_VIEWPORT_HEIGHT);
  const mask = viewport.addComponent(Mask);
  mask.type = MaskType.GRAPHICS_RECT;
  const state: MatchRecordOverlayState = {
    overlay,
    viewport,
    statusLabel: message,
    records: [],
    rows: [],
    offset: 0,
    startY: 0,
    startOffset: 0,
    loading: false,
    hasMore: true,
    rowHeight: MATCH_RECORD_ROW_HEIGHT,
    rowGap: MATCH_RECORD_ROW_GAP,
    viewportHeight: MATCH_RECORD_VIEWPORT_HEIGHT,
  };
  bindMatchRecordScroll(state);
  loadNextMatchRecordPage(state);
}

function drawOverlayHeader(overlay: Node, width: number, height: number): void {
  const g = overlay.getComponent(Graphics) || overlay.addComponent(Graphics);
  g.fillColor = rgba(255, 92, 62, 255);
  g.rect(-width / 2, height / 2 - 76, width, 76);
  g.fill();
  createRuntimeLabel(overlay, 'MatchRecordTitle', '近期比赛记录', 0, height / 2 - 42, 23, rgba(255, 255, 255), Label.HorizontalAlign.CENTER, 210, 34).isBold = true;
  const close = new Node('MatchRecordClose');
  close.layer = overlay.layer;
  overlay.addChild(close);
  close.setPosition(-154, height / 2 - 42);
  close.addComponent(UITransform).setContentSize(58, 36);
  const closeG = close.addComponent(Graphics);
  closeG.fillColor = rgba(255, 255, 255, 235);
  closeG.roundRect(-29, -18, 58, 36, 5);
  closeG.fill();
  createRuntimeLabel(close, 'CloseLabel', '返回', 0, 0, 15, rgba(24, 42, 68), Label.HorizontalAlign.CENTER, 50, 22).isBold = true;
  close.on(Node.EventType.TOUCH_END, () => overlay.destroy());
}

function bindMatchRecordScroll(state: MatchRecordOverlayState): void {
  state.viewport.on(Node.EventType.TOUCH_START, (event: EventTouch) => {
    state.startY = event.getUILocation().y;
    state.startOffset = state.offset;
  });
  state.viewport.on(Node.EventType.TOUCH_MOVE, (event: EventTouch) => {
    const max = matchRecordMaxScroll(state);
    state.offset = clamp(state.startOffset + event.getUILocation().y - state.startY, 0, max);
    renderMatchRecordRows(state);
    if (state.hasMore && !state.loading && state.offset >= max - 1 && state.records.length >= MATCH_RECORD_PAGE_SIZE) {
      loadNextMatchRecordPage(state);
    }
  });
}

function loadNextMatchRecordPage(state: MatchRecordOverlayState): void {
  if (state.loading || !state.hasMore || !state.overlay.isValid) return;
  state.loading = true;
  setMatchRecordStatus(state, state.records.length === 0 ? '加载中...' : '加载更多...');
  void fetchRecentMatchRecords(MATCH_RECORD_PAGE_SIZE, state.records.length)
    .then((response) => {
      if (!state.overlay.isValid) return;
      state.loading = false;
      if (!response.ok) {
        setMatchRecordStatus(state, response.message || '查询失败', rgba(255, 204, 204));
        return;
      }
      const nextRecords = response.records || [];
      if (nextRecords.length < MATCH_RECORD_PAGE_SIZE) {
        state.hasMore = false;
      }
      appendMatchRecordRows(state, nextRecords);
      if (state.records.length === 0) {
        setMatchRecordStatus(state, '暂无已完成比赛记录');
      } else {
        setMatchRecordStatus(state, state.hasMore ? '' : '没有更多记录');
      }
      renderMatchRecordRows(state);
    })
    .catch((error: Error) => {
      if (!state.overlay.isValid) return;
      state.loading = false;
      setMatchRecordStatus(state, error.message || '无法连接后端', rgba(255, 204, 204));
    });
}

function appendMatchRecordRows(state: MatchRecordOverlayState, records: MatchRecordSummary[]): void {
  for (const record of records) {
    const index = state.records.length;
    state.records.push(record);
    const row = new Node(`MatchRecordRow_${index}`);
    row.layer = state.viewport.layer;
    state.viewport.addChild(row);
    row.addComponent(UITransform).setContentSize(330, state.rowHeight);
    row.addComponent(Graphics);
    drawRecordRow(row, record, state.overlay);
    state.rows.push(row);
  }
}

function renderMatchRecordRows(state: MatchRecordOverlayState): void {
  const startY = state.viewportHeight / 2 - state.rowHeight / 2 - 4;
  const max = matchRecordMaxScroll(state);
  state.offset = clamp(state.offset, 0, max);
  for (let i = 0; i < state.rows.length; i += 1) {
    const y = startY - i * (state.rowHeight + state.rowGap) + state.offset;
    state.rows[i].setPosition(0, y);
  }
}

function matchRecordMaxScroll(state: MatchRecordOverlayState): number {
  if (state.records.length === 0) return 0;
  const contentHeight = state.records.length * state.rowHeight + Math.max(0, state.records.length - 1) * state.rowGap;
  return Math.max(0, contentHeight - state.viewportHeight + 8);
}

function setMatchRecordStatus(state: MatchRecordOverlayState, text: string, color = rgba(226, 240, 255)): void {
  if (!text) {
    if (state.statusLabel?.node.isValid) state.statusLabel.node.active = false;
    return;
  }
  if (!state.statusLabel || !state.statusLabel.node.isValid) {
    state.statusLabel = createRuntimeLabel(state.overlay, 'MatchRecordStatus', text, 0, -318, 14, color, Label.HorizontalAlign.CENTER, 280, 24);
  }
  state.statusLabel.node.setPosition(0, state.records.length === 0 ? 250 : -318);
  state.statusLabel.node.active = true;
  state.statusLabel.string = text;
  state.statusLabel.color = color;
}

function drawRecordRow(row: Node, record: MatchRecordSummary, overlay: Node): void {
  const g = row.getComponent(Graphics) || row.addComponent(Graphics);
  g.clear();
  g.fillColor = rgba(226, 239, 255, 250);
  g.roundRect(-165, -47, 330, 94, 6);
  g.fill();
  g.strokeColor = rgba(82, 119, 164, 190);
  g.lineWidth = 1.4;
  g.roundRect(-165, -47, 330, 94, 6);
  g.stroke();
  drawRecordAvatar(g, -136, 16, 18, rgba(238, 77, 77));
  drawRecordAvatar(g, 139, 16, 18, rgba(74, 135, 232));
  createRuntimeLabel(row, 'SelfName', displayGuestName(record.username), -80, 19, 13, rgba(30, 48, 72), Label.HorizontalAlign.CENTER, 78, 20).isBold = true;
  createRuntimeLabel(row, 'OpponentName', record.opponentUsername || '人机', 78, 19, 13, rgba(30, 48, 72), Label.HorizontalAlign.CENTER, 76, 20).isBold = true;
  createRuntimeLabel(row, 'Score', record.resultScore || '- : -', 0, 16, 22, resultColor(record.result), Label.HorizontalAlign.CENTER, 64, 30).isBold = true;
  createRuntimeLabel(row, 'Time', formatRecordDateTime(record.matchTime), -72, -21, 11, rgba(66, 88, 116), Label.HorizontalAlign.CENTER, 164, 18);
  createRuntimeLabel(row, 'Mode', record.matchType === 'single' ? '单人' : '联机', 39, -21, 12, rgba(66, 88, 116), Label.HorizontalAlign.CENTER, 50, 18).isBold = true;
  const replay = new Node('ReplayButton');
  replay.layer = row.layer;
  row.addChild(replay);
  replay.setPosition(121, -24);
  replay.addComponent(UITransform).setContentSize(72, 28);
  const replayG = replay.addComponent(Graphics);
  replayG.fillColor = rgba(255, 204, 64, 255);
  replayG.roundRect(-36, -14, 72, 28, 5);
  replayG.fill();
  createRuntimeLabel(replay, 'ReplayLabel', '回放', 0, 0, 13, rgba(35, 38, 48), Label.HorizontalAlign.CENTER, 60, 20).isBold = true;
  replay.on(Node.EventType.TOUCH_END, () => {
    setSelectedReplayMatchId(record.matchId);
    overlay.destroy();
    director.loadScene('Match');
  });
}

function formatRecordDateTime(value: string): string {
  const normalized = `${value || ''}`.replace('T', ' ').trim();
  const match = normalized.match(/^(\d{4}-\d{2}-\d{2})\s+(\d{2}:\d{2}:\d{2})/);
  if (!match) return normalized || '-';
  return `${match[1]} ${match[2]}`;
}

function drawRecordAvatar(g: Graphics, x: number, y: number, radius: number, color: Color): void {
  g.fillColor = rgba(255, 255, 255, 235);
  g.circle(x, y, radius + 2);
  g.fill();
  g.fillColor = color;
  g.circle(x, y, radius);
  g.fill();
  g.fillColor = rgba(255, 226, 166, 255);
  g.circle(x, y + 2, radius * 0.58);
  g.fill();
  g.fillColor = rgba(35, 40, 52, 255);
  g.circle(x - radius * 0.2, y + 2, 1.4);
  g.fill();
  g.circle(x + radius * 0.2, y + 2, 1.4);
  g.fill();
}

function resultColor(result: string): Color {
  if (result === 'win') return rgba(174, 63, 44);
  if (result === 'lose') return rgba(43, 86, 154);
  return rgba(38, 54, 76);
}

function displayGuestName(name: string): string {
  return name;
}

function createRuntimeLabel(parent: Node, name: string, text: string, x: number, y: number, fontSize: number, color: Color, align: number, width: number, height: number): Label {
  const node = new Node(name);
  node.layer = parent.layer;
  parent.addChild(node);
  node.setPosition(x, y);
  node.addComponent(UITransform).setContentSize(width, height);
  const label = node.addComponent(Label);
  label.string = text;
  label.fontSize = fontSize;
  label.lineHeight = fontSize + 4;
  label.cacheMode = Label.CacheMode.NONE;
  label.horizontalAlign = align;
  label.verticalAlign = Label.VerticalAlign.CENTER;
  label.overflow = Label.Overflow.SHRINK;
  label.color = color;
  return label;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
