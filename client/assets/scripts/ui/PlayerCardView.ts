import { Color, Graphics, Label, Node, UITransform } from 'cc';
import { PlayerRarity, RosterPlayer } from '../services/PlayerRosterService';
import { rgba } from '../utils/CocosNodeUtils';

export interface PlayerCardRenderOptions {
  width: number;
  height: number;
  selected?: boolean;
  alpha?: number;
  price?: number;
  nameFontSize?: number;
  scoreFontSize?: number;
  priceFontSize?: number;
  avatarRadius?: number;
  avatarY?: number;
  nameY?: number;
  scoreY?: number;
  priceY?: number;
}

export function renderStandardPlayerCard(card: Node, player: RosterPlayer, options: Omit<PlayerCardRenderOptions, 'price'>): void {
  renderPlayerCard(card, player, options);
}

export function renderPricedPlayerCard(card: Node, player: RosterPlayer, price: number, options: Omit<PlayerCardRenderOptions, 'price'>): void {
  renderPlayerCard(card, player, { ...options, price });
}

export function renderPlayerCard(card: Node, player: RosterPlayer, options: PlayerCardRenderOptions): void {
  const width = options.width;
  const height = options.height;
  const alpha = options.alpha ?? 255;
  const selected = options.selected === true;
  const hasPrice = options.price !== undefined;
  const transform = card.getComponent(UITransform) || card.addComponent(UITransform);
  transform.setContentSize(width, height);
  const g = card.getComponent(Graphics) || card.addComponent(Graphics);
  const color = playerCardColors(player.rarity);

  g.clear();
  g.fillColor = withAlpha(color.base, alpha);
  g.rect(-width / 2, -height / 2, width, height);
  g.fill();
  g.fillColor = withAlpha(color.shine, Math.min(alpha, 92));
  g.rect(-width / 2, height / 2 - Math.min(22, height * 0.32), width, Math.min(22, height * 0.32));
  g.fill();
  g.strokeColor = selected ? rgba(255, 255, 255, alpha) : withAlpha(color.edge, alpha);
  g.lineWidth = selected ? 3 : 1.5;
  g.rect(-width / 2 + 1.5, -height / 2 + 1.5, width - 3, height - 3);
  g.stroke();

  const avatarRadius = options.avatarRadius ?? Math.min(15, width * 0.24);
  const avatarY = options.avatarY ?? (hasPrice ? 14 : 12);
  drawPlayerAvatar(g, 0, avatarY, avatarRadius, player);

  setCardLabel(card, 'PlayerCardName', player.name, options.nameFontSize ?? 10, options.nameY ?? (hasPrice ? -8 : -10), width - 6, 16, rgba(255, 255, 255, alpha), true);
  setCardLabel(card, 'PlayerCardScore', `评分 ${player.score}`, options.scoreFontSize ?? 9, options.scoreY ?? (hasPrice ? -23 : -26), width - 6, 14, rgba(255, 255, 255, alpha), true);
  const priceLabel = findDirectChild(card, 'PlayerCardPrice')?.getComponent(Label);
  if (hasPrice) {
    setCardLabel(card, 'PlayerCardPrice', `价格 ${options.price}`, options.priceFontSize ?? 9, options.priceY ?? -36, width - 6, 14, rgba(255, 221, 92, alpha), true).node.active = true;
  } else if (priceLabel) {
    priceLabel.node.active = false;
  }
}

export function drawPlayerAvatar(g: Graphics, x: number, y: number, radius: number, player: RosterPlayer): void {
  const skin = [rgba(246, 198, 146), rgba(236, 170, 120), rgba(225, 150, 104), rgba(248, 210, 164)][player.avatarSeed % 4];
  const hair = [rgba(32, 28, 30), rgba(82, 50, 31), rgba(224, 190, 88), rgba(18, 39, 64)][player.avatarSeed % 4];
  g.fillColor = rgba(255, 255, 255, 210);
  g.circle(x, y, radius + 2);
  g.fill();
  g.fillColor = skin;
  g.circle(x, y, radius);
  g.fill();
  g.fillColor = hair;
  g.moveTo(x - radius, y + radius * 0.2);
  g.bezierCurveTo(x - radius * 0.7, y + radius * 1.15, x + radius * 0.7, y + radius * 1.15, x + radius, y + radius * 0.15);
  g.lineTo(x + radius, y + radius * 0.5);
  g.bezierCurveTo(x + radius * 0.35, y + radius * 0.95, x - radius * 0.35, y + radius * 0.95, x - radius, y + radius * 0.5);
  g.close();
  g.fill();
  g.fillColor = rgba(31, 38, 48, 240);
  g.circle(x - radius * 0.35, y - radius * 0.08, 1.5);
  g.fill();
  g.circle(x + radius * 0.35, y - radius * 0.08, 1.5);
  g.fill();
  g.strokeColor = rgba(115, 55, 48, 190);
  g.lineWidth = 1;
  g.moveTo(x - radius * 0.25, y - radius * 0.45);
  g.lineTo(x + radius * 0.25, y - radius * 0.45);
  g.stroke();
}

export function playerCardColors(rarity: PlayerRarity): { base: Color; edge: Color; shine: Color } {
  if (rarity === 'red') return { base: rgba(190, 42, 51), edge: rgba(255, 225, 214), shine: rgba(255, 118, 106, 92) };
  if (rarity === 'orange') return { base: rgba(205, 111, 27), edge: rgba(255, 229, 166), shine: rgba(255, 178, 72, 92) };
  if (rarity === 'purple') return { base: rgba(111, 65, 185), edge: rgba(219, 201, 255), shine: rgba(158, 116, 236, 92) };
  return { base: rgba(45, 107, 188), edge: rgba(192, 220, 255), shine: rgba(84, 150, 234, 92) };
}

export function withAlpha(color: Color, alpha: number): Color {
  return rgba(color.r, color.g, color.b, alpha);
}

function setCardLabel(parent: Node, name: string, value: string, fontSize: number, y: number, width: number, height: number, color: Color, bold: boolean): Label {
  let node = findDirectChild(parent, name);
  if (!node) {
    node = new Node(name);
    node.layer = parent.layer;
    parent.addChild(node);
    node.addComponent(UITransform);
    node.addComponent(Label);
  }
  node.active = true;
  node.setPosition(0, y);
  const transform = node.getComponent(UITransform) || node.addComponent(UITransform);
  transform.setContentSize(width, height);
  const label = node.getComponent(Label) || node.addComponent(Label);
  label.string = value;
  label.fontSize = fontSize;
  label.lineHeight = fontSize + 3;
  label.isBold = bold;
  label.cacheMode = Label.CacheMode.NONE;
  label.horizontalAlign = Label.HorizontalAlign.CENTER;
  label.verticalAlign = Label.VerticalAlign.CENTER;
  label.enableWrapText = false;
  label.overflow = Label.Overflow.SHRINK;
  label.color = color;
  return label;
}

function findDirectChild(parent: Node, name: string): Node | null {
  return parent.children.find((child) => child.name === name) || null;
}
