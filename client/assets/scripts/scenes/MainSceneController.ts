import { Color, director, EventTouch, Graphics, Label, Mask, MaskType, Node, Sprite, UITransform } from 'cc';
import { MatchMode } from '../MatchTypes';
import { getCurrentUserDisplayName, logoutCurrentDevice } from '../services/AuthService';
import { MatchRecordSummary, fetchRecentMatchRecords, setSelectedReplayMatchId } from '../services/MatchRecordService';
import { findNode, onTap, rgba } from '../utils/CocosNodeUtils';

export function bindHomeScene(root: Node, selectMatchMode: (mode: MatchMode) => void): void {
  bindTabs(root, 'home');
  bindMatchRecordButton(root);
  onTap(root, 'ButtonAI', () => {
    selectMatchMode('ai');
    director.loadScene('Match');
  });
  onTap(root, 'ButtonOnline', () => {
    selectMatchMode('online');
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
  const name = getCurrentUserDisplayName();
  const nameLabel = findNode(root, 'TextAccount')?.getComponent(Label);
  if (nameLabel) nameLabel.string = name;
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

function bindMatchRecordButton(root: Node): void {
  const old = findNode(root, 'ButtonMatchRecordsRuntime');
  if (old) old.destroy();
  const button = new Node('ButtonMatchRecordsRuntime');
  button.layer = root.layer;
  root.addChild(button);
  button.setPosition(162, 360);
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
  viewport.addComponent(UITransform).setContentSize(348, 610);
  const mask = viewport.addComponent(Mask);
  mask.type = MaskType.GRAPHICS_RECT;
  void fetchRecentMatchRecords(20)
    .then((response) => {
      message.node.destroy();
      if (!response.ok) {
        createRuntimeLabel(overlay, 'MatchRecordError', response.message || '查询失败', 0, 230, 15, rgba(255, 204, 204), Label.HorizontalAlign.CENTER, 300, 28);
        return;
      }
      renderMatchRecords(overlay, viewport, response.records || []);
    })
    .catch((error: Error) => {
      message.node.destroy();
      createRuntimeLabel(overlay, 'MatchRecordError', error.message || '无法连接后端', 0, 230, 15, rgba(255, 204, 204), Label.HorizontalAlign.CENTER, 300, 28);
    });
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

function renderMatchRecords(overlay: Node, viewport: Node, records: MatchRecordSummary[]): void {
  if (records.length === 0) {
    createRuntimeLabel(overlay, 'MatchRecordEmpty', '暂无已完成比赛记录', 0, 230, 16, rgba(226, 240, 255), Label.HorizontalAlign.CENTER, 260, 28);
    return;
  }
  const rows: Node[] = [];
  const rowH = 94;
  const gap = 12;
  const viewportHeight = viewport.getComponent(UITransform)?.contentSize.height || 610;
  const contentHeight = records.length * rowH + Math.max(0, records.length - 1) * gap;
  const scroll = { offset: 0, startY: 0, startOffset: 0 };
  for (let i = 0; i < records.length; i += 1) {
    const row = new Node(`MatchRecordRow_${i}`);
    row.layer = viewport.layer;
    viewport.addChild(row);
    row.addComponent(UITransform).setContentSize(330, rowH);
    row.addComponent(Graphics);
    drawRecordRow(row, records[i]);
    rows.push(row);
  }
  const render = () => {
    const startY = viewportHeight / 2 - rowH / 2 - 4;
    for (let i = 0; i < rows.length; i += 1) {
      const y = startY - i * (rowH + gap) + scroll.offset;
      rows[i].setPosition(0, y);
      rows[i].active = y < viewportHeight / 2 + rowH && y > -viewportHeight / 2 - rowH;
    }
  };
  viewport.on(Node.EventType.TOUCH_START, (event: EventTouch) => {
    scroll.startY = event.getUILocation().y;
    scroll.startOffset = scroll.offset;
  });
  viewport.on(Node.EventType.TOUCH_MOVE, (event: EventTouch) => {
    scroll.offset = clamp(scroll.startOffset + event.getUILocation().y - scroll.startY, 0, Math.max(0, contentHeight - viewportHeight + 12));
    render();
  });
  render();
}

function drawRecordRow(row: Node, record: MatchRecordSummary): void {
  const g = row.getComponent(Graphics) || row.addComponent(Graphics);
  g.clear();
  g.fillColor = rgba(20, 58, 116, 245);
  g.roundRect(-165, -47, 330, 94, 6);
  g.fill();
  g.strokeColor = rgba(140, 198, 255, 180);
  g.lineWidth = 1.5;
  g.roundRect(-165, -47, 330, 94, 6);
  g.stroke();
  drawRecordAvatar(g, -126, 16, 18, rgba(238, 77, 77));
  drawRecordAvatar(g, 126, 16, 18, rgba(74, 135, 232));
  createRuntimeLabel(row, 'SelfName', displayGuestName(record.username), -92, 19, 13, rgba(255, 255, 255), Label.HorizontalAlign.LEFT, 82, 20);
  createRuntimeLabel(row, 'OpponentName', record.opponentUsername || '人机', 38, 19, 13, rgba(255, 255, 255), Label.HorizontalAlign.LEFT, 82, 20);
  createRuntimeLabel(row, 'Score', record.resultScore || '- : -', 0, 16, 24, resultColor(record.result), Label.HorizontalAlign.CENTER, 120, 32).isBold = true;
  createRuntimeLabel(row, 'Time', `${record.matchTime}  ${record.matchType === 'single' ? '单人' : '联机'}`, -150, -21, 11, rgba(188, 213, 244), Label.HorizontalAlign.LEFT, 210, 18);
  const replay = new Node('ReplayButton');
  replay.layer = row.layer;
  row.addChild(replay);
  replay.setPosition(108, -24);
  replay.addComponent(UITransform).setContentSize(72, 28);
  const replayG = replay.addComponent(Graphics);
  replayG.fillColor = rgba(255, 204, 64, 255);
  replayG.roundRect(-36, -14, 72, 28, 5);
  replayG.fill();
  createRuntimeLabel(replay, 'ReplayLabel', '回放', 0, 0, 13, rgba(35, 38, 48), Label.HorizontalAlign.CENTER, 60, 20).isBold = true;
  replay.on(Node.EventType.TOUCH_END, () => {
    setSelectedReplayMatchId(record.matchId);
    director.loadScene('Match');
  });
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
  if (result === 'win') return rgba(255, 236, 156);
  if (result === 'lose') return rgba(176, 213, 255);
  return rgba(255, 255, 255);
}

function displayGuestName(name: string): string {
  return name === '游客 10086' || name.toLowerCase() === 'guest' ? '游客' : name;
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
