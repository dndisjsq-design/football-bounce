import { director, Node } from 'cc';
import { authMessage, registerAccount } from '../services/AuthService';
import { onTap } from '../utils/CocosNodeUtils';
import { ensureEditBox } from '../utils/EditBoxUtils';
import { setAuthMessage } from './AuthSceneHelpers';

export function bindRegisterScene(root: Node): void {
  const usernameInput = ensureEditBox(root, 'InputRegisterAccount', '', false);
  const passwordInput = ensureEditBox(root, 'InputRegisterPassword', '', true);
  const confirmInput = ensureEditBox(root, 'InputRegisterConfirm', '', true);
  setAuthMessage(root, 'TextRegisterHint', '');
  onTap(root, 'ButtonBackLogin', () => director.loadScene('Login'));
  onTap(root, 'ButtonRegisterSubmit', () => {
    const username = (usernameInput?.string || '').trim();
    const password = passwordInput?.string || '';
    const confirmPassword = confirmInput?.string || '';
    if (!username || !password || !confirmPassword) {
      setAuthMessage(root, 'TextRegisterHint', '请输入账号、密码和确认密码', false);
      return;
    }
    if (password !== confirmPassword) {
      setAuthMessage(root, 'TextRegisterHint', '两次输入的密码不一致', false);
      return;
    }
    setAuthMessage(root, 'TextRegisterHint', '注册中...', true);
    void registerAccount(username, password).then((response) => {
      if (response.code === 'SUCCESS') {
        director.loadScene('Login');
        return;
      }
      setAuthMessage(root, 'TextRegisterHint', authMessage(response), false);
    }).catch((error: Error) => {
      setAuthMessage(root, 'TextRegisterHint', error.message || '无法连接服务器', false);
    });
  });
}
