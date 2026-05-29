import {
  EventTouch,
  Graphics,
  Label,
  Mask,
  MaskType,
  Node,
  Sprite,
  Tween,
  UIOpacity,
  UITransform,
  Vec3,
  tween,
} from 'cc';
import {
  FormationDefinition,
  getPreviewFormationPoints,
  getSelectedFormation,
  getUnlockedFormations,
  setSelectedFormationId,
} from '../services/FormationService';
import {
  RosterPlayer,
  assignLineupPlayer,
  getLineupPlayerIds,
  getLineupPlayers,
  getOwnedPlayers,
  swapLineupPlayers,
} from '../services/PlayerRosterService';
import { drawPlayerAvatar, playerCardColors, renderStandardPlayerCard, withAlpha } from '../ui/PlayerCardView';
import { findNode, rgba } from '../utils/CocosNodeUtils';
import { bindTabs } from './MainSceneController';
import { showPlayerDetail } from './ShopSceneController';

const CARD_WIDTH = 92;
const CARD_HEIGHT = 70;
const CARD_SPACING = 108;
const PLAYER_CARD_WIDTH = 62;
const PLAYER_CARD_HEIGHT = 68;
const PLAYER_CARD_GAP_X = 7;
const PLAYER_CARD_GAP_Y = 8;
const PLAYER_COLUMNS = 5;
const PLAYER_DRAG_EXIT_PADDING = 8;
const PLAYER_SLOT_MAGNET_RADIUS = 54;

interface ScrollState {
  offset: number;
}

interface PlayerTouchState {
  player: RosterPlayer;
  startUiX: number;
  startUiY: number;
  startScrollY: number;
  dragging: boolean;
  moved: boolean;
}

interface StarterSlot {
  index: number;
  x: number;
  y: number;
}

interface LineupTouchState {
  slotIndex: number;
  player: RosterPlayer;
  dragging: boolean;
}

export function bindPlayersScene(root: Node): void {
  bindTabs(root, 'players');
  const controller = new FormationSelector(root);
  controller.start();
}

class FormationSelector {
  private root: Node;
  private formations: FormationDefinition[] = getUnlockedFormations();
  private ownedPlayers: RosterPlayer[] = getOwnedPlayers();
  private cards: Node[] = [];
  private playerCards: Node[] = [];
  private starterSlots: StarterSlot[] = [];
  private selectedIndex = 0;
  private scrollState: ScrollState = { offset: 0 };
  private playerScrollState: ScrollState = { offset: 0 };
  private touchStartX = 0;
  private listTouchStartY = 0;
  private touchStartOffset = 0;
  private isSnapped = true;
  private playerTouch: PlayerTouchState | null = null;
  private lineupTouch: LineupTouchState | null = null;
  private dragGhost: Node | null = null;
  private magnetSlot: StarterSlot | null = null;
  private glowNode: Node | null = null;

  constructor(root: Node) {
    this.root = root;
  }

  start(): void {
    const selected = getSelectedFormation();
    this.selectedIndex = Math.max(0, this.formations.findIndex((formation) => formation.id === selected.id));
    this.scrollState.offset = -this.selectedIndex * CARD_SPACING;
    this.prepareViewport();
    this.createCards();
    this.preparePlayerList();
    this.createPlayerCards();
    this.prepareStarterInput();
    this.updateSelected(this.selectedIndex, false);
    this.renderCards();
    this.renderPlayerCards();
    this.renderSelectorFrame(true);
  }

  private prepareViewport(): void {
    const viewport = findNode(this.root, 'FormationCarouselViewport');
    if (!viewport) return;
    const mask = viewport.getComponent(Mask) || viewport.addComponent(Mask);
    mask.type = MaskType.GRAPHICS_RECT;
    viewport.on(Node.EventType.TOUCH_START, (event: EventTouch) => this.handleTouchStart(event));
    viewport.on(Node.EventType.TOUCH_MOVE, (event: EventTouch) => this.handleTouchMove(event));
    viewport.on(Node.EventType.TOUCH_END, () => this.handleTouchEnd());
    viewport.on(Node.EventType.TOUCH_CANCEL, () => this.handleTouchEnd());
  }

  private createCards(): void {
    const viewport = findNode(this.root, 'FormationCarouselViewport');
    if (!viewport) return;
    for (const oldCard of viewport.children.filter((child) => child.name.startsWith('FormationCard_'))) {
      oldCard.destroy();
    }
    this.cards = this.formations.map((formation) => {
      const card = new Node(`FormationCard_${formation.id}`);
      card.layer = viewport.layer;
      viewport.addChild(card);
      card.addComponent(UITransform).setContentSize(CARD_WIDTH, CARD_HEIGHT);
      card.addComponent(Graphics);
      const labelNode = new Node('FormationCardLabel');
      labelNode.layer = viewport.layer;
      card.addChild(labelNode);
      labelNode.setPosition(0, -CARD_HEIGHT / 2 + 12);
      labelNode.addComponent(UITransform).setContentSize(CARD_WIDTH, 20);
      const label = labelNode.addComponent(Label);
      label.string = formation.code;
      label.fontSize = 13;
      label.lineHeight = 16;
      label.isBold = true;
      label.cacheMode = Label.CacheMode.NONE;
      label.horizontalAlign = Label.HorizontalAlign.CENTER;
      label.verticalAlign = Label.VerticalAlign.CENTER;
      label.color = rgba(245, 249, 255);
      return card;
    });
  }

  private preparePlayerList(): void {
    const viewport = findNode(this.root, 'PlayerListViewport');
    if (!viewport) return;
    const mask = viewport.getComponent(Mask) || viewport.addComponent(Mask);
    mask.type = MaskType.GRAPHICS_RECT;
    viewport.on(Node.EventType.TOUCH_START, (event: EventTouch) => this.handlePlayerListTouchStart(event));
    viewport.on(Node.EventType.TOUCH_MOVE, (event: EventTouch) => this.handlePlayerListTouchMove(event));
    viewport.on(Node.EventType.TOUCH_END, (event: EventTouch) => this.endPlayerTouch(event));
    viewport.on(Node.EventType.TOUCH_CANCEL, () => this.endPlayerTouch(null));
  }

  private createPlayerCards(): void {
    const viewport = findNode(this.root, 'PlayerListViewport');
    if (!viewport) return;
    for (const oldCard of viewport.children.filter((child) => child.name.startsWith('PlayerCard_'))) oldCard.destroy();
    this.playerCards = this.ownedPlayers.map((player) => {
      const card = new Node(`PlayerCard_${player.id}`);
      card.layer = viewport.layer;
      viewport.addChild(card);
      card.addComponent(UITransform).setContentSize(PLAYER_CARD_WIDTH, PLAYER_CARD_HEIGHT);
      card.addComponent(Graphics);
      return card;
    });
  }

  private prepareStarterInput(): void {
    for (let i = 0; i < 5; i += 1) {
      const starter = findNode(this.root, `Starter_${i + 1}`);
      if (!starter) continue;
      starter.on(Node.EventType.TOUCH_START, (event: EventTouch) => this.handleStarterTouchStart(i, event));
      starter.on(Node.EventType.TOUCH_MOVE, (event: EventTouch) => this.handleStarterTouchMove(event));
      starter.on(Node.EventType.TOUCH_END, () => this.endStarterTouch());
      starter.on(Node.EventType.TOUCH_CANCEL, () => this.endStarterTouch());
    }
  }

  private handleTouchStart(event: EventTouch): void {
    Tween.stopAllByTarget(this.scrollState);
    this.touchStartX = event.getUILocation().x;
    this.touchStartOffset = this.scrollState.offset;
    this.isSnapped = false;
    this.renderSelectorFrame(false);
  }

  private handleTouchMove(event: EventTouch): void {
    const delta = event.getUILocation().x - this.touchStartX;
    this.scrollState.offset = clamp(this.touchStartOffset + delta, -(this.formations.length - 1) * CARD_SPACING, 0);
    this.updateSelected(Math.round(-this.scrollState.offset / CARD_SPACING), false);
    this.renderCards();
  }

  private handleTouchEnd(): void {
    this.snapTo(Math.round(-this.scrollState.offset / CARD_SPACING), true);
  }

  private handlePlayerListTouchStart(event: EventTouch): void {
    const player = this.playerAtTouch(event);
    const ui = event.getUILocation();
    this.playerTouch = player
      ? { player, startUiX: ui.x, startUiY: ui.y, startScrollY: this.playerScrollState.offset, dragging: false, moved: false }
      : null;
    if (!player) {
      this.touchStartX = ui.x;
      this.listTouchStartY = ui.y;
      this.touchStartOffset = this.playerScrollState.offset;
    }
  }

  private handlePlayerListTouchMove(event: EventTouch): void {
    const ui = event.getUILocation();
    if (!this.playerTouch) {
      const deltaY = ui.y - this.listTouchStartY;
      this.playerScrollState.offset = clamp(this.touchStartOffset + deltaY, 0, this.maxPlayerScrollY());
      this.renderPlayerCards();
      return;
    }
    if (Math.abs(ui.x - this.playerTouch.startUiX) > 8 || Math.abs(ui.y - this.playerTouch.startUiY) > 8) {
      this.playerTouch.moved = true;
    }
    const point = this.uiToRootPoint(ui.x, ui.y);
    const viewport = findNode(this.root, 'PlayerListViewport');
    const viewportTransform = viewport?.getComponent(UITransform);
    const viewportTop = (viewport?.position.y || 0) + (viewportTransform?.contentSize.height || 0) / 2;
    if (!this.playerTouch.dragging && point.y > viewportTop + PLAYER_DRAG_EXIT_PADDING) {
      this.playerTouch.dragging = true;
      this.createDragGhost(this.playerTouch.player, point.x, point.y);
    }
    if (this.playerTouch.dragging) {
      this.updateDragGhost(point.x, point.y);
      return;
    }
    const deltaY = ui.y - this.playerTouch.startUiY;
    this.playerScrollState.offset = clamp(this.playerTouch.startScrollY + deltaY, 0, this.maxPlayerScrollY());
    this.renderPlayerCards();
  }

  private handleStarterTouchStart(slotIndex: number, event: EventTouch): void {
    const player = getLineupPlayers()[slotIndex];
    if (!player) return;
    const ui = event.getUILocation();
    const point = this.uiToRootPoint(ui.x, ui.y);
    this.lineupTouch = { slotIndex, player, dragging: true };
    this.createDragGhost(player, point.x, point.y);
    this.updateDragGhost(point.x, point.y, slotIndex);
  }

  private handleStarterTouchMove(event: EventTouch): void {
    if (!this.lineupTouch) return;
    const ui = event.getUILocation();
    const point = this.uiToRootPoint(ui.x, ui.y);
    this.updateDragGhost(point.x, point.y, this.lineupTouch.slotIndex);
  }

  private endStarterTouch(): void {
    const touch = this.lineupTouch;
    if (touch?.dragging && this.magnetSlot) {
      swapLineupPlayers(touch.slotIndex, this.magnetSlot.index);
      this.drawMainBoard(this.formations[this.selectedIndex]);
      this.renderPlayerCards();
    }
    this.lineupTouch = null;
    this.destroyDragGhost();
    this.clearSlotGlow();
  }

  private endPlayerTouch(event: EventTouch | null): void {
    const touch = this.playerTouch;
    if (!touch) return;
    if (touch.dragging && this.magnetSlot) this.assignPlayerToSlot(touch.player, this.magnetSlot.index);
    if (!touch.dragging && !touch.moved) {
      if (event) event.propagationStopped = true;
      showPlayerDetail(this.root, touch.player, { showPurchase: false });
    }
    this.playerTouch = null;
    this.destroyDragGhost();
    this.clearSlotGlow();
  }

  private snapTo(index: number, animated: boolean): void {
    const targetIndex = clampIndex(index, this.formations.length);
    const targetOffset = -targetIndex * CARD_SPACING;
    Tween.stopAllByTarget(this.scrollState);
    this.isSnapped = false;
    this.renderSelectorFrame(false);
    if (!animated) {
      this.scrollState.offset = targetOffset;
      this.updateSelected(targetIndex, false);
      this.renderCards();
      this.renderSelectorFrame(true);
      this.saveCurrentSelection();
      return;
    }
    tween(this.scrollState)
      .to(0.16, { offset: targetOffset }, {
        onUpdate: () => {
          this.updateSelected(Math.round(-this.scrollState.offset / CARD_SPACING), false);
          this.renderCards();
        },
      })
      .call(() => {
        this.scrollState.offset = targetOffset;
        this.updateSelected(targetIndex, false);
        this.renderCards();
        this.renderSelectorFrame(true);
        this.saveCurrentSelection();
      })
      .start();
  }

  private updateSelected(index: number, persist: boolean): void {
    const nextIndex = clampIndex(index, this.formations.length);
    this.selectedIndex = nextIndex;
    const formation = persist ? setSelectedFormationId(this.formations[this.selectedIndex].id) : this.formations[this.selectedIndex];
    this.drawMainBoard(formation);
  }

  private renderCards(): void {
    for (let i = 0; i < this.cards.length; i += 1) {
      const card = this.cards[i];
      const x = i * CARD_SPACING + this.scrollState.offset;
      card.setPosition(x, 0);
      card.setScale(i === this.selectedIndex ? 1.05 : 0.94, i === this.selectedIndex ? 1.05 : 0.94, 1);
      card.active = Math.abs(x) < 230;
      drawFormationCard(card, this.formations[i], i === this.selectedIndex && this.isSnapped);
    }
  }

  private renderSelectorFrame(snapped: boolean): void {
    this.isSnapped = snapped;
    const frame = findNode(this.root, 'FormationSelectorFrame');
    if (!frame) return;
    const sprite = frame.getComponent(Sprite);
    if (sprite) sprite.enabled = false;
    const transform = frame.getComponent(UITransform);
    const width = transform?.contentSize.width || 104;
    const height = transform?.contentSize.height || 78;
    const g = frame.getComponent(Graphics) || frame.addComponent(Graphics);
    g.clear();
    if (snapped) {
      g.strokeColor = rgba(255, 136, 31, 72);
      g.lineWidth = 8;
      g.rect(-width / 2 - 2, -height / 2 - 2, width + 4, height + 4);
      g.stroke();
      g.strokeColor = rgba(255, 136, 31, 255);
      g.lineWidth = 4;
    } else {
      g.strokeColor = rgba(255, 255, 255, 210);
      g.lineWidth = 2;
    }
    g.rect(-width / 2, -height / 2, width, height);
    g.stroke();
  }

  private drawMainBoard(formation: FormationDefinition): void {
    const board = findNode(this.root, 'FormationBoard');
    if (!board) return;
    const sprite = board.getComponent(Sprite);
    if (sprite) sprite.enabled = false;
    const transform = board.getComponent(UITransform);
    const width = transform?.contentSize.width || 348;
    const height = transform?.contentSize.height || 360;
    const boardX = board.position.x;
    const boardY = board.position.y;
    const g = board.getComponent(Graphics) || board.addComponent(Graphics);
    drawBoard(g, width, height);
    const points = getPreviewFormationPoints(formation, width * 0.72, height * 0.72);
    const lineup = getLineupPlayers();
    this.starterSlots = [];
    for (let i = 0; i < points.length; i += 1) {
      const starter = findNode(this.root, `Starter_${i + 1}`);
      const labelNode = findNode(this.root, `StarterText_${i + 1}`);
      const x = boardX + points[i].x;
      const y = boardY + points[i].y;
      this.starterSlots.push({ index: i, x, y });
      if (starter) {
        starter.setPosition(x, y);
        drawStarter(starter, lineup[i]);
      }
      if (labelNode) {
        labelNode.setPosition(x, y - 31);
        labelNode.getComponent(UITransform)?.setContentSize(62, 22);
        const label = labelNode.getComponent(Label);
        if (label) {
          label.string = lineup[i]?.name || String(i + 1);
          label.fontSize = 11;
          label.lineHeight = 13;
        }
      }
    }
  }

  private saveCurrentSelection(): void {
    setSelectedFormationId(this.formations[this.selectedIndex].id);
  }

  private renderPlayerCards(): void {
    const viewport = findNode(this.root, 'PlayerListViewport');
    const width = viewport?.getComponent(UITransform)?.contentSize.width || 348;
    const startX = -width / 2 + PLAYER_CARD_WIDTH / 2 + 8;
    const startY = (viewport?.getComponent(UITransform)?.contentSize.height || 148) / 2 - PLAYER_CARD_HEIGHT / 2 - 6;
    const lineupIds = getLineupPlayerIds();
    for (let i = 0; i < this.playerCards.length; i += 1) {
      const card = this.playerCards[i];
      const col = i % PLAYER_COLUMNS;
      const row = Math.floor(i / PLAYER_COLUMNS);
      const x = startX + col * (PLAYER_CARD_WIDTH + PLAYER_CARD_GAP_X);
      const y = startY - row * (PLAYER_CARD_HEIGHT + PLAYER_CARD_GAP_Y) + this.playerScrollState.offset;
      card.setPosition(x, y);
      card.active = y < startY + PLAYER_CARD_HEIGHT && y > -startY - PLAYER_CARD_HEIGHT;
      renderStandardPlayerCard(card, this.ownedPlayers[i], {
        width: PLAYER_CARD_WIDTH,
        height: PLAYER_CARD_HEIGHT,
        selected: lineupIds.indexOf(this.ownedPlayers[i].id) >= 0,
        nameFontSize: 9,
        scoreFontSize: 8,
        avatarRadius: 14,
        avatarY: 11,
        nameY: -9,
        scoreY: -24,
      });
    }
  }

  private playerAtTouch(event: EventTouch): RosterPlayer | null {
    const viewport = findNode(this.root, 'PlayerListViewport');
    if (!viewport) return null;
    const ui = event.getUILocation();
    const local = viewport.getComponent(UITransform)?.convertToNodeSpaceAR(new Vec3(ui.x, ui.y));
    if (!local) return null;
    for (let i = 0; i < this.playerCards.length; i += 1) {
      const card = this.playerCards[i];
      const size = card.getComponent(UITransform)?.contentSize;
      if (!size || !card.active) continue;
      if (Math.abs(local.x - card.position.x) <= size.width / 2 && Math.abs(local.y - card.position.y) <= size.height / 2) {
        return this.ownedPlayers[i];
      }
    }
    return null;
  }

  private findNearestMagnetSlot(x: number, y: number, excludedSlotIndex = -1): StarterSlot | null {
    let best: StarterSlot | null = null;
    let bestDistance = Number.POSITIVE_INFINITY;
    for (const slot of this.starterSlots) {
      if (slot.index === excludedSlotIndex) continue;
      const dx = x - slot.x;
      const dy = y - slot.y;
      const distance = dx * dx + dy * dy;
      if (distance < bestDistance) {
        best = slot;
        bestDistance = distance;
      }
    }
    if (!best || bestDistance > PLAYER_SLOT_MAGNET_RADIUS * PLAYER_SLOT_MAGNET_RADIUS) return null;
    return best;
  }

  private assignPlayerToSlot(player: RosterPlayer, slotIndex: number): void {
    assignLineupPlayer(slotIndex, player.id);
    this.drawMainBoard(this.formations[this.selectedIndex]);
    this.renderPlayerCards();
  }

  private createDragGhost(player: RosterPlayer, x: number, y: number): void {
    this.destroyDragGhost();
    const ghost = new Node(`DraggingPlayer_${player.id}`);
    ghost.layer = this.root.layer;
    this.root.addChild(ghost);
    ghost.addComponent(UITransform).setContentSize(48, 48);
    ghost.addComponent(Graphics);
    ghost.setPosition(x, y);
    drawDragPlayerCircle(ghost, player, 224);
    this.dragGhost = ghost;
  }

  private updateDragGhost(x: number, y: number, excludedSlotIndex = -1): void {
    const slot = this.findNearestMagnetSlot(x, y, excludedSlotIndex);
    this.magnetSlot = slot;
    if (slot) {
      this.dragGhost?.setPosition(slot.x, slot.y);
      this.showSlotGlow(slot);
      return;
    }
    this.dragGhost?.setPosition(x, y);
    this.clearSlotGlow();
  }

  private destroyDragGhost(): void {
    if (this.dragGhost?.isValid) this.dragGhost.destroy();
    this.dragGhost = null;
    this.magnetSlot = null;
  }

  private showSlotGlow(slot: StarterSlot): void {
    let glow = this.glowNode;
    if (!glow || !glow.isValid) {
      glow = new Node('StarterMagnetGlow');
      glow.layer = this.root.layer;
      this.root.addChild(glow);
      glow.addComponent(UITransform).setContentSize(76, 76);
      glow.addComponent(Graphics);
      const opacity = glow.addComponent(UIOpacity);
      opacity.opacity = 180;
      drawSlotGlow(glow);
      tween(glow)
        .repeatForever(
          tween<Node>()
            .to(0.28, { scale: new Vec3(1.15, 1.15, 1) })
            .to(0.28, { scale: new Vec3(0.96, 0.96, 1) }),
        )
        .start();
      tween(opacity)
        .repeatForever(
          tween<UIOpacity>()
            .to(0.28, { opacity: 255 })
            .to(0.28, { opacity: 130 }),
        )
        .start();
      this.glowNode = glow;
    }
    glow.setPosition(slot.x, slot.y);
  }

  private clearSlotGlow(): void {
    if (this.glowNode?.isValid) {
      Tween.stopAllByTarget(this.glowNode);
      const opacity = this.glowNode.getComponent(UIOpacity);
      if (opacity) Tween.stopAllByTarget(opacity);
      this.glowNode.destroy();
    }
    this.glowNode = null;
  }

  private uiToRootPoint(x: number, y: number): Vec3 {
    return this.root.getComponent(UITransform)?.convertToNodeSpaceAR(new Vec3(x, y)) || new Vec3();
  }

  private maxPlayerScrollY(): number {
    const viewportHeight = findNode(this.root, 'PlayerListViewport')?.getComponent(UITransform)?.contentSize.height || 148;
    const rows = Math.ceil(this.ownedPlayers.length / PLAYER_COLUMNS);
    const contentHeight = rows * PLAYER_CARD_HEIGHT + Math.max(0, rows - 1) * PLAYER_CARD_GAP_Y + 12;
    return Math.max(0, contentHeight - viewportHeight);
  }
}

function drawBoard(g: Graphics, width: number, height: number): void {
  g.clear();
  g.fillColor = rgba(34, 136, 77);
  g.rect(-width / 2, -height / 2, width, height);
  g.fill();
  const stripeHeight = 42;
  for (let y = -height / 2, index = 0; y < height / 2; y += stripeHeight, index += 1) {
    g.fillColor = index % 2 === 0 ? rgba(83, 184, 99, 92) : rgba(194, 223, 87, 62);
    g.rect(-width / 2, y, width, Math.min(stripeHeight, height / 2 - y));
    g.fill();
  }
  g.strokeColor = rgba(236, 252, 232, 170);
  g.lineWidth = 2;
  g.rect(-width / 2 + 12, -height / 2 + 12, width - 24, height - 24);
  g.stroke();
  g.moveTo(-width / 2 + 12, 0);
  g.lineTo(width / 2 - 12, 0);
  g.stroke();
  g.circle(0, 0, 42);
  g.stroke();
  g.rect(-64, height / 2 - 76, 128, 64);
  g.stroke();
  g.rect(-64, -height / 2 + 12, 128, 64);
  g.stroke();
}

function drawStarter(node: Node, player: RosterPlayer | null): void {
  const sprite = node.getComponent(Sprite);
  if (sprite) sprite.enabled = false;
  const transform = node.getComponent(UITransform) || node.addComponent(UITransform);
  transform.setContentSize(48, 48);
  const g = node.getComponent(Graphics) || node.addComponent(Graphics);
  g.clear();
  const color = player ? playerCardColors(player.rarity) : { base: rgba(238, 77, 77), edge: rgba(255, 255, 255, 220), shine: rgba(255, 255, 255, 44) };
  g.fillColor = color.base;
  g.circle(0, 0, 22);
  g.fill();
  g.strokeColor = color.edge;
  g.lineWidth = 3;
  g.circle(0, 0, 21);
  g.stroke();
  if (player) drawPlayerAvatar(g, 0, 1, 15, player);
  else {
    g.fillColor = rgba(255, 255, 255, 44);
    g.circle(-7, 7, 8);
    g.fill();
  }
}

function drawDragPlayerCircle(node: Node, player: RosterPlayer, alpha: number): void {
  const g = node.getComponent(Graphics);
  if (!g) return;
  const color = playerCardColors(player.rarity);
  g.clear();
  g.fillColor = withAlpha(color.base, alpha);
  g.circle(0, 0, 22);
  g.fill();
  g.strokeColor = withAlpha(color.edge, alpha);
  g.lineWidth = 3;
  g.circle(0, 0, 21);
  g.stroke();
  drawPlayerAvatar(g, 0, 1, 15, player);
}

function drawSlotGlow(node: Node): void {
  const g = node.getComponent(Graphics);
  if (!g) return;
  g.clear();
  g.fillColor = rgba(255, 164, 35, 34);
  g.circle(0, 0, 35);
  g.fill();
  g.strokeColor = rgba(255, 178, 48, 235);
  g.lineWidth = 3;
  g.circle(0, 0, 29);
  g.stroke();
  g.strokeColor = rgba(255, 241, 158, 180);
  g.lineWidth = 1.5;
  g.circle(0, 0, 35);
  g.stroke();
}

function drawFormationCard(card: Node, formation: FormationDefinition, selected: boolean): void {
  const g = card.getComponent(Graphics);
  if (!g) return;
  g.clear();
  g.fillColor = selected ? rgba(42, 56, 76) : rgba(24, 34, 49);
  g.rect(-CARD_WIDTH / 2, -CARD_HEIGHT / 2, CARD_WIDTH, CARD_HEIGHT);
  g.fill();
  g.strokeColor = selected ? rgba(255, 136, 31, 255) : rgba(118, 136, 162, 180);
  g.lineWidth = selected ? 3 : 1.4;
  g.rect(-CARD_WIDTH / 2 + 2, -CARD_HEIGHT / 2 + 2, CARD_WIDTH - 4, CARD_HEIGHT - 4);
  g.stroke();

  const pitchW = 56;
  const pitchH = 42;
  const pitchY = 8;
  for (let y = pitchY - pitchH / 2, index = 0; y < pitchY + pitchH / 2; y += 7, index += 1) {
    g.fillColor = index % 2 === 0 ? rgba(37, 130, 65, 235) : rgba(78, 178, 81, 235);
    g.rect(-pitchW / 2, y, pitchW, Math.min(7, pitchY + pitchH / 2 - y));
    g.fill();
  }
  g.strokeColor = rgba(236, 252, 232, 128);
  g.lineWidth = 1;
  g.rect(-pitchW / 2, pitchY - pitchH / 2, pitchW, pitchH);
  g.stroke();
  g.moveTo(-pitchW / 2, pitchY);
  g.lineTo(pitchW / 2, pitchY);
  g.stroke();
  g.circle(0, pitchY, 8);
  g.stroke();

  const points = getPreviewFormationPoints(formation, pitchW * 0.72, pitchH * 0.72);
  g.fillColor = rgba(238, 77, 77, 245);
  for (const point of points) {
    g.circle(point.x, pitchY + point.y, 3.6);
    g.fill();
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function clampIndex(index: number, length: number): number {
  if (length <= 0) return 0;
  return Math.max(0, Math.min(length - 1, index));
}
