import {
  _decorator,
  Component,
  director,
  profiler,
} from 'cc';
import { EditableMatch } from './match/EditableMatch';
import { LocalMatchTransport, OnlineMatchTransport } from './MatchTransport';
import { MatchMode } from './MatchTypes';
import { bindLoginScene } from './scenes/LoginSceneController';
import { bindHomeScene, bindProfileScene, bindTabs } from './scenes/MainSceneController';
import { bindPlayersScene } from './scenes/PlayersSceneController';
import { bindRegisterScene } from './scenes/RegisterSceneController';
import { bindShopPackScene } from './scenes/ShopPackSceneController';
import { bindShopFormationScene, bindShopHomeScene, bindShopPlayerScene } from './scenes/ShopSceneController';
import { consumeSelectedReplayMatchId } from './services/MatchRecordService';
import { MusicManager } from './services/MusicManager';
import { consumeSelectedOnlineMatch } from './services/OnlineMatchService';
import { cleanTextRenderers, ensureCameraClearsFrame, findNode, onTap } from './utils/CocosNodeUtils';

const { ccclass } = _decorator;

let selectedMatchMode: MatchMode = 'ai';

@ccclass('App')
export class App extends Component {
  private match: EditableMatch | null = null;

  start(): void {
    profiler.hideStats();
    ensureCameraClearsFrame(this.node);
    cleanTextRenderers(this.node);
    const sceneName = director.getScene()?.name || '';
    MusicManager.instance.play(sceneName === 'Match' ? 'match' : 'menu');
    if (sceneName === 'Main') {
      director.loadScene('Login');
      return;
    }
    if (sceneName === 'Login') bindLoginScene(this.node);
    if (sceneName === 'Register') bindRegisterScene(this.node);
    if (sceneName === 'Home') bindHomeScene(this.node, (mode) => { selectedMatchMode = mode; });
    if (sceneName === 'Players') bindPlayersScene(this.node);
    if (sceneName === 'Shop') bindShopHomeScene(this.node);
    if (sceneName === 'ShopFormations') bindShopFormationScene(this.node);
    if (sceneName === 'ShopNormalPlayers') bindShopPlayerScene(this.node, ['purple', 'blue']);
    if (sceneName === 'ShopLegendPlayers') bindShopPlayerScene(this.node, ['red', 'orange']);
    if (sceneName === 'ShopPacks') bindShopPackScene(this.node);
    if (sceneName === 'Profile') bindProfileScene(this.node);
    if (sceneName === 'Match') this.bindMatch();
  }

  update(dt: number): void {
    this.match?.tick(Math.min(dt, 1 / 30));
  }

  onDestroy(): void {
    this.match?.dispose();
    this.match = null;
  }

  private bindMatch(): void {
    const replayMatchId = consumeSelectedReplayMatchId();
    const onlineMatch = selectedMatchMode === 'online' && !replayMatchId ? consumeSelectedOnlineMatch() : null;
    const lockedOnlineMatch = selectedMatchMode === 'online' && !replayMatchId;
    const backButton = findNode(this.node, 'ButtonBackHome');
    if (lockedOnlineMatch) {
      if (backButton) backButton.active = false;
    } else {
      onTap(this.node, 'ButtonBackHome', () => {
        this.match?.dispose();
        this.match = null;
        director.loadScene('Home');
      });
    }
    const transport = selectedMatchMode === 'online' && !replayMatchId ? new OnlineMatchTransport(onlineMatch) : new LocalMatchTransport();
    this.match = new EditableMatch(this.node, replayMatchId ? 'ai' : selectedMatchMode, transport, replayMatchId, onlineMatch);
    this.match.start();
  }
}
