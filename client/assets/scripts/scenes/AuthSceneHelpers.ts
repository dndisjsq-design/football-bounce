import { Label, Node } from 'cc';
import { findNode, rgba } from '../utils/CocosNodeUtils';

export function setAuthMessage(root: Node, nodeName: string, message: string, neutral = true): void {
  const label = findNode(root, nodeName)?.getComponent(Label);
  if (!label) return;
  label.string = message;
  label.color = neutral ? rgba(154, 176, 205, 255) : rgba(255, 112, 112, 255);
}
