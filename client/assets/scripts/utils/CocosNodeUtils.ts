import { Camera, Color, EventTouch, Label, Node, Sprite, UITransform, Vec3 } from 'cc';

export function findNode(root: Node, name: string): Node | null {
  if (root.name === name) return root;
  for (const child of root.children) {
    const found = findNode(child, name);
    if (found) return found;
  }
  return null;
}

export function rgba(r: number, g: number, b: number, a = 255): Color {
  return new Color(r, g, b, a);
}

export function onTap(root: Node, nodeName: string, handler: () => void): void {
  const target = findNode(root, nodeName);
  if (!target) return;
  target.on(Node.EventType.TOUCH_END, handler);
}

export function onTapExpanded(root: Node, nodeName: string, extraX: number, extraY: number, handler: () => void): void {
  const target = findNode(root, nodeName);
  const targetTransform = target?.getComponent(UITransform);
  if (!target || !targetTransform) return;
  root.on(Node.EventType.TOUCH_END, (event: EventTouch) => {
    const ui = event.getUILocation();
    const local = targetTransform.convertToNodeSpaceAR(new Vec3(ui.x, ui.y));
    const size = targetTransform.contentSize;
    if (Math.abs(local.x) <= size.width / 2 + extraX && Math.abs(local.y) <= size.height / 2 + extraY) {
      handler();
    }
  }, undefined, true);
}

export function ensureCameraClearsFrame(root: Node): void {
  const camera = findNode(root, 'UICamera_Canvas')?.getComponent(Camera);
  if (!camera) return;
  camera.clearFlags = Camera.ClearFlag.SOLID_COLOR;
  camera.clearColor = rgba(0, 0, 0, 255);
}

export function cleanTextRenderers(root: Node): void {
  const label = root.getComponent(Label);
  if (label) {
    label.cacheMode = Label.CacheMode.NONE;
    label.overflow = Label.Overflow.NONE;
    label.enableWrapText = false;
    const sprite = root.getComponent(Sprite);
    if (sprite) sprite.enabled = false;
  }
  for (const child of root.children) cleanTextRenderers(child);
}
