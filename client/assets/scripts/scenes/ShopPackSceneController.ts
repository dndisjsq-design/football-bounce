import { AudioClip, AudioSource, Color, EventTouch, Graphics, Label, Mask, MaskType, Node, Sprite, UIOpacity, UITransform, Vec3, director, resources, tween } from 'cc';
import { PlayerRarity, RosterPlayer } from '../services/PlayerRosterService';
import { fetchShopPlayers } from '../services/ShopCatalogApiService';
import { getCurrentCoins } from '../services/WalletService';
import { renderStandardPlayerCard } from '../ui/PlayerCardView';
import { findNode, rgba } from '../utils/CocosNodeUtils';
import { bindTabs } from './MainSceneController';
import { showPlayerDetail } from './ShopSceneController';

const PACK_CARD_WIDTH = 166;
const PACK_CARD_HEIGHT = 226;
const RESULT_CARD_WIDTH = 62;
const RESULT_CARD_HEIGHT = 74;
const RESULT_GAP_X = 6;
const RESULT_GAP_Y = 8;
const RESULT_COLUMNS = 5;
const LIGHTNING_SFX_PATH = 'audio/lightning_sfx';
const TEAR_SFX_PATH = 'audio/tear_sfx';
const pendingLightningVolumes: number[] = [];
const pendingTearVolumes: number[] = [];
let sfxSource: AudioSource | null = null;
let lightningClip: AudioClip | null = null;
let lightningClipLoading = false;
let tearClip: AudioClip | null = null;
let tearClipLoading = false;

interface GachaPack {
  id: string;
  name: string;
  subtitle: string;
  topColor: Color;
  bottomColor: Color;
  players: RosterPlayer[];
}

type PackMeta = Omit<GachaPack, 'players'>;

const PACK_DEFINITIONS: PackMeta[] = [
  { id: 'blaze', name: '烈焰巨星包', subtitle: '爆发型前锋概率池', topColor: rgba(255, 83, 59), bottomColor: rgba(164, 30, 64) },
  { id: 'galaxy', name: '星河控场包', subtitle: '中场组织与弧线手感', topColor: rgba(122, 91, 255), bottomColor: rgba(28, 87, 187) },
  { id: 'bolt', name: '闪电突击包', subtitle: '高速推进与抢点', topColor: rgba(0, 207, 224), bottomColor: rgba(22, 94, 202) },
  { id: 'wall', name: '钢铁防线包', subtitle: '身体与回防强度', topColor: rgba(255, 174, 49), bottomColor: rgba(203, 71, 42) },
];

interface ScrollState {
  offset: number;
  startY: number;
  startOffset: number;
}

export function bindShopPackScene(root: Node): void {
  bindTabs(root, 'shop');
  setLabelText(root, 'TextShopCoins', `金币 ${getCurrentCoins()}`);
  bindBack(root);
  preloadLightningSfx();
  new ShopPackScene(root).start();
}

class ShopPackScene {
  private root: Node;

  constructor(root: Node) {
    this.root = root;
  }

  start(): void {
    PACK_DEFINITIONS.forEach((pack, index) => this.bindPack(pack, index));
  }

  private bindPack(pack: PackMeta, index: number): void {
    const card = findNode(this.root, `PackCard_${index}`);
    const cover = findNode(this.root, `PackCover_${index}`);
    if (!card || !cover) return;
    disableSprite(card);
    disableSprite(cover);
    drawPackCard(card, pack);
    drawPackCover(cover, pack, index);
    setLabelText(this.root, `PackName_${index}`, pack.name);
    setLabelText(this.root, `PackInfo_${index}`, '红5 橙5 紫10 蓝20');
    setLabelStyle(this.root, `ButtonPackSingle_${index}_Label`, '单抽100', 12);
    setLabelStyle(this.root, `ButtonPackTen_${index}_Label`, '十连抽1000', 11);
    bindTap(card, () => this.showPackContents(pack));
    bindButton(findNode(this.root, `ButtonPackSingle_${index}`), () => this.startDrawFlow(pack, 1));
    bindButton(findNode(this.root, `ButtonPackTen_${index}`), () => this.startDrawFlow(pack, 10));
  }

  private showPackContents(pack: PackMeta): void {
    const overlay = createOverlay(this.root, 'PackContentsOverlay', rgba(3, 8, 20, 184));
    const panel = createPanel(overlay, 'PackContentsPanel', 0, -4, 350, 716);
    createRuntimeLabel(panel, 'PackContentsTitle', pack.name, 0, 320, 28, 300, 40, rgba(255, 246, 130), true);
    createRuntimeLabel(panel, 'PackContentsSubtitle', `${pack.subtitle}  |  红5 橙5 紫10 蓝20`, 0, 290, 13, 310, 24, rgba(210, 228, 255), true);
    createRuntimeLabel(panel, 'PackContentsRate', '概率：红50%  橙10%  紫20%  蓝20%', 0, 262, 12, 310, 22, rgba(255, 221, 92), true);
    const status = createRuntimeLabel(panel, 'PackContentsStatus', '加载球员池...', 0, 30, 15, 260, 28, rgba(255, 232, 146), true);

    const viewport = createNode(panel, 'PackContentsViewport', 0, 30, 320, 430);
    const g = viewport.addComponent(Graphics);
    g.fillColor = rgba(8, 28, 58, 190);
    g.rect(-160, -215, 320, 430);
    g.fill();
    const mask = viewport.addComponent(Mask);
    mask.type = MaskType.GRAPHICS_RECT;
    void this.buildFreshPack(pack).then((freshPack) => {
      status.destroy();
      new PlayerGrid(this.root, viewport, freshPack.players, 5, 58, 74).start();
    }).catch((error: Error) => {
      const label = status.getComponent(Label);
      if (label) label.string = error.message || '球员池加载失败';
    });

    createRuntimeButton(panel, 'PackContentsSingle', '单抽100', -82, -288, 126, 42, rgba(255, 128, 31), () => this.startDrawFlow(pack, 1));
    createRuntimeButton(panel, 'PackContentsTen', '十连抽1000', 82, -288, 126, 42, rgba(180, 72, 232), () => this.startDrawFlow(pack, 10));
    createRuntimeButton(panel, 'PackContentsClose', '关闭', 0, -336, 126, 36, rgba(84, 102, 132), () => overlay.destroy());
  }

  private startDrawFlow(pack: PackMeta, count: number): void {
    this.setLoadingState('请求抽球...');
    void this.buildFreshPack(pack).then((freshPack) => {
      this.setLoadingState('');
      if (freshPack.players.length === 0) return;
      const results = Array.from({ length: count }, () => drawFromPack(freshPack));
      findNode(this.root, 'PackContentsOverlay')?.destroy();
      this.showDrawAnimation(freshPack, results);
    }).catch((error: Error) => {
      this.setLoadingState(error.message || '抽球请求失败');
    });
  }

  private showDrawAnimation(pack: GachaPack, results: RosterPlayer[]): void {
    const finalRarity = highestRarity(results);
    const overlay = createAnimationOverlay(this.root, pack.name, finalRarity, () => {
      overlay.destroy();
      this.showDrawResult(pack, results);
    });
    overlay.setSiblingIndex(overlay.parent ? overlay.parent.children.length - 1 : 0);
  }

  private showDrawResult(pack: GachaPack, results: RosterPlayer[]): void {
    const overlay = createOverlay(this.root, 'GachaResultOverlay', rgba(3, 8, 20, 194));
    const count = results.length;
    const panelHeight = count === 1 ? 390 : 520;
    const panel = createPanel(overlay, 'GachaResultPanel', 0, -8, 350, panelHeight);
    createRuntimeLabel(panel, 'GachaResultTitle', count === 1 ? '单抽结果' : '十连抽结果', 0, panelHeight / 2 - 38, 28, 260, 40, rgba(255, 246, 130), true);
    createRuntimeLabel(panel, 'GachaResultPack', pack.name, 0, panelHeight / 2 - 70, 14, 260, 24, rgba(210, 228, 255), true);

    const grid = createNode(panel, 'GachaResultGrid', 0, count === 1 ? 12 : 22, 330, count === 1 ? 130 : 214);
    results.forEach((player, index) => {
      const card = createNode(grid, `Result_${index}_${player.id}`, resultX(index, results.length), resultY(index, results.length), RESULT_CARD_WIDTH, RESULT_CARD_HEIGHT);
      card.addComponent(Graphics);
      renderStandardPlayerCard(card, player, { width: RESULT_CARD_WIDTH, height: RESULT_CARD_HEIGHT, nameFontSize: 10, scoreFontSize: 9, avatarRadius: 14, avatarY: 12, nameY: -10, scoreY: -27 });
      bindTap(card, () => showPlayerDetail(this.root, player, { showPurchase: false }));
    });

    createRuntimeButton(panel, 'GachaResultClose', '确认', 0, -panelHeight / 2 + 48, 126, 42, rgba(255, 128, 31), () => overlay.destroy());
  }

  private setLoadingState(message: string): void {
    setLabelText(this.root, 'TextShopCoins', message || `金币 ${getCurrentCoins()}`);
  }

  private buildFreshPack(pack: PackMeta): Promise<GachaPack> {
    return fetchShopPlayers().then((players) => buildGachaPack(players, pack, PACK_DEFINITIONS.findIndex((item) => item.id === pack.id)));
  }
}

class PlayerGrid {
  private detailRoot: Node;
  private viewport: Node;
  private players: RosterPlayer[];
  private columns: number;
  private cardWidth: number;
  private cardHeight: number;
  private cards: Node[] = [];
  private scroll: ScrollState = { offset: 0, startY: 0, startOffset: 0 };

  constructor(detailRoot: Node, viewport: Node, players: RosterPlayer[], columns: number, cardWidth: number, cardHeight: number) {
    this.detailRoot = detailRoot;
    this.viewport = viewport;
    this.players = players;
    this.columns = columns;
    this.cardWidth = cardWidth;
    this.cardHeight = cardHeight;
  }

  start(): void {
    this.cards = this.players.map((player) => {
      const card = createNode(this.viewport, `PackPlayer_${player.id}`, 0, 0, this.cardWidth, this.cardHeight);
      card.addComponent(Graphics);
      bindTap(card, () => showPlayerDetail(this.detailRoot, player, { showPurchase: false }));
      return card;
    });
    this.viewport.on(Node.EventType.TOUCH_START, (event: EventTouch) => {
      this.scroll.startY = event.getUILocation().y;
      this.scroll.startOffset = this.scroll.offset;
    });
    this.viewport.on(Node.EventType.TOUCH_MOVE, (event: EventTouch) => {
      this.scroll.offset = clamp(this.scroll.startOffset + event.getUILocation().y - this.scroll.startY, 0, this.maxScroll());
      this.render();
    });
    this.render();
  }

  private render(): void {
    const size = this.viewport.getComponent(UITransform)?.contentSize;
    const width = size?.width || 320;
    const height = size?.height || 430;
    const startX = -width / 2 + this.cardWidth / 2 + 8;
    const startY = height / 2 - this.cardHeight / 2 - 8;
    for (let i = 0; i < this.cards.length; i += 1) {
      const col = i % this.columns;
      const row = Math.floor(i / this.columns);
      const x = startX + col * (this.cardWidth + 5);
      const y = startY - row * (this.cardHeight + 8) + this.scroll.offset;
      const card = this.cards[i];
      card.setPosition(x, y);
      card.active = y < height / 2 + this.cardHeight && y > -height / 2 - this.cardHeight;
      renderStandardPlayerCard(card, this.players[i], { width: this.cardWidth, height: this.cardHeight, nameFontSize: 9, scoreFontSize: 8, avatarRadius: Math.min(14, this.cardWidth * 0.24), avatarY: 12, nameY: -10, scoreY: -26 });
    }
  }

  private maxScroll(): number {
    const height = this.viewport.getComponent(UITransform)?.contentSize.height || 430;
    const rows = Math.ceil(this.players.length / this.columns);
    const contentHeight = rows * this.cardHeight + Math.max(0, rows - 1) * 8 + 16;
    return Math.max(0, contentHeight - height);
  }
}

function bindBack(root: Node): void {
  const button = findNode(root, 'ButtonBackShop');
  bindButton(button, () => director.loadScene('Shop'));
}

function buildGachaPack(players: RosterPlayer[], pack: PackMeta, packIndex: number): GachaPack {
  const red = byRarity(players, 'red');
  const orange = byRarity(players, 'orange');
  const purple = byRarity(players, 'purple');
  const blue = byRarity(players, 'blue');
  const index = Math.max(0, packIndex);
  return {
    ...pack,
    players: [
      ...topDistributedGroup(red, index),
      ...topDistributedGroup(orange, index),
      ...cyclicSlice(purple, index * 5, 10),
      ...cyclicSlice(blue, 0, 20),
    ],
  };
}

function byRarity(players: RosterPlayer[], rarity: PlayerRarity): RosterPlayer[] {
  return players.filter((player) => player.rarity === rarity).sort((a, b) => b.score - a.score);
}

function topDistributedGroup(players: RosterPlayer[], packIndex: number): RosterPlayer[] {
  return [players[packIndex], ...players.slice(4 + packIndex * 4, 8 + packIndex * 4)].filter(Boolean);
}

function cyclicSlice<T>(items: T[], start: number, count: number): T[] {
  if (!items.length) return [];
  return Array.from({ length: count }, (_, index) => items[(start + index) % items.length]);
}

function drawFromPack(pack: GachaPack): RosterPlayer {
  const roll = Math.random();
  const rarity: PlayerRarity = roll < 0.5 ? 'red' : roll < 0.6 ? 'orange' : roll < 0.8 ? 'purple' : 'blue';
  const pool = pack.players.filter((player) => player.rarity === rarity);
  return pool[Math.floor(Math.random() * pool.length)] || pack.players[0];
}

function highestRarity(players: RosterPlayer[]): PlayerRarity {
  return players.reduce((best, player) => (rarityRank(player.rarity) < rarityRank(best) ? player.rarity : best), 'blue' as PlayerRarity);
}

function rarityRank(rarity: PlayerRarity): number {
  if (rarity === 'red') return 0;
  if (rarity === 'orange') return 1;
  if (rarity === 'purple') return 2;
  return 3;
}

function createAnimationOverlay(root: Node, packName: string, finalRarity: PlayerRarity, onDone: () => void): Node {
  findNode(root, 'GachaAnimationOverlay')?.destroy();
  const overlay = createNode(root, 'GachaAnimationOverlay', 0, 0, 390, 844);
  const background = overlay.addComponent(Graphics);
  drawSilverStadium(background);
  let canSkipReveal = false;
  let finished = false;
  let stormStarted = false;
  const finish = () => {
    if (finished) return;
    finished = true;
    onDone();
  };
  const startRedStorm = () => {
    if (stormStarted || finalRarity !== 'red') return;
    stormStarted = true;
    drawStormStadium(background);
    startRainEffect(overlay);
    playLightningSfx(0.9);
  };

  createRuntimeLabel(overlay, 'GachaAnimationPackName', packName, 0, 294, 24, 300, 38, rgba(255, 255, 255), true);
  const prompt = createRuntimeLabel(overlay, 'GachaAnimationPrompt', '点击任意位置抽球', 0, -214, 18, 260, 36, rgba(255, 246, 130), true);

  const window = createNode(overlay, 'GachaBallWindow', 0, 24, 350, 154);
  const windowGraphics = window.addComponent(Graphics);
  drawBallWindow(windowGraphics);
  const mask = window.addComponent(Mask);
  mask.type = MaskType.GRAPHICS_RECT;

  const strip = createNode(window, 'GachaBallStrip', 0, 0, 1, 1);
  const spacing = 72;
  const normalSpeed = 300;
  const preferredStopDuration = 3.5;
  const preferredStopDistance = normalSpeed * preferredStopDuration * 0.5;
  const movingRarities = weightedBallRarities();
  const cycleWidth = movingRarities.length * spacing;
  const balls = movingRarities.map((rarity, index) => {
    const x = 350 - (movingRarities.length - 1 - index) * spacing;
    return createGachaBall(strip, `SlidingBall_${index}_${rarity}`, x, 0, rarity, 30);
  });

  const animation = {
    speed: normalSpeed,
    stopping: false,
    elapsed: 0,
    stopDuration: preferredStopDuration,
    stopDistance: preferredStopDistance,
    targetBall: null as Node | null,
    startPositions: new Map<Node, number>(),
  };
  const redFlashMarks = [0.16, 0.34, 0.55, 0.76, 0.9];
  let nextRedFlash = 0;
  let lastTime = Date.now();
  const timer = setInterval(() => {
    if (!overlay.isValid) {
      clearInterval(timer);
      return;
    }
    const now = Date.now();
    const dt = Math.min(0.033, Math.max(0.001, (now - lastTime) / 1000));
    lastTime = now;
    if (animation.stopping) {
      animation.elapsed = Math.min(animation.stopDuration, animation.elapsed + dt);
      const progress = animation.elapsed / animation.stopDuration;
      const offset = animation.stopDistance * easeOutQuad(progress);
      for (const ball of balls) {
        const start = animation.startPositions.get(ball) ?? ball.position.x;
        ball.setPosition(start + offset, ball.position.y);
      }
      if (finalRarity === 'red' && nextRedFlash < redFlashMarks.length && progress >= redFlashMarks[nextRedFlash]) {
        const x = -140 + Math.random() * 280;
        const y = -310 + Math.random() * 650;
        playLocalStormFlash(overlay, x, y);
        nextRedFlash += 1;
      }
    } else {
      for (const ball of balls) {
        ball.setPosition(ball.position.x + animation.speed * dt, ball.position.y);
        if (ball.position.x > 350) {
          ball.setPosition(ball.position.x - cycleWidth, ball.position.y);
        }
      }
    }
    if (animation.stopping && animation.elapsed >= animation.stopDuration) {
      clearInterval(timer);
      canSkipReveal = true;
      prompt.string = '点击跳过';
      if (animation.targetBall) playStoppedBallReveal(animation.targetBall, overlay, finalRarity, finish);
    }
  }, 16);

  let drawing = false;
  const startDraw = (event: EventTouch) => {
    event.propagationStopped = true;
    if (drawing) return;
    drawing = true;
    prompt.string = '抽球中';
    startRedStorm();
    const targetBall = chooseFutureStopBall(balls, preferredStopDistance);
    const stopDistance = -targetBall.position.x;
    const stopDuration = preferredStopDuration;
    repaintGachaBall(targetBall, finalRarity, 30);
    targetBall.setSiblingIndex(targetBall.parent ? targetBall.parent.children.length - 1 : 0);
    animation.targetBall = targetBall;
    animation.stopping = true;
    animation.elapsed = 0;
    nextRedFlash = 0;
    animation.stopDistance = stopDistance;
    animation.stopDuration = stopDuration;
    animation.speed = normalSpeed;
    animation.startPositions = new Map(balls.map((ball) => [ball, ball.position.x]));
  };
  overlay.on(Node.EventType.TOUCH_START, (event: EventTouch) => { event.propagationStopped = true; });
  overlay.on(Node.EventType.TOUCH_MOVE, (event: EventTouch) => { event.propagationStopped = true; });
  overlay.on(Node.EventType.TOUCH_END, (event: EventTouch) => {
    event.propagationStopped = true;
    if (canSkipReveal) {
      finish();
      return;
    }
    startDraw(event);
  });
  return overlay;
}

function weightedBallRarities(): PlayerRarity[] {
  const rarities: PlayerRarity[] = [
    ...Array.from({ length: 61 }, () => 'blue' as PlayerRarity),
    ...Array.from({ length: 20 }, () => 'purple' as PlayerRarity),
    ...Array.from({ length: 10 }, () => 'orange' as PlayerRarity),
    'red',
  ];
  for (let i = rarities.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    const current = rarities[i];
    rarities[i] = rarities[j];
    rarities[j] = current;
  }
  return rarities;
}

function chooseFutureStopBall(balls: Node[], preferredStopDistance: number): Node {
  const candidates = balls.filter((ball) => ball.position.x < -190);
  if (candidates.length > 0) {
    return candidates.reduce((best, ball) => (
      Math.abs(-ball.position.x - preferredStopDistance) < Math.abs(-best.position.x - preferredStopDistance) ? ball : best
    ), candidates[0]);
  }
  return balls.reduce((best, ball) => (ball.position.x < best.position.x ? ball : best), balls[0]);
}

function easeOutQuad(t: number): number {
  const p = clamp(t, 0, 1);
  return 1 - (1 - p) * (1 - p);
}

function playStoppedBallReveal(ball: Node, overlay: Node, rarity: PlayerRarity, onDone: () => void): void {
  ball.setScale(1, 1, 1);
  const shadow = createNode(overlay, 'FinalBallShadow', 0, -38, 92, 24);
  const shadowGraphics = shadow.addComponent(Graphics);
  shadowGraphics.fillColor = rgba(0, 0, 0, 88);
  shadowGraphics.ellipse(0, 0, 46, 12);
  shadowGraphics.fill();
  shadow.setScale(0.2, 0.2, 1);

  const zoomTime = rarity === 'red' ? 0.22 : 0.78;
  tween(shadow).to(rarity === 'red' ? 0.22 : 1.15, { scale: new Vec3(1, 1, 1) }).start();
  tween(ball)
    .to(zoomTime, { scale: new Vec3(1.48, 1.48, 1) })
    .call(() => {
      if (rarity === 'red') {
        playRedLightningStrike(ball, overlay, onDone);
        return;
      }
      playFullScreenGlow(overlay, rarity, onDone);
    })
    .start();
}

function playFullScreenGlow(overlay: Node, rarity: PlayerRarity, onDone: () => void): void {
  void rarity;
  const rings = [
    { delay: 0, size: 92, alpha: 42 },
    { delay: 0.07, size: 116, alpha: 38 },
    { delay: 0.14, size: 140, alpha: 35 },
    { delay: 0.2, size: 166, alpha: 32 },
    { delay: 0.27, size: 194, alpha: 29 },
    { delay: 0.34, size: 224, alpha: 26 },
    { delay: 0.41, size: 252, alpha: 23 },
  ];
  for (let i = 0; i < rings.length; i += 1) {
    const ring = rings[i];
    const node = createNode(overlay, `GachaWhiteRing_${i}`, 0, 24, ring.size, ring.size);
    const opacity = node.addComponent(UIOpacity);
    opacity.opacity = 0;
    const g = node.addComponent(Graphics);
    g.fillColor = rgba(255, 255, 255, ring.alpha);
    g.circle(0, 0, ring.size / 2);
    g.fill();
    tween(opacity)
      .delay(ring.delay)
      .to(0.22, { opacity: 255 })
      .start();
    tween(node)
      .delay(ring.delay)
      .to(0.63, { scale: new Vec3(1.5, 1.5, 1) })
      .start();
  }

  startFullScreenWhiteFade(overlay, onDone);
}

function playRedLightningStrike(ball: Node, overlay: Node, onDone: () => void): void {
  void ball;
  playLightningSfx(1.08);
  const strike = createNode(overlay, 'GachaRedLightningStrike', 0, 0, 390, 844);
  const g = strike.addComponent(Graphics);
  const sparks = Array.from({ length: 46 }, () => ({
    angle: Math.random() * Math.PI * 2,
    length: 20 + Math.random() * 72,
    delay: 0.28 + Math.random() * 0.28,
    bend: -16 + Math.random() * 32,
    start: 5 + Math.random() * 14,
  }));
  const darkPath = bigLightningPoints(0);
  const whitePath = ballLightningPoints(0.72);
  const startedAt = Date.now();
  let tearPlayed = false;
  const whiteDelay = 0.26;
  const totalDuration = 0.92;
  const timer = setInterval(() => {
    if (!overlay.isValid || !strike.isValid) {
      clearInterval(timer);
      return;
    }
    const elapsed = (Date.now() - startedAt) / 1000;
    const darkProgress = clamp(elapsed / 0.2, 0, 1);
    const whiteAge = elapsed - whiteDelay;
    const fade = elapsed < 0.62 ? 1 : clamp((totalDuration - elapsed) / 0.3, 0, 1);
    g.clear();
    g.fillColor = rgba(18, 0, 35, Math.round(72 * fade));
    g.rect(-195, -422, 390, 844);
    g.fill();
    strokeLightningPathProgress(g, darkPath, rgba(0, 0, 0, Math.round(245 * fade)), 30, darkProgress);
    strokeLightningPathProgress(g, darkPath, rgba(36, 0, 76, Math.round(255 * fade)), 21, darkProgress);
    strokeLightningPathProgress(g, darkPath, rgba(96, 25, 160, Math.round(238 * fade)), 12, darkProgress);
    if (elapsed >= whiteDelay) {
      if (!tearPlayed) {
        tearPlayed = true;
        playTearSfx(1);
      }
      const flashPulse = whiteAge < 0.22 ? clamp(whiteAge / 0.04, 0, 1) : clamp((0.48 - whiteAge) / 0.26, 0, 1);
      const flashAlpha = Math.round(255 * fade * clamp(flashPulse, 0, 1));
      drawWhiteLightningAfterimage(g, whitePath, flashAlpha);
      const sparkCount = Math.floor(10 + 36 * clamp((elapsed - whiteDelay) / 0.42, 0, 1));
      drawElectricSparks(g, sparks.slice(0, sparkCount), clamp((elapsed - whiteDelay) / 0.58, 0, 1), fade);
    }
    if (elapsed >= totalDuration) {
      clearInterval(timer);
      strike.destroy();
      playFullScreenGlow(overlay, 'red', onDone);
    }
  }, 16);
}

function playLocalStormFlash(overlay: Node, x: number, y: number): void {
  const flash = createNode(overlay, `GachaLocalLightning_${Date.now()}`, x, y, 170, 260);
  const g = flash.addComponent(Graphics);
  const main = [
    { x: -10 + Math.random() * 20, y: 116 },
    { x: -24 + Math.random() * 48, y: 66 },
    { x: -18 + Math.random() * 36, y: 14 },
    { x: -26 + Math.random() * 52, y: -48 },
    { x: -12 + Math.random() * 24, y: -118 },
  ];
  const branches = Array.from({ length: 2 + Math.floor(Math.random() * 2) }, () => {
    const base = main[1 + Math.floor(Math.random() * 3)];
    const side = Math.random() > 0.5 ? 1 : -1;
    return {
      x: base.x,
      y: base.y,
      midX: base.x + side * (22 + Math.random() * 20),
      midY: base.y - 12 - Math.random() * 20,
      endX: base.x + side * (46 + Math.random() * 34),
      endY: base.y - 34 - Math.random() * 36,
    };
  });
  const startedAt = Date.now();
  const timer = setInterval(() => {
    if (!overlay.isValid || !flash.isValid) {
      clearInterval(timer);
      return;
    }
    const elapsed = (Date.now() - startedAt) / 1000;
    const progress = clamp(elapsed / 0.38, 0, 1);
    const alpha = Math.round(255 * (1 - progress));
    g.clear();
    strokeLightningPathProgress(g, main, rgba(32, 0, 70, Math.round(alpha * 0.95)), 10, 1);
    strokeLightningPathProgress(g, main, rgba(225, 211, 255, alpha), 3.2, 1);
    for (const branch of branches) {
      const branchProgress = clamp((1 - progress) * 1.4, 0, 1);
      drawLightningBranch(g, branch, branchProgress, alpha, 5.5, 1.8);
    }
    if (elapsed >= 0.4) {
      clearInterval(timer);
      flash.destroy();
    }
  }, 16);
}

function bigLightningPoints(seed: number): Array<{ x: number; y: number }> {
  const centerY = 24;
  return [
    { x: -18 + Math.sin(seed * 4.3) * 10, y: 422 },
    { x: 20 + Math.sin(seed * 5.1) * 12, y: 286 },
    { x: -14 + Math.sin(seed * 6.2) * 10, y: 166 },
    { x: 12 + Math.sin(seed * 7.4) * 8, y: centerY + 46 },
    { x: -4 + Math.sin(seed * 8.1) * 7, y: centerY },
    { x: 14 + Math.sin(seed * 6.7) * 9, y: centerY - 62 },
    { x: -16 + Math.sin(seed * 5.8) * 8, y: -178 },
    { x: 10 + Math.sin(seed * 4.9) * 7, y: -422 },
  ];
}

function ballLightningPoints(seed: number): Array<{ x: number; y: number }> {
  const centerY = 24;
  return [
    { x: -5 + Math.sin(seed * 5.2), y: centerY + 84 },
    { x: 8 + Math.sin(seed * 6.1), y: centerY + 48 },
    { x: -6 + Math.sin(seed * 7.3), y: centerY + 16 },
    { x: 7 + Math.sin(seed * 8.4), y: centerY - 14 },
    { x: -5 + Math.sin(seed * 6.8), y: centerY - 46 },
    { x: 6 + Math.sin(seed * 5.9), y: centerY - 84 },
  ];
}

function drawWhiteLightningAfterimage(g: Graphics, points: Array<{ x: number; y: number }>, alpha: number): void {
  const layers = [
    { offsetX: -2.4, offsetY: 0, width: 2.6, alphaScale: 0.28 },
    { offsetX: 2.4, offsetY: 0, width: 2.6, alphaScale: 0.28 },
  ];
  for (const layer of layers) {
    const shifted = points.map((point) => ({ x: point.x + layer.offsetX, y: point.y + layer.offsetY }));
    strokeLightningPathProgress(g, shifted, rgba(255, 255, 255, Math.round(alpha * layer.alphaScale)), layer.width, 1);
  }
}

function strokeLightningPathProgress(g: Graphics, points: Array<{ x: number; y: number }>, color: Color, width: number, progress: number): void {
  const amount = clamp(progress, 0, 1);
  if (amount <= 0) return;
  const segmentLengths = points.slice(1).map((point, index) => Math.hypot(point.x - points[index].x, point.y - points[index].y));
  const total = segmentLengths.reduce((sum, length) => sum + length, 0);
  let remaining = total * amount;
  g.strokeColor = color;
  g.lineWidth = width;
  g.moveTo(points[0].x, points[0].y);
  for (let i = 1; i < points.length; i += 1) {
    const prev = points[i - 1];
    const next = points[i];
    const length = segmentLengths[i - 1];
    if (remaining >= length) {
      g.lineTo(next.x, next.y);
      remaining -= length;
    } else {
      const t = remaining / Math.max(0.001, length);
      g.lineTo(prev.x + (next.x - prev.x) * t, prev.y + (next.y - prev.y) * t);
      break;
    }
  }
  g.stroke();
}

function drawLightningBranch(
  g: Graphics,
  branch: { x: number; y: number; endX: number; endY: number; kinkX?: number; kinkY?: number; midX?: number; midY?: number },
  progress: number,
  alpha: number,
  shadowWidth: number,
  coreWidth: number,
): void {
  const amount = clamp(progress, 0, 1);
  if (amount <= 0) return;
  const midX = branch.kinkX ?? branch.midX ?? (branch.x + branch.endX) * 0.5;
  const midY = branch.kinkY ?? branch.midY ?? (branch.y + branch.endY) * 0.5;
  const endX = branch.x + (branch.endX - branch.x) * amount;
  const endY = branch.y + (branch.endY - branch.y) * amount;
  const bendX = branch.x + (midX - branch.x) * amount;
  const bendY = branch.y + (midY - branch.y) * amount;
  g.strokeColor = rgba(28, 0, 64, Math.round(alpha * 0.86));
  g.lineWidth = shadowWidth;
  g.moveTo(branch.x, branch.y);
  g.lineTo(bendX, bendY);
  g.lineTo(endX, endY);
  g.stroke();
  g.strokeColor = rgba(255, 255, 255, alpha);
  g.lineWidth = coreWidth;
  g.moveTo(branch.x, branch.y);
  g.lineTo(bendX, bendY);
  g.lineTo(endX, endY);
  g.stroke();
}

function drawElectricSparks(
  g: Graphics,
  sparks: Array<{ angle: number; length: number; delay: number; bend: number; start: number }>,
  progress: number,
  fade: number,
): void {
  const centerY = 24;
  for (const spark of sparks) {
    const local = clamp((progress - spark.delay) / 0.3, 0, 1);
    if (local <= 0) continue;
    const startX = Math.cos(spark.angle) * spark.start;
    const startY = centerY + Math.sin(spark.angle) * spark.start;
    const endX = Math.cos(spark.angle) * spark.length * local;
    const endY = centerY + Math.sin(spark.angle) * spark.length * local;
    const midX = (startX + endX) * 0.5 + Math.cos(spark.angle + Math.PI / 2) * spark.bend * local;
    const midY = (startY + endY) * 0.5 + Math.sin(spark.angle + Math.PI / 2) * spark.bend * local;
    const alpha = Math.round((150 + 105 * local) * fade);
    g.strokeColor = rgba(255, 255, 255, alpha);
    g.lineWidth = 1 + 1.2 * (1 - local);
    g.moveTo(startX, startY);
    g.bezierCurveTo(midX, midY, midX, midY, endX, endY);
    g.stroke();
  }
}

function startFullScreenWhiteFade(overlay: Node, onDone: () => void): void {
  const fade = createNode(overlay, 'GachaWhiteFade', 0, 0, 390, 844);
  const g = fade.addComponent(Graphics);
  const keyframes = [
    { time: 0, alpha: 0 },
    { time: 0.93, alpha: 0 },
    { time: 1.03, alpha: 28 },
    { time: 1.13, alpha: 58 },
    { time: 1.25, alpha: 90 },
    { time: 1.38, alpha: 124 },
    { time: 1.52, alpha: 158 },
    { time: 1.67, alpha: 190 },
    { time: 1.85, alpha: 216 },
    { time: 2.04, alpha: 235 },
    { time: 2.23, alpha: 248 },
    { time: 2.41, alpha: 252 },
    { time: 2.59, alpha: 255 },
  ];
  const startedAt = Date.now();
  const timer = setInterval(() => {
    if (!overlay.isValid || !fade.isValid) {
      clearInterval(timer);
      return;
    }
    const elapsed = (Date.now() - startedAt) / 1000;
    const alpha = whiteFadeAlpha(keyframes, elapsed);
    g.clear();
    if (alpha > 0) {
      g.fillColor = rgba(255, 255, 255, Math.round(alpha));
      g.rect(-195, -422, 390, 844);
      g.fill();
    }
    if (elapsed >= keyframes[keyframes.length - 1].time + 0.18) {
      clearInterval(timer);
      onDone();
    }
  }, 16);
}

function whiteFadeAlpha(keyframes: Array<{ time: number; alpha: number }>, elapsed: number): number {
  for (let i = 1; i < keyframes.length; i += 1) {
    const previous = keyframes[i - 1];
    const next = keyframes[i];
    if (elapsed <= next.time) {
      const t = clamp((elapsed - previous.time) / Math.max(0.001, next.time - previous.time), 0, 1);
      return previous.alpha + (next.alpha - previous.alpha) * t;
    }
  }
  return keyframes[keyframes.length - 1].alpha;
}

function drawSilverStadium(g: Graphics): void {
  g.clear();
  g.fillColor = rgba(18, 24, 34);
  g.rect(-195, -422, 390, 844);
  g.fill();
  g.fillColor = rgba(224, 232, 239, 238);
  g.rect(-195, -422, 390, 844);
  g.fill();
  for (let i = 0; i < 8; i += 1) {
    const y = 320 - i * 42;
    g.fillColor = i % 2 === 0 ? rgba(248, 251, 255, 60) : rgba(147, 160, 174, 48);
    g.rect(-195, y, 390, 24);
    g.fill();
  }
  g.fillColor = rgba(196, 206, 216, 110);
  g.ellipse(0, 62, 230, 310);
  g.fill();
  g.fillColor = rgba(244, 248, 252, 165);
  g.ellipse(0, 54, 190, 254);
  g.fill();
  g.fillColor = rgba(174, 186, 198, 105);
  g.rect(-172, -128, 344, 256);
  g.fill();
  g.strokeColor = rgba(255, 255, 255, 180);
  g.lineWidth = 3;
  g.rect(-148, -106, 296, 212);
  g.stroke();
  g.moveTo(-148, 0);
  g.lineTo(148, 0);
  g.stroke();
  g.circle(0, 0, 42);
  g.stroke();
  for (let i = 0; i < 6; i += 1) {
    const x = -155 + i * 62;
    g.fillColor = rgba(255, 255, 255, 42);
    g.rect(x, -422, 30, 844);
    g.fill();
  }
  g.fillColor = rgba(255, 255, 255, 74);
  g.ellipse(-110, 246, 85, 32);
  g.fill();
  g.ellipse(112, 244, 85, 32);
  g.fill();
}

function drawStormStadium(g: Graphics): void {
  g.clear();
  g.fillColor = rgba(5, 7, 14);
  g.rect(-195, -422, 390, 844);
  g.fill();
  g.fillColor = rgba(19, 13, 35, 238);
  g.rect(-195, -422, 390, 844);
  g.fill();
  g.fillColor = rgba(52, 29, 84, 100);
  g.ellipse(-92, 260, 190, 68);
  g.fill();
  g.ellipse(122, 238, 210, 74);
  g.fill();
  for (let i = 0; i < 8; i += 1) {
    const y = 320 - i * 42;
    g.fillColor = i % 2 === 0 ? rgba(19, 80, 54, 118) : rgba(12, 58, 45, 138);
    g.rect(-195, y, 390, 24);
    g.fill();
  }
  g.fillColor = rgba(4, 30, 26, 208);
  g.ellipse(0, 58, 230, 310);
  g.fill();
  g.fillColor = rgba(13, 74, 50, 174);
  g.ellipse(0, 54, 190, 254);
  g.fill();
  g.fillColor = rgba(4, 36, 32, 190);
  g.rect(-172, -128, 344, 256);
  g.fill();
  g.strokeColor = rgba(124, 156, 172, 138);
  g.lineWidth = 3;
  g.rect(-148, -106, 296, 212);
  g.stroke();
  g.moveTo(-148, 0);
  g.lineTo(148, 0);
  g.stroke();
  g.circle(0, 0, 42);
  g.stroke();
  g.fillColor = rgba(0, 0, 0, 88);
  g.rect(-195, -422, 390, 844);
  g.fill();
}

function startRainEffect(overlay: Node): void {
  findNode(overlay, 'GachaRainLayer')?.destroy();
  const rain = createNode(overlay, 'GachaRainLayer', 0, 0, 390, 844);
  const g = rain.addComponent(Graphics);
  const drops = Array.from({ length: 72 }, () => ({
    x: -220 + Math.random() * 440,
    y: -430 + Math.random() * 890,
    length: 18 + Math.random() * 24,
    speed: 420 + Math.random() * 260,
    drift: 44 + Math.random() * 28,
    alpha: 52 + Math.random() * 62,
  }));
  let lastTime = Date.now();
  const timer = setInterval(() => {
    if (!overlay.isValid || !rain.isValid) {
      clearInterval(timer);
      return;
    }
    const now = Date.now();
    const dt = Math.min(0.05, Math.max(0.001, (now - lastTime) / 1000));
    lastTime = now;
    g.clear();
    for (const drop of drops) {
      drop.y -= drop.speed * dt;
      drop.x += drop.drift * dt;
      if (drop.y < -450 || drop.x > 230) {
        drop.y = 440 + Math.random() * 80;
        drop.x = -230 + Math.random() * 430;
      }
      g.strokeColor = rgba(190, 210, 242, drop.alpha);
      g.lineWidth = 1.4;
      g.moveTo(drop.x, drop.y);
      g.lineTo(drop.x + drop.length * 0.3, drop.y - drop.length);
      g.stroke();
    }
  }, 33);
}

function drawBallWindow(g: Graphics): void {
  g.clear();
  g.fillColor = rgba(16, 24, 36, 170);
  g.rect(-175, -77, 350, 154);
  g.fill();
  g.strokeColor = rgba(255, 255, 255, 210);
  g.lineWidth = 3;
  g.rect(-175, -77, 350, 154);
  g.stroke();
  g.strokeColor = rgba(255, 221, 92, 84);
  g.lineWidth = 8;
  g.rect(-42, -67, 84, 134);
  g.stroke();
  g.strokeColor = rgba(255, 221, 92, 232);
  g.lineWidth = 3;
  g.rect(-37, -62, 74, 124);
  g.stroke();
}

function createGachaBall(parent: Node, name: string, x: number, y: number, rarity: PlayerRarity, radius: number): Node {
  const ball = createNode(parent, name, x, y, radius * 2 + 8, radius * 2 + 8);
  const g = ball.addComponent(Graphics);
  drawGachaBall(g, rarity, radius);
  return ball;
}

function repaintGachaBall(ball: Node, rarity: PlayerRarity, radius: number): void {
  const g = ball.getComponent(Graphics) || ball.addComponent(Graphics);
  drawGachaBall(g, rarity, radius);
}

function drawGachaBall(g: Graphics, rarity: PlayerRarity, radius: number): void {
  const color = ballColor(rarity);
  g.clear();
  g.fillColor = rgba(0, 0, 0, 80);
  g.ellipse(5, -radius - 5, radius * 0.78, radius * 0.18);
  g.fill();
  g.fillColor = rgba(Math.max(0, color.r - 70), Math.max(0, color.g - 70), Math.max(0, color.b - 70));
  g.circle(0, 0, radius);
  g.fill();
  g.fillColor = color;
  g.circle(-3, 4, radius * 0.86);
  g.fill();
  g.fillColor = rgba(255, 255, 255, 96);
  g.circle(-radius * 0.32, radius * 0.36, radius * 0.28);
  g.fill();
  g.strokeColor = rgba(255, 255, 255, 230);
  g.lineWidth = Math.max(2, radius * 0.08);
  g.circle(0, 0, radius * 0.88);
  g.stroke();
  g.strokeColor = rgba(255, 255, 255, 155);
  g.lineWidth = Math.max(1.2, radius * 0.045);
  g.moveTo(-radius * 0.78, -radius * 0.08);
  g.bezierCurveTo(-radius * 0.18, radius * 0.18, radius * 0.2, radius * 0.18, radius * 0.78, -radius * 0.08);
  g.stroke();
  g.moveTo(-radius * 0.22, -radius * 0.82);
  g.bezierCurveTo(-radius * 0.06, -radius * 0.24, radius * 0.06, radius * 0.24, radius * 0.22, radius * 0.82);
  g.stroke();
  g.fillColor = rgba(255, 255, 255, 205);
  for (let i = 0; i < 5; i += 1) {
    const angle = -Math.PI / 2 + i * Math.PI * 0.4;
    g.circle(Math.cos(angle) * radius * 0.42, Math.sin(angle) * radius * 0.42, radius * 0.1);
    g.fill();
  }
}

function ballColor(rarity: PlayerRarity): Color {
  if (rarity === 'red') return rgba(238, 58, 72);
  if (rarity === 'orange') return rgba(255, 142, 35);
  if (rarity === 'purple') return rgba(146, 84, 230);
  return rgba(55, 143, 238);
}

function drawPackCard(card: Node, pack: PackMeta): void {
  const g = card.getComponent(Graphics) || card.addComponent(Graphics);
  g.clear();
  g.fillColor = pack.bottomColor;
  g.rect(-PACK_CARD_WIDTH / 2, -PACK_CARD_HEIGHT / 2 - 7, PACK_CARD_WIDTH, PACK_CARD_HEIGHT);
  g.fill();
  g.fillColor = rgba(13, 46, 94);
  g.rect(-PACK_CARD_WIDTH / 2, -PACK_CARD_HEIGHT / 2, PACK_CARD_WIDTH, PACK_CARD_HEIGHT);
  g.fill();
  g.strokeColor = rgba(255, 255, 255, 170);
  g.lineWidth = 1.5;
  g.rect(-PACK_CARD_WIDTH / 2 + 2, -PACK_CARD_HEIGHT / 2 + 2, PACK_CARD_WIDTH - 4, PACK_CARD_HEIGHT - 4);
  g.stroke();
  g.fillColor = rgba(255, 255, 255, 24);
  g.rect(-PACK_CARD_WIDTH / 2 + 8, PACK_CARD_HEIGHT / 2 - 28, PACK_CARD_WIDTH - 16, 16);
  g.fill();
}

function drawPackCover(cover: Node, pack: PackMeta, index: number): void {
  const size = cover.getComponent(UITransform)?.contentSize;
  const width = size?.width || 138;
  const height = size?.height || 104;
  const g = cover.getComponent(Graphics) || cover.addComponent(Graphics);
  g.clear();
  g.fillColor = pack.bottomColor;
  g.rect(-width / 2, -height / 2, width, height);
  g.fill();
  g.fillColor = pack.topColor;
  g.moveTo(-width / 2, height / 2);
  g.lineTo(width / 2, height / 2);
  g.lineTo(width / 2, -height / 2 + 18);
  g.bezierCurveTo(width * 0.12, -height * 0.18, -width * 0.22, height * 0.1, -width / 2, -height / 2 + 8);
  g.close();
  g.fill();
  g.fillColor = rgba(255, 246, 130, 225);
  const starY = [14, 6, 18, 10][index];
  g.moveTo(0, starY + 34);
  g.lineTo(10, starY + 8);
  g.lineTo(37, starY + 8);
  g.lineTo(15, starY - 7);
  g.lineTo(24, starY - 33);
  g.lineTo(0, starY - 16);
  g.lineTo(-24, starY - 33);
  g.lineTo(-15, starY - 7);
  g.lineTo(-37, starY + 8);
  g.lineTo(-10, starY + 8);
  g.close();
  g.fill();
  g.strokeColor = rgba(255, 255, 255, 210);
  g.lineWidth = 2;
  g.rect(-width / 2 + 2, -height / 2 + 2, width - 4, height - 4);
  g.stroke();
}

function resultX(index: number, total: number): number {
  const columns = total === 1 ? 1 : RESULT_COLUMNS;
  const col = index % columns;
  const rowCount = Math.min(total, columns);
  const totalWidth = rowCount * RESULT_CARD_WIDTH + Math.max(0, rowCount - 1) * RESULT_GAP_X;
  return -totalWidth / 2 + RESULT_CARD_WIDTH / 2 + col * (RESULT_CARD_WIDTH + RESULT_GAP_X);
}

function resultY(index: number, total: number): number {
  if (total === 1) return 0;
  const row = Math.floor(index / RESULT_COLUMNS);
  return 52 - row * (RESULT_CARD_HEIGHT + RESULT_GAP_Y);
}

function playLightningSfx(volume: number): void {
  const source = ensureSfxSource();
  if (lightningClip) {
    source.playOneShot(lightningClip, volume);
    return;
  }
  pendingLightningVolumes.push(volume);
  loadLightningClip();
}

function playTearSfx(volume: number): void {
  const source = ensureSfxSource();
  if (tearClip) {
    source.playOneShot(tearClip, volume);
    return;
  }
  pendingTearVolumes.push(volume);
  loadTearClip();
}

function preloadLightningSfx(): void {
  loadLightningClip();
  loadTearClip();
}

function loadLightningClip(): void {
  if (lightningClip || lightningClipLoading) return;
  lightningClipLoading = true;
  resources.load(LIGHTNING_SFX_PATH, AudioClip, (error, clip) => {
    lightningClipLoading = false;
    if (error || !clip) {
      pendingLightningVolumes.length = 0;
      return;
    }
    lightningClip = clip;
    const source = ensureSfxSource();
    const volumes = pendingLightningVolumes.splice(0);
    for (const pendingVolume of volumes) {
      source.playOneShot(clip, pendingVolume);
    }
  });
}

function loadTearClip(): void {
  if (tearClip || tearClipLoading) return;
  tearClipLoading = true;
  resources.load(TEAR_SFX_PATH, AudioClip, (error, clip) => {
    tearClipLoading = false;
    if (error || !clip) {
      pendingTearVolumes.length = 0;
      return;
    }
    tearClip = clip;
    const source = ensureSfxSource();
    const volumes = pendingTearVolumes.splice(0);
    for (const pendingVolume of volumes) {
      source.playOneShot(clip, pendingVolume);
    }
  });
}

function ensureSfxSource(): AudioSource {
  if (sfxSource && sfxSource.node.isValid) return sfxSource;
  const node = new Node('GlobalSfxPlayer');
  sfxSource = node.addComponent(AudioSource);
  sfxSource.volume = 1;
  director.addPersistRootNode(node);
  return sfxSource;
}

function bindButton(node: Node | null, handler: () => void): void {
  if (!node) return;
  node.on(Node.EventType.TOUCH_END, (event: EventTouch) => {
    event.propagationStopped = true;
    handler();
  });
}

function bindTap(node: Node, handler: () => void): void {
  let startX = 0;
  let startY = 0;
  let moved = false;
  node.on(Node.EventType.TOUCH_START, (event: EventTouch) => {
    const point = event.getUILocation();
    startX = point.x;
    startY = point.y;
    moved = false;
  });
  node.on(Node.EventType.TOUCH_MOVE, (event: EventTouch) => {
    const point = event.getUILocation();
    if (Math.abs(point.x - startX) > 8 || Math.abs(point.y - startY) > 8) moved = true;
  });
  node.on(Node.EventType.TOUCH_END, (event: EventTouch) => {
    if (moved) return;
    event.propagationStopped = true;
    handler();
  });
}

function createOverlay(root: Node, name: string, color: Color): Node {
  findNode(root, name)?.destroy();
  const overlay = createNode(root, name, 0, 0, 390, 844);
  const g = overlay.addComponent(Graphics);
  g.fillColor = color;
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
  const panel = createNode(parent, name, x, y, width, height);
  const g = panel.addComponent(Graphics);
  g.fillColor = rgba(18, 47, 88, 248);
  g.rect(-width / 2, -height / 2, width, height);
  g.fill();
  g.strokeColor = rgba(112, 177, 255, 210);
  g.lineWidth = 2;
  g.rect(-width / 2 + 2, -height / 2 + 2, width - 4, height - 4);
  g.stroke();
  return panel;
}

function createNode(parent: Node, name: string, x: number, y: number, width: number, height: number): Node {
  const node = new Node(name);
  node.layer = parent.layer;
  parent.addChild(node);
  node.setPosition(x, y);
  node.addComponent(UITransform).setContentSize(width, height);
  return node;
}

function createRuntimeLabel(parent: Node, name: string, value: string, x: number, y: number, fontSize: number, width: number, height: number, textColor: Color, bold = false): Label {
  const node = createNode(parent, name, x, y, width, height);
  const label = node.addComponent(Label);
  label.string = value;
  label.fontSize = fontSize;
  label.lineHeight = fontSize + 5;
  label.isBold = bold;
  label.cacheMode = Label.CacheMode.NONE;
  label.color = textColor;
  label.horizontalAlign = Label.HorizontalAlign.CENTER;
  label.verticalAlign = Label.VerticalAlign.CENTER;
  label.enableWrapText = false;
  label.overflow = Label.Overflow.SHRINK;
  return label;
}

function createRuntimeButton(parent: Node, name: string, text: string, x: number, y: number, width: number, height: number, color: Color, handler: () => void): Node {
  const button = createNode(parent, name, x, y, width, height);
  const g = button.addComponent(Graphics);
  drawRuntimeButton(g, width, height, color, false);
  createRuntimeLabel(button, `${name}_Label`, text, 0, 0, 15, width - 4, height, rgba(255, 255, 255), true);
  button.on(Node.EventType.TOUCH_START, (event: EventTouch) => {
    event.propagationStopped = true;
    drawRuntimeButton(g, width, height, color, true);
  });
  button.on(Node.EventType.TOUCH_CANCEL, (event: EventTouch) => {
    event.propagationStopped = true;
    drawRuntimeButton(g, width, height, color, false);
  });
  button.on(Node.EventType.TOUCH_END, (event: EventTouch) => {
    event.propagationStopped = true;
    drawRuntimeButton(g, width, height, color, false);
    handler();
  });
  return button;
}

function drawRuntimeButton(g: Graphics, width: number, height: number, color: Color, pressed: boolean): void {
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

function disableSprite(node: Node): void {
  const sprite = node.getComponent(Sprite);
  if (sprite) sprite.enabled = false;
}

function setLabelText(root: Node, nodeName: string, text: string): void {
  const label = findNode(root, nodeName)?.getComponent(Label);
  if (label) label.string = text;
}

function setLabelStyle(root: Node, nodeName: string, text: string, fontSize: number): void {
  const label = findNode(root, nodeName)?.getComponent(Label);
  if (!label) return;
  label.string = text;
  label.fontSize = fontSize;
  label.lineHeight = fontSize + 4;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
