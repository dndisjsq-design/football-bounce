import { Color, EventTouch, Graphics, Label, Mask, MaskType, Node, Sprite, UITransform, director } from 'cc';
import { FormationDefinition, getPreviewFormationPoints, getShopFormations } from '../services/FormationService';
import { PlayerRarity, RosterPlayer } from '../services/PlayerRosterService';
import { fetchShopPlayers } from '../services/ShopCatalogApiService';
import { getCurrentCoins } from '../services/WalletService';
import { drawPlayerAvatar, renderPricedPlayerCard } from '../ui/PlayerCardView';
import { findNode, onTap, rgba } from '../utils/CocosNodeUtils';
import { bindTabs } from './MainSceneController';

const PLAYER_CARD_WIDTH = 62;
const PLAYER_CARD_HEIGHT = 88;
const PLAYER_CARD_GAP_X = 7;
const PLAYER_CARD_GAP_Y = 8;
const PLAYER_COLUMNS = 5;
const FORMATION_CARD_WIDTH = 156;
const FORMATION_CARD_HEIGHT = 106;
const FORMATION_COLUMNS = 2;
const FORMATION_GAP_X = 14;
const FORMATION_GAP_Y = 14;

interface ScrollState {
  offset: number;
  startY: number;
  startOffset: number;
}

interface PlayerShopProfile {
  intro: string;
  bodyType: string;
  nationality: string;
  club: string;
  height: number;
  weight: number;
  age: number;
  power: number;
  accuracy: number;
  curve: number;
  stamina: number;
  body: number;
  skills: string;
}

interface PlayerDetailOptions {
  showPurchase?: boolean;
}

export function bindShopHomeScene(root: Node): void {
  bindTabs(root, 'shop');
  bindShopCurrency(root);
  drawShopButton(root, 'ButtonShopFormations', rgba(255, 128, 31), rgba(203, 71, 42));
  drawShopButton(root, 'ButtonShopNormalPlayers', rgba(0, 185, 224), rgba(31, 104, 205));
  drawShopButton(root, 'ButtonShopLegendPlayers', rgba(180, 72, 232), rgba(218, 82, 92));
  drawShopButton(root, 'ButtonShopOther', rgba(38, 207, 132), rgba(30, 142, 94));
  onTap(root, 'ButtonShopFormations', () => director.loadScene('ShopFormations'));
  onTap(root, 'ButtonShopNormalPlayers', () => director.loadScene('ShopNormalPlayers'));
  onTap(root, 'ButtonShopLegendPlayers', () => director.loadScene('ShopLegendPlayers'));
  onTap(root, 'ButtonShopOther', () => director.loadScene('ShopPacks'));
}

export function bindShopPlayerScene(root: Node, rarities: PlayerRarity[]): void {
  bindTabs(root, 'shop');
  bindShopCurrency(root);
  onTap(root, 'ButtonBackShop', () => director.loadScene('Shop'));
  setListStatus(root, '加载球员列表...');
  void fetchShopPlayers().then((players) => {
    setListStatus(root, '');
    const allowed = new Set<PlayerRarity>(rarities);
    const filtered = players
      .filter((player) => allowed.has(player.rarity))
      .sort((a, b) => rarityRank(a.rarity) - rarityRank(b.rarity) || b.score - a.score);
    const controller = new ShopPlayerList(root, filtered);
    controller.start();
  }).catch((error: Error) => {
    setListStatus(root, error.message || '球员列表加载失败');
  });
}

export function bindShopFormationScene(root: Node): void {
  bindTabs(root, 'shop');
  bindShopCurrency(root);
  onTap(root, 'ButtonBackShop', () => director.loadScene('Shop'));
  const controller = new ShopFormationList(root, getShopFormations());
  controller.start();
}

class ShopPlayerList {
  private root: Node;
  private players: RosterPlayer[];
  private cards: Node[] = [];
  private scroll: ScrollState = { offset: 0, startY: 0, startOffset: 0 };

  constructor(root: Node, players: RosterPlayer[]) {
    this.root = root;
    this.players = players;
  }

  start(): void {
    const viewport = this.viewport;
    if (!viewport) return;
    const mask = viewport.getComponent(Mask) || viewport.addComponent(Mask);
    mask.type = MaskType.GRAPHICS_RECT;
    viewport.on(Node.EventType.TOUCH_START, (event: EventTouch) => {
      this.scroll.startY = event.getUILocation().y;
      this.scroll.startOffset = this.scroll.offset;
    });
    viewport.on(Node.EventType.TOUCH_MOVE, (event: EventTouch) => {
      this.scroll.offset = clamp(this.scroll.startOffset + event.getUILocation().y - this.scroll.startY, 0, this.maxScroll());
      this.render();
    });
    this.createCards();
    this.render();
  }

  private createCards(): void {
    const viewport = this.viewport;
    if (!viewport) return;
    this.cards = this.players.map((player) => {
      const card = new Node(`ShopPlayer_${player.id}`);
      card.layer = viewport.layer;
      viewport.addChild(card);
      card.addComponent(UITransform).setContentSize(PLAYER_CARD_WIDTH, PLAYER_CARD_HEIGHT);
      card.addComponent(Graphics);
      bindCardTap(card, () => showPlayerDetail(this.root, player));
      return card;
    });
  }

  private render(): void {
    const viewport = this.viewport;
    if (!viewport) return;
    const size = viewport.getComponent(UITransform)?.contentSize;
    const width = size?.width || 348;
    const height = size?.height || 560;
    const startX = -width / 2 + PLAYER_CARD_WIDTH / 2 + 8;
    const startY = height / 2 - PLAYER_CARD_HEIGHT / 2 - 8;
    for (let i = 0; i < this.cards.length; i += 1) {
      const col = i % PLAYER_COLUMNS;
      const row = Math.floor(i / PLAYER_COLUMNS);
      const x = startX + col * (PLAYER_CARD_WIDTH + PLAYER_CARD_GAP_X);
      const y = startY - row * (PLAYER_CARD_HEIGHT + PLAYER_CARD_GAP_Y) + this.scroll.offset;
      const card = this.cards[i];
      card.setPosition(x, y);
      card.active = y < height / 2 + PLAYER_CARD_HEIGHT && y > -height / 2 - PLAYER_CARD_HEIGHT;
      renderPricedPlayerCard(card, this.players[i], getPlayerPrice(this.players[i]), { width: PLAYER_CARD_WIDTH, height: PLAYER_CARD_HEIGHT });
    }
  }

  private maxScroll(): number {
    const height = this.viewport?.getComponent(UITransform)?.contentSize.height || 560;
    const rows = Math.ceil(this.players.length / PLAYER_COLUMNS);
    const contentHeight = rows * PLAYER_CARD_HEIGHT + Math.max(0, rows - 1) * PLAYER_CARD_GAP_Y + 16;
    return Math.max(0, contentHeight - height);
  }

  private get viewport(): Node | null {
    return findNode(this.root, 'ShopListViewport');
  }
}

class ShopFormationList {
  private root: Node;
  private formations: FormationDefinition[];
  private cards: Node[] = [];
  private scroll: ScrollState = { offset: 0, startY: 0, startOffset: 0 };

  constructor(root: Node, formations: FormationDefinition[]) {
    this.root = root;
    this.formations = formations;
  }

  start(): void {
    const viewport = this.viewport;
    if (!viewport) return;
    const mask = viewport.getComponent(Mask) || viewport.addComponent(Mask);
    mask.type = MaskType.GRAPHICS_RECT;
    viewport.on(Node.EventType.TOUCH_START, (event: EventTouch) => {
      this.scroll.startY = event.getUILocation().y;
      this.scroll.startOffset = this.scroll.offset;
    });
    viewport.on(Node.EventType.TOUCH_MOVE, (event: EventTouch) => {
      this.scroll.offset = clamp(this.scroll.startOffset + event.getUILocation().y - this.scroll.startY, 0, this.maxScroll());
      this.render();
    });
    this.createCards();
    this.render();
  }

  private createCards(): void {
    const viewport = this.viewport;
    if (!viewport) return;
    this.cards = this.formations.map((formation) => {
      const card = new Node(`ShopFormation_${formation.id}`);
      card.layer = viewport.layer;
      viewport.addChild(card);
      card.addComponent(UITransform).setContentSize(FORMATION_CARD_WIDTH, FORMATION_CARD_HEIGHT);
      card.addComponent(Graphics);
      createLabel(card, 'Code', formation.code, 14, -FORMATION_CARD_HEIGHT / 2 + 22);
      createLabel(card, 'Price', `价格 ${getFormationPrice(formation)}`, 11, -FORMATION_CARD_HEIGHT / 2 + 8, rgba(255, 221, 92));
      bindCardTap(card, () => showFormationDetail(this.root, formation));
      return card;
    });
  }

  private render(): void {
    const viewport = this.viewport;
    if (!viewport) return;
    const size = viewport.getComponent(UITransform)?.contentSize;
    const width = size?.width || 348;
    const height = size?.height || 560;
    const startX = -width / 2 + FORMATION_CARD_WIDTH / 2 + 8;
    const startY = height / 2 - FORMATION_CARD_HEIGHT / 2 - 8;
    for (let i = 0; i < this.cards.length; i += 1) {
      const col = i % FORMATION_COLUMNS;
      const row = Math.floor(i / FORMATION_COLUMNS);
      const x = startX + col * (FORMATION_CARD_WIDTH + FORMATION_GAP_X);
      const y = startY - row * (FORMATION_CARD_HEIGHT + FORMATION_GAP_Y) + this.scroll.offset;
      const card = this.cards[i];
      card.setPosition(x, y);
      card.active = y < height / 2 + FORMATION_CARD_HEIGHT && y > -height / 2 - FORMATION_CARD_HEIGHT;
      drawFormationCard(card, this.formations[i]);
    }
  }

  private maxScroll(): number {
    const height = this.viewport?.getComponent(UITransform)?.contentSize.height || 560;
    const rows = Math.ceil(this.formations.length / FORMATION_COLUMNS);
    const contentHeight = rows * FORMATION_CARD_HEIGHT + Math.max(0, rows - 1) * FORMATION_GAP_Y + 16;
    return Math.max(0, contentHeight - height);
  }

  private get viewport(): Node | null {
    return findNode(this.root, 'ShopListViewport');
  }
}

function bindShopCurrency(root: Node): void {
  const coins = String(getCurrentCoins());
  setLabelText(root, 'TextCoins', `金币 ${coins}`);
  setLabelText(root, 'TextShopCoins', `金币 ${coins}`);
}

function setLabelText(root: Node, nodeName: string, text: string): void {
  const label = findNode(root, nodeName)?.getComponent(Label);
  if (label) label.string = text;
}

function setListStatus(root: Node, text: string): void {
  setLabelText(root, 'TextShopCoins', text || `金币 ${getCurrentCoins()}`);
}

function rarityRank(rarity: PlayerRarity): number {
  if (rarity === 'red') return 0;
  if (rarity === 'orange') return 1;
  if (rarity === 'purple') return 2;
  return 3;
}

function drawShopButton(root: Node, name: string, top: Color, bottom: Color): void {
  const node = findNode(root, name);
  if (!node) return;
  const sprite = node.getComponent(Sprite);
  if (sprite) sprite.enabled = false;
  const size = node.getComponent(UITransform)?.contentSize;
  const w = size?.width || 300;
  const h = size?.height || 86;
  const g = node.getComponent(Graphics) || node.addComponent(Graphics);
  g.clear();
  g.fillColor = bottom;
  g.rect(-w / 2, -h / 2 - 7, w, h);
  g.fill();
  g.fillColor = top;
  g.rect(-w / 2, -h / 2, w, h);
  g.fill();
  g.fillColor = rgba(255, 255, 255, 48);
  g.rect(-w / 2 + 8, h / 2 - 24, w - 16, 14);
  g.fill();
  g.strokeColor = rgba(255, 255, 255, 188);
  g.lineWidth = 2;
  g.rect(-w / 2 + 2, -h / 2 + 2, w - 4, h - 4);
  g.stroke();
}

function drawFormationCard(card: Node, formation: FormationDefinition): void {
  const g = card.getComponent(Graphics);
  if (!g) return;
  g.clear();
  g.fillColor = rgba(24, 50, 88);
  g.rect(-FORMATION_CARD_WIDTH / 2, -FORMATION_CARD_HEIGHT / 2, FORMATION_CARD_WIDTH, FORMATION_CARD_HEIGHT);
  g.fill();
  g.strokeColor = rgba(255, 255, 255, 168);
  g.lineWidth = 1.5;
  g.rect(-FORMATION_CARD_WIDTH / 2 + 2, -FORMATION_CARD_HEIGHT / 2 + 2, FORMATION_CARD_WIDTH - 4, FORMATION_CARD_HEIGHT - 4);
  g.stroke();

  const pitchW = 110;
  const pitchH = 66;
  const pitchY = 14;
  for (let y = pitchY - pitchH / 2, index = 0; y < pitchY + pitchH / 2; y += 11, index += 1) {
    g.fillColor = index % 2 === 0 ? rgba(37, 130, 65, 235) : rgba(78, 178, 81, 235);
    g.rect(-pitchW / 2, y, pitchW, Math.min(11, pitchY + pitchH / 2 - y));
    g.fill();
  }
  g.strokeColor = rgba(236, 252, 232, 135);
  g.lineWidth = 1.3;
  g.rect(-pitchW / 2, pitchY - pitchH / 2, pitchW, pitchH);
  g.stroke();
  g.moveTo(-pitchW / 2, pitchY);
  g.lineTo(pitchW / 2, pitchY);
  g.stroke();
  g.circle(0, pitchY, 11);
  g.stroke();
  const points = getPreviewFormationPoints(formation, pitchW * 0.72, pitchH * 0.72);
  g.fillColor = rgba(238, 77, 77, 245);
  for (const point of points) {
    g.circle(point.x, pitchY + point.y, 4.2);
    g.fill();
  }
}

function drawFormationPitch(g: Graphics, formation: FormationDefinition, pitchW: number, pitchH: number, pitchY: number, markerRadius: number): void {
  for (let y = pitchY - pitchH / 2, index = 0; y < pitchY + pitchH / 2; y += pitchH / 6, index += 1) {
    g.fillColor = index % 2 === 0 ? rgba(37, 130, 65, 235) : rgba(78, 178, 81, 235);
    g.rect(-pitchW / 2, y, pitchW, Math.min(pitchH / 6, pitchY + pitchH / 2 - y));
    g.fill();
  }
  g.strokeColor = rgba(236, 252, 232, 160);
  g.lineWidth = 1.8;
  g.rect(-pitchW / 2, pitchY - pitchH / 2, pitchW, pitchH);
  g.stroke();
  g.moveTo(-pitchW / 2, pitchY);
  g.lineTo(pitchW / 2, pitchY);
  g.stroke();
  g.circle(0, pitchY, pitchH * 0.16);
  g.stroke();
  const points = getPreviewFormationPoints(formation, pitchW * 0.72, pitchH * 0.72);
  g.fillColor = rgba(238, 77, 77, 245);
  g.strokeColor = rgba(255, 255, 255, 210);
  g.lineWidth = 1.2;
  for (const point of points) {
    g.circle(point.x, pitchY + point.y, markerRadius);
    g.fill();
    g.circle(point.x, pitchY + point.y, markerRadius);
    g.stroke();
  }
}

function getPlayerPrice(player: RosterPlayer): number {
  if (player.rarity === 'red') return player.score * 100;
  if (player.rarity === 'orange') return player.score * 10;
  if (player.rarity === 'purple') return player.score;
  return Math.floor(player.score / 10);
}

function getFormationPrice(formation: FormationDefinition): number {
  const count = formation.points.length;
  if (count <= 3) return 100;
  if (count === 4) return 500;
  return 1000;
}

function bindCardTap(card: Node, handler: () => void): void {
  let startX = 0;
  let startY = 0;
  let moved = false;
  card.on(Node.EventType.TOUCH_START, (event: EventTouch) => {
    const point = event.getUILocation();
    startX = point.x;
    startY = point.y;
    moved = false;
  });
  card.on(Node.EventType.TOUCH_MOVE, (event: EventTouch) => {
    const point = event.getUILocation();
    if (Math.abs(point.x - startX) > 8 || Math.abs(point.y - startY) > 8) moved = true;
  });
  card.on(Node.EventType.TOUCH_END, (event: EventTouch) => {
    if (!card.active || moved) return;
    event.propagationStopped = true;
    handler();
  });
}

export function showPlayerDetail(root: Node, player: RosterPlayer, options: PlayerDetailOptions = { showPurchase: true }): void {
  const overlay = createOverlay(root);
  const panel = createPanel(overlay, 'PlayerDetailPanel', 0, -4, 350, 716);
  const profile = getPlayerProfile(player);
  const price = getPlayerPrice(player);
  const showPurchase = options.showPurchase !== false;
  const rarity = rarityName(player.rarity);

  createDetailLabel(panel, 'PlayerDetailTitle', player.name, 0, 320, 30, 300, 40, rgba(255, 246, 130), true);
  createDetailLabel(panel, 'PlayerDetailRarity', `${rarity}球员  |  评分 ${player.score}  |  价格 ${price}`, 0, 290, 14, 320, 24, rgba(255, 221, 92), true);

  const avatar = createUiNode(panel, 'PlayerDetailAvatar', -112, 246, 82, 82);
  const avatarGraphics = avatar.addComponent(Graphics);
  drawPlayerAvatar(avatarGraphics, 0, 0, 36, player);
  createTextBox(panel, 'PlayerDetailIntroBox', 58, 232, 198, 80, profile.intro, 13, 12);

  const rows: Array<[string, string]> = [
    ['能力值', String(player.score)],
    ['体型', profile.bodyType],
    ['国籍', profile.nationality],
    ['俱乐部', profile.club],
    ['身高体重', `${profile.height}cm / ${profile.weight}kg`],
    ['年龄', `${profile.age}岁`],
    ['技能介绍', profile.skills],
    ['力度大小', String(profile.power)],
    ['准度（方向线长度）', String(profile.accuracy)],
    ['弧度', String(profile.curve)],
    ['体力', String(profile.stamina)],
    ['身体强度', String(profile.body)],
  ];
  rows.forEach(([label, value], index) => {
    const y = 156 - index * 28;
    createDetailLabel(panel, `PlayerDetailKey_${index}`, label, -96, y, 13, 120, 24, rgba(159, 189, 230), true, Label.HorizontalAlign.LEFT);
    createDetailLabel(panel, `PlayerDetailValue_${index}`, value, 64, y, 13, 188, 24, rgba(245, 249, 255), index === 0, Label.HorizontalAlign.LEFT);
  });

  createDetailButton(panel, 'PlayerDetailClose', '关闭', showPurchase ? -86 : 0, -322, 112, 42, rgba(84, 102, 132), () => overlay.destroy());
  if (showPurchase) {
    createDetailButton(panel, 'PlayerDetailBuy', '购买', 86, -322, 112, 42, rgba(255, 128, 31), () => {
      showPurchaseConfirm(overlay, player.name, price);
    });
  }
}

function showFormationDetail(root: Node, formation: FormationDefinition): void {
  const overlay = createOverlay(root);
  const panel = createPanel(overlay, 'FormationDetailPanel', 0, -4, 350, 716);
  const price = getFormationPrice(formation);
  createDetailLabel(panel, 'FormationDetailTitle', formation.name, 0, 320, 30, 300, 40, rgba(255, 246, 130), true);
  createDetailLabel(panel, 'FormationDetailCode', `${formation.code}  |  ${formation.points.length} 人阵型  |  价格 ${price}`, 0, 290, 14, 310, 24, rgba(255, 221, 92), true);

  const pitch = createUiNode(panel, 'FormationDetailPitch', 0, 145, 294, 190);
  const pitchGraphics = pitch.addComponent(Graphics);
  pitchGraphics.fillColor = rgba(15, 48, 82);
  pitchGraphics.rect(-147, -95, 294, 190);
  pitchGraphics.fill();
  drawFormationPitch(pitchGraphics, formation, 254, 154, 0, 7);

  const intro = `阵型介绍：${formation.description}。${getFormationIntro(formation)}`;
  createTextBox(panel, 'FormationDetailIntroBox', 0, -18, 294, 110, intro, 14, 17);
  createDetailLabel(panel, 'FormationDetailPrice', `购买价格：${price}`, 0, -112, 16, 292, 30, rgba(255, 221, 92), true);

  createDetailButton(panel, 'FormationDetailClose', '关闭', -86, -322, 112, 42, rgba(84, 102, 132), () => overlay.destroy());
  createDetailButton(panel, 'FormationDetailBuy', '购买', 86, -322, 112, 42, rgba(255, 128, 31), () => {
    showPurchaseConfirm(overlay, formation.name, price);
  });
}

function createOverlay(root: Node): Node {
  findNode(root, 'ShopDetailOverlay')?.destroy();
  const overlay = createUiNode(root, 'ShopDetailOverlay', 0, 0, 390, 844);
  const g = overlay.addComponent(Graphics);
  g.fillColor = rgba(4, 10, 24, 190);
  g.rect(-195, -422, 390, 844);
  g.fill();
  const stop = (event: EventTouch) => {
    event.propagationStopped = true;
  };
  overlay.on(Node.EventType.TOUCH_START, stop);
  overlay.on(Node.EventType.TOUCH_MOVE, stop);
  overlay.on(Node.EventType.TOUCH_END, stop);
  return overlay;
}

function createPanel(parent: Node, name: string, x: number, y: number, width: number, height: number): Node {
  const panel = createUiNode(parent, name, x, y, width, height);
  const g = panel.addComponent(Graphics);
  g.fillColor = rgba(18, 47, 88, 248);
  g.rect(-width / 2, -height / 2, width, height);
  g.fill();
  g.strokeColor = rgba(112, 177, 255, 210);
  g.lineWidth = 2;
  g.rect(-width / 2 + 2, -height / 2 + 2, width - 4, height - 4);
  g.stroke();
  g.fillColor = rgba(255, 255, 255, 26);
  g.rect(-width / 2 + 8, height / 2 - 56, width - 16, 38);
  g.fill();
  return panel;
}

function createUiNode(parent: Node, name: string, x: number, y: number, width: number, height: number): Node {
  const node = new Node(name);
  node.layer = parent.layer;
  parent.addChild(node);
  node.setPosition(x, y);
  node.addComponent(UITransform).setContentSize(width, height);
  return node;
}

function createTextBox(parent: Node, name: string, x: number, y: number, width: number, height: number, text: string, fontSize: number, maxCharsPerLine: number): Node {
  const box = createUiNode(parent, name, x, y, width, height);
  const g = box.addComponent(Graphics);
  g.fillColor = rgba(8, 28, 58, 190);
  g.rect(-width / 2, -height / 2, width, height);
  g.fill();
  g.strokeColor = rgba(148, 201, 255, 185);
  g.lineWidth = 1.5;
  g.rect(-width / 2 + 1.5, -height / 2 + 1.5, width - 3, height - 3);
  g.stroke();
  createDetailLabel(box, `${name}_Text`, wrapText(text, maxCharsPerLine), 0, 0, fontSize, width - 16, height - 14, rgba(231, 241, 255), false, Label.HorizontalAlign.LEFT, true, Label.VerticalAlign.TOP);
  return box;
}

function wrapText(text: string, maxCharsPerLine: number): string {
  const lines: string[] = [];
  let remaining = text;
  while (remaining.length > maxCharsPerLine) {
    let breakAt = maxCharsPerLine;
    if (isPunctuation(remaining.charAt(breakAt))) breakAt = Math.max(1, maxCharsPerLine - 1);
    lines.push(remaining.slice(0, breakAt));
    remaining = remaining.slice(breakAt);
  }
  if (remaining) lines.push(remaining);
  return lines.join('\n');
}

function isPunctuation(char: string): boolean {
  return '，。！？：；、,.!?:;'.indexOf(char) >= 0;
}

function createDetailLabel(
  parent: Node,
  name: string,
  value: string,
  x: number,
  y: number,
  fontSize: number,
  width: number,
  height: number,
  textColor: Color,
  bold = false,
  align = Label.HorizontalAlign.CENTER,
  wrap = false,
  verticalAlign = Label.VerticalAlign.CENTER,
): Label {
  const node = createUiNode(parent, name, x, y, width, height);
  const label = node.addComponent(Label);
  label.string = value;
  label.fontSize = fontSize;
  label.lineHeight = fontSize + 6;
  label.isBold = bold;
  label.cacheMode = Label.CacheMode.NONE;
  label.color = textColor;
  label.horizontalAlign = align;
  label.verticalAlign = verticalAlign;
  label.enableWrapText = wrap;
  label.overflow = wrap ? Label.Overflow.CLAMP : Label.Overflow.SHRINK;
  return label;
}

function createDetailButton(parent: Node, name: string, label: string, x: number, y: number, width: number, height: number, color: Color, onClick: () => void): Node {
  const button = createUiNode(parent, name, x, y, width, height);
  const g = button.addComponent(Graphics);
  drawDetailButton(g, width, height, color, false);
  createDetailLabel(button, `${name}_Label`, label, 0, 0, 16, width, height, rgba(255, 255, 255), true);
  button.on(Node.EventType.TOUCH_START, (event: EventTouch) => {
    event.propagationStopped = true;
    drawDetailButton(g, width, height, color, true);
  });
  button.on(Node.EventType.TOUCH_CANCEL, (event: EventTouch) => {
    event.propagationStopped = true;
    drawDetailButton(g, width, height, color, false);
  });
  button.on(Node.EventType.TOUCH_END, (event: EventTouch) => {
    event.propagationStopped = true;
    drawDetailButton(g, width, height, color, false);
    onClick();
  });
  return button;
}

function drawDetailButton(g: Graphics, width: number, height: number, color: Color, pressed: boolean): void {
  g.clear();
  g.fillColor = rgba(Math.max(0, color.r - 54), Math.max(0, color.g - 54), Math.max(0, color.b - 54), color.a);
  g.rect(-width / 2, -height / 2 - (pressed ? 2 : 6), width, height);
  g.fill();
  g.fillColor = color;
  g.rect(-width / 2, -height / 2 + (pressed ? -2 : 0), width, height);
  g.fill();
  g.strokeColor = rgba(255, 255, 255, 150);
  g.lineWidth = 1.5;
  g.rect(-width / 2 + 2, -height / 2 + 2 + (pressed ? -2 : 0), width - 4, height - 4);
  g.stroke();
}

function showPurchaseConfirm(overlay: Node, itemName: string, price: number): void {
  findNode(overlay, 'PurchaseConfirm')?.destroy();
  const shade = createUiNode(overlay, 'PurchaseConfirm', 0, 0, 390, 844);
  const shadeGraphics = shade.addComponent(Graphics);
  shadeGraphics.fillColor = rgba(2, 6, 16, 140);
  shadeGraphics.rect(-195, -422, 390, 844);
  shadeGraphics.fill();
  const panel = createPanel(shade, 'PurchaseConfirmPanel', 0, 0, 304, 206);
  createDetailLabel(panel, 'PurchaseConfirmTitle', '确认购买', 0, 66, 22, 240, 34, rgba(255, 246, 130), true);
  createDetailLabel(panel, 'PurchaseConfirmText', `${itemName}\n价格 ${price}`, 0, 18, 16, 240, 60, rgba(245, 249, 255), true, Label.HorizontalAlign.CENTER, true);
  createDetailButton(panel, 'PurchaseCancel', '取消', -70, -68, 104, 40, rgba(84, 102, 132), () => shade.destroy());
  createDetailButton(panel, 'PurchaseConfirmButton', '确认', 70, -68, 104, 40, rgba(255, 128, 31), () => {
    shade.destroy();
  });
}

function getPlayerProfile(player: RosterPlayer): PlayerShopProfile {
  const seed = player.avatarSeed;
  const score = player.score;
  const style = ['直线爆破', '弧线控场', '贴墙反弹', '二次补射', '防守卡位'][seed % 5];
  const temperament = ['我喜欢把节奏拉快，用第一脚弹射打开局面。', '我会先看角度，再用弧线把球送到最难防的位置。', '我不怕身体对抗，越混乱越能抢到第二落点。', '我擅长贴边走位，能把死角变成进攻路线。'][seed % 4];
  const skillA = ['强力弹射', '精准制导', '外弧修正', '撞墙加速', '稳定回防'][seed % 5];
  const skillB = ['禁区抢点', '长线推进', '角度封锁', '连续碰撞', '耐力压制'][(seed + 2) % 5];
  const bodyType = ['灵巧型', '均衡型', '精瘦型', '强壮型', '高大型', '爆发型'][seed % 6];
  const nationality = ['巴西', '阿根廷', '葡萄牙', '法国', '英格兰', '西班牙', '德国', '意大利', '荷兰', '日本'][(seed + score) % 10];
  const club = ['绿茵闪电', '北城弹射', '海港飞翼', '山城火炮', '蓝湾竞技', '红塔联队', '银河冲锋', '星河守卫'][(seed * 3 + score) % 8];
  const rarityBoost = player.rarity === 'red' ? 8 : player.rarity === 'orange' ? 5 : player.rarity === 'purple' ? 2 : 0;
  return {
    intro: `${temperament}定位是${style}。`,
    bodyType,
    nationality,
    club,
    height: 168 + ((seed * 7) % 27),
    weight: 62 + ((seed * 5) % 25),
    age: 18 + ((seed * 3) % 17),
    power: clamp(score + rarityBoost - (seed % 3), 1, 100),
    accuracy: clamp(score - 3 + (seed % 6), 1, 100),
    curve: clamp(score - 7 + ((seed * 2) % 9), 1, 100),
    stamina: clamp(score - 4 + ((seed + 3) % 7), 1, 100),
    body: clamp(score - 6 + ((seed + 1) % 8), 1, 100),
    skills: `${skillA} / ${skillB}`,
  };
}

function getFormationIntro(formation: FormationDefinition): string {
  const count = formation.points.length;
  if (count === 3) return '站位简洁，适合低成本快速反击。';
  if (count === 4) return '中后场覆盖更完整，攻守切换稳定。';
  return '五点联动空间最大，适合完整阵容压迫和连续传导。';
}

function rarityName(rarity: PlayerRarity): string {
  if (rarity === 'red') return '红色';
  if (rarity === 'orange') return '橙色';
  if (rarity === 'purple') return '紫色';
  return '蓝色';
}

function createLabel(parent: Node, name: string, value: string, fontSize: number, y: number, textColor = rgba(255, 255, 255, 245)): Label {
  const node = new Node(name);
  node.layer = parent.layer;
  parent.addChild(node);
  node.setPosition(0, y);
  const parentWidth = parent.getComponent(UITransform)?.contentSize.width || Math.max(PLAYER_CARD_WIDTH, FORMATION_CARD_WIDTH);
  node.addComponent(UITransform).setContentSize(parentWidth - 6, 16);
  const label = node.addComponent(Label);
  label.string = value;
  label.fontSize = fontSize;
  label.lineHeight = fontSize + 2;
  label.isBold = true;
  label.cacheMode = Label.CacheMode.NONE;
  label.horizontalAlign = Label.HorizontalAlign.CENTER;
  label.verticalAlign = Label.VerticalAlign.CENTER;
  label.color = textColor;
  return label;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
