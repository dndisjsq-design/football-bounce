import { director, Graphics, Label, Node, Sprite } from 'cc';
import { MatchMode } from '../MatchTypes';
import { getCurrentUserDisplayName, logoutCurrentDevice } from '../services/AuthService';
import { findNode, onTap, rgba } from '../utils/CocosNodeUtils';

export function bindHomeScene(root: Node, selectMatchMode: (mode: MatchMode) => void): void {
  bindTabs(root, 'home');
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
