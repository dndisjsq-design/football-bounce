import { Color, EditBox, Label, Node, Sprite, UIOpacity, UITransform } from 'cc';
import { findNode, rgba } from './CocosNodeUtils';

const caretTimers = new WeakMap<Node, number>();

export function ensureEditBox(root: Node, nodeName: string, placeholder: string, password: boolean): EditBox | null {
  const node = findNode(root, nodeName);
  if (!node) return null;
  const transform = node.getComponent(UITransform) || node.addComponent(UITransform);
  const width = transform.contentSize.width || 276;
  const height = transform.contentSize.height || 46;
  const background = node.getComponent(Sprite);
  if (background) {
    background.enabled = true;
    background.color = rgba(255, 255, 255, 255);
  }
  const editBox = node.getComponent(EditBox) || node.addComponent(EditBox);
  editBox.inputMode = EditBox.InputMode.SINGLE_LINE;
  editBox.inputFlag = password ? EditBox.InputFlag.PASSWORD : EditBox.InputFlag.DEFAULT;
  editBox.returnType = EditBox.KeyboardReturnType.DONE;
  editBox.maxLength = 32;
  editBox.placeholder = placeholder;
  editBox.backgroundImage = background?.spriteFrame || editBox.backgroundImage;
  editBox.textLabel = ensureEditBoxLabel(node, `${nodeName}_TextLabel`, '', rgba(22, 31, 44, 255), width, height);
  editBox.placeholderLabel = ensureEditBoxLabel(node, `${nodeName}_PlaceholderLabel`, placeholder, rgba(126, 139, 156, 255), width, height);
  ensureCaret(editBox, node, width, height, password);
  return editBox;
}

function ensureEditBoxLabel(parent: Node, name: string, value: string, color: Color, width: number, height: number): Label {
  let node = parent.getChildByName(name);
  if (!node) {
    node = new Node(name);
    parent.addChild(node);
    node.layer = parent.layer;
    node.addComponent(UITransform);
    node.addComponent(Label);
  }
  const transform = node.getComponent(UITransform) || node.addComponent(UITransform);
  transform.setContentSize(Math.max(10, width - 24), height);
  transform.setAnchorPoint(0, 1);
  node.setPosition(-width / 2 + 12, height / 2, 0);
  const label = node.getComponent(Label) || node.addComponent(Label);
  label.string = value;
  label.fontSize = 15;
  label.lineHeight = 20;
  label.color = color;
  label.horizontalAlign = Label.HorizontalAlign.LEFT;
  label.verticalAlign = Label.VerticalAlign.CENTER;
  label.overflow = Label.Overflow.NONE;
  label.enableWrapText = false;
  label.cacheMode = Label.CacheMode.NONE;
  return label;
}

function ensureCaret(editBox: EditBox, parent: Node, width: number, height: number, password: boolean): void {
  const caret = ensureCaretNode(parent);
  const showCaret = (): void => {
    updateCaretPosition(caret, editBox, width, password);
    caret.active = true;
    const opacity = caret.getComponent(UIOpacity) || caret.addComponent(UIOpacity);
    opacity.opacity = 255;
    const oldTimer = caretTimers.get(caret);
    if (oldTimer !== undefined) clearInterval(oldTimer);
    const timer = setInterval(() => {
      if (!caret.isValid || !caret.active) {
        clearInterval(timer);
        return;
      }
      opacity.opacity = opacity.opacity > 0 ? 0 : 255;
    }, 520);
    caretTimers.set(caret, timer);
  };
  const hideCaret = (): void => {
    const timer = caretTimers.get(caret);
    if (timer !== undefined) clearInterval(timer);
    caretTimers.delete(caret);
    caret.active = false;
  };

  parent.off('editing-did-began');
  parent.off('editing-did-ended');
  parent.off('text-changed');
  parent.off(Node.EventType.TOUCH_START);
  parent.on(Node.EventType.TOUCH_START, showCaret);
  parent.on('editing-did-began', showCaret);
  parent.on('editing-did-ended', hideCaret);
  parent.on('text-changed', () => {
    updateCaretPosition(caret, editBox, width, password);
  });
  caret.active = false;
  caret.setPosition(-width / 2 + 12, 0);

  const transform = caret.getComponent(UITransform) || caret.addComponent(UITransform);
  transform.setContentSize(2, Math.min(24, height - 16));
}

function ensureCaretNode(parent: Node): Node {
  let caret = parent.getChildByName('InputCaret');
  if (!caret) {
    caret = new Node('InputCaret');
    parent.addChild(caret);
    caret.layer = parent.layer;
    caret.addComponent(UITransform);
    caret.addComponent(Sprite);
    caret.addComponent(UIOpacity);
  }
  const sprite = caret.getComponent(Sprite) || caret.addComponent(Sprite);
  const parentSprite = parent.getComponent(Sprite);
  sprite.spriteFrame = parentSprite?.spriteFrame || sprite.spriteFrame;
  sprite.color = rgba(22, 31, 44, 255);
  return caret;
}

function updateCaretPosition(caret: Node, editBox: EditBox, width: number, password: boolean): void {
  const text = editBox.string || '';
  const visibleText = password ? '*'.repeat(text.length) : text;
  const textWidth = Math.min(width - 26, estimateTextWidth(visibleText));
  caret.setPosition(-width / 2 + 12 + textWidth + 2, 0);
}

function estimateTextWidth(text: string): number {
  let width = 0;
  for (const ch of text) {
    width += ch.charCodeAt(0) > 255 ? 15 : 8.5;
  }
  return width;
}
